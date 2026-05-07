import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { Chapter, ChapterVersion, Novel, Architecture } from '../../models/sequelize';
import * as ragService from '../../services/ragService';
import * as chapterMemoryService from '../../services/chapterMemoryService';
import { createLLM } from '../llmFactory';
import { createProgressTracker } from '../progressAdapter';
import { invokeWithStreaming } from '../streaming';
import { strictJsonOutputRules } from '../jsonUtils';

const STEPS = ['构建上下文', '修订章节', '保存结果', '提取记忆'];

const ChapterRevisionState = Annotation.Root({
  // Inputs
  chapterId: Annotation<number>,
  reviewResult: Annotation<any>,
  userPrompt: Annotation<string>,
  signal: Annotation<AbortSignal | undefined>,
  taskId: Annotation<string | null>,

  // Intermediate
  chapter: Annotation<any>,
  novel: Annotation<any>,
  reviewContext: Annotation<any>,
  revisionResult: Annotation<any>,

  // Output
  updatedChapter: Annotation<any>,
});

function formatArchitecture(architecture: any): string {
  if (!architecture) return '无';
  return `层级: ${architecture.level}\n标题: ${architecture.title}\n情节: ${architecture.plot_outline || ''}\n`;
}

function formatRelevantEvidence(reviewContext: any = {}): string {
  const relevantMemories = Array.isArray(reviewContext.relevantMemories) ? reviewContext.relevantMemories : [];
  const sourceExcerpts = Array.isArray(reviewContext.sourceExcerpts) ? reviewContext.sourceExcerpts : [];
  const storyBibleEntries = Array.isArray(reviewContext.storyBibleEntries) ? reviewContext.storyBibleEntries : [];
  const retrievedChunks = Array.isArray(reviewContext.retrievedChunks) ? reviewContext.retrievedChunks : [];
  const previousChapterContent = reviewContext.previousChapterContent || '';

  const sections: string[] = [];

  if (previousChapterContent) {
    const previousEnding = previousChapterContent
      .split(/\n+/)
      .map((part: string) => part.trim())
      .filter(Boolean)
      .slice(-2)
      .join('\n\n');
    if (previousEnding) {
      sections.push(`### 上一章结尾\n${previousEnding}`);
    }
  }

  if (storyBibleEntries.length > 0) {
    sections.push([
      '### 故事圣经约束',
      ...storyBibleEntries.slice(0, 4).map((entry: any) => `- ${entry.title || '未命名条目'}：${entry.content || ''}`),
    ].join('\n'));
  }

  relevantMemories.slice(0, 6).forEach((memory: any, index: number) => {
    const facts = Array.isArray(memory.facts)
      ? memory.facts.map((fact: any) => `- ${fact.subject || ''} ${fact.predicate || ''} ${fact.object || ''}`.trim()).join('\n')
      : '';
    const excerpt = sourceExcerpts[index]?.excerpt || '';
    sections.push([
      `### 第${memory.chapter_number || sourceExcerpts[index]?.chapterNumber || '?'}章`,
      memory.summary ? `概要：${memory.summary}` : '',
      facts ? `事实：\n${facts}` : '',
      excerpt ? `证据段落：${excerpt}` : '',
    ].filter(Boolean).join('\n'));
  });

  retrievedChunks.slice(0, 4).forEach((chunk: any) => {
    sections.push([
      `### 历史正文片段（第${chunk.chapterNumber || '?'}章）`,
      chunk.text || '',
    ].filter(Boolean).join('\n'));
  });

  return sections.length ? sections.join('\n\n') : '无';
}

function buildRevisionPrompt(
  chapter: any,
  novel: any,
  architecture: any,
  reviewResult: any,
  userPrompt: string = '',
  reviewContext: any = {}
): string {
  const originalLength = (chapter.content || '').length;
  return `你是一位专业的网络小说编辑，请根据审阅意见修订章节。

## 章节信息
标题：${chapter.title || ''}
序号：第${chapter.chapter_number}章
正文：${(chapter.content || '')}...
原文字数：约${originalLength}字

## 小说信息
标题：${novel.title}
类型：${novel.genre || ''}

## 架构信息
${formatArchitecture(architecture)}

## 审阅意见
${JSON.stringify(reviewResult.issues || [], null, 2)}

## 相关历史证据
${formatRelevantEvidence(reviewContext)}

## 用户补充要求
${userPrompt?.trim() || '无'}

## 要求
请生成修订后的章节内容，保留原有风格，只修复问题。
如果“用户补充要求”与审阅意见不冲突，优先吸收；如果冲突，请以修复硬逻辑问题为先，同时尽量满足用户意图。
修订后的正文篇幅要保持在 5000 字左右，尽量接近原文体量，不要为了修订问题而大幅压缩剧情、删减场景或改写成摘要版。
除非审阅意见明确要求删除重复内容或明显无效内容，否则不要随意删段；优先局部改写、补充衔接、修正细节，而不是整体缩写。

## 允许修改范围
- 与审阅意见直接相关的句子、段落、承接描写、物品/人物状态描述
- 为修复硬逻辑问题所需的少量过渡句、补充动作和因果说明
- 与用户补充要求一致且不破坏主线的局部表达

## 禁止修改范围
- 不要改变本章核心事件顺序和结局，除非审阅意见明确指出该处有硬逻辑错误
- 不要新增主线人物、世界规则、关键物品或大段新剧情
- 不要把完整章节改写成摘要，不要删除无关但正确的场景
- 不要覆盖历史证据中已经成立的事实

请返回JSON格式：{ "revisedContent": "string", "summary": "string", "appliedIssues": ["string"] }
${strictJsonOutputRules()}`;
}

// Node: load and validate context
async function loadContextNode(state: typeof ChapterRevisionState.State) {
  let chapter: any = await Chapter.findByPk(state.chapterId);
  if (!chapter) throw new Error('章节不存在');
  if (!chapter.content || !chapter.content.trim()) {
    throw new Error('章节正文为空，无法生成修订建议稿');
  }

  const novel = await Novel.findByPk(chapter.novel_id);
  if (!novel) throw new Error('小说不存在');

  console.log(`[chapter-revise] 开始修订: chapterId=${state.chapterId} title="${chapter.title || '未命名'}"`);
  if (state.taskId) {
    const tracker = createProgressTracker(state.taskId, STEPS);
    tracker.start(`修订「${chapter.title || '章节'}」`);
  }

  return { chapter, novel };
}

// Node: build review context
async function buildContextNode(state: typeof ChapterRevisionState.State) {
  if (state.taskId) {
    const tracker = createProgressTracker(state.taskId, STEPS);
    tracker.step(0);
  }

  const reviewContext = await ragService.buildRetrievalContext(
    Number(state.chapterId),
    {
      signal: state.signal,
      preloaded: {
        chapter: state.chapter,
        novel: state.novel,
      },
    }
  );
  return { reviewContext };
}

// Node: call LLM for revision
async function runRevisionNode(state: typeof ChapterRevisionState.State) {
  console.log(`[chapter-revise] 调用 LLM 修订章节... chapterId=${state.chapterId}`);
  if (state.taskId) {
    const tracker = createProgressTracker(state.taskId, STEPS);
    tracker.step(1);
  }

  const llm = await createLLM({ temperature: 0.7, maxTokens: 40000, provider: 'deepseek' });
  const prompt = buildRevisionPrompt(
    state.chapter,
    state.novel,
    state.reviewContext?.architecture,
    state.reviewResult,
    state.userPrompt,
    state.reviewContext
  );

  const content = await invokeWithStreaming(
    llm,
    [new HumanMessage(prompt)],
    { signal: state.signal, taskId: state.taskId, resetStream: true }
  );
  console.log(`[chapter-revise] LLM 修订完成，字数: ${content.length}`);

  let revisionResult: any;
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      revisionResult = JSON.parse(jsonMatch[0]);
    } else {
      revisionResult = { revisedContent: content, summary: '解析失败', appliedIssues: [] };
    }
  } catch {
    revisionResult = { revisedContent: content, summary: '解析失败', appliedIssues: [] };
  }

  return { revisionResult };
}

// Node: save the revised content to DB
async function saveResultNode(state: typeof ChapterRevisionState.State) {
  console.log(`[chapter-revise] 保存修订内容到数据库... chapterId=${state.chapterId}`);
  if (state.taskId) {
    const tracker = createProgressTracker(state.taskId, STEPS);
    tracker.step(2);
  }

  const chapterRecord = await Chapter.findByPk(state.chapterId);
  if (!chapterRecord) throw new Error('章节不存在');

  // Backup current content as a version
  if (chapterRecord.content) {
    const count = await ChapterVersion.count({ where: { chapter_id: state.chapterId } });
    await ChapterVersion.create({
      chapter_id: state.chapterId,
      version_number: count + 1,
      content: chapterRecord.content,
    });
  }

  chapterRecord.content = state.revisionResult.revisedContent;
  chapterRecord.status = chapterRecord.status || 'generated';
  chapterRecord.review_result = null;
  await chapterRecord.save();

  const updatedChapter = await Chapter.findByPk(state.chapterId);
  return { updatedChapter };
}

// Node: extract memory for the revised chapter
async function extractMemoryNode(state: typeof ChapterRevisionState.State) {
  if (state.taskId) {
    const tracker = createProgressTracker(state.taskId, STEPS);
    tracker.step(3);
  }

  try {
    await chapterMemoryService.upsertForChapter(Number(state.chapterId), state.signal);
  } catch (error) {
    console.error(`[chapter-revise] 记忆卡提取失败，已跳过。chapterId=${state.chapterId}`, (error as Error).message);
  }
  return {};
}

// Node: finalize and report completion
async function finalizeNode(state: typeof ChapterRevisionState.State) {
  console.log(`[chapter-revise] 修订流程完成 chapterId=${state.chapterId}`);
  if (state.taskId) {
    const tracker = createProgressTracker(state.taskId, STEPS);
    tracker.finish();
  }
  return {};
}

const graph = new StateGraph(ChapterRevisionState)
  .addNode('loadContext', loadContextNode)
  .addNode('buildContext', buildContextNode)
  .addNode('runRevision', runRevisionNode)
  .addNode('saveResult', saveResultNode)
  .addNode('extractMemory', extractMemoryNode)
  .addNode('finalize', finalizeNode)
  .addEdge(START, 'loadContext')
  .addEdge('loadContext', 'buildContext')
  .addEdge('buildContext', 'runRevision')
  .addEdge('runRevision', 'saveResult')
  .addEdge('saveResult', 'extractMemory')
  .addEdge('extractMemory', 'finalize')
  .addEdge('finalize', END)
  .compile();

export { graph as chapterRevisionGraph, ChapterRevisionState, buildRevisionPrompt, formatRelevantEvidence };
