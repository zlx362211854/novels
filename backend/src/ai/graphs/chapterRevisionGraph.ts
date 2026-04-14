import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { Chapter, ChapterVersion, Novel, Architecture } from '../../models/sequelize';
import * as reviewContextService from '../../services/reviewContextService';
import * as chapterMemoryService from '../../services/chapterMemoryService';
import { createLLM } from '../llmFactory';
import { createProgressTracker } from '../progressAdapter';

const STEPS = ['构建上下文', '修订章节', '保存结果', '提取记忆'];

const ChapterRevisionState = Annotation.Root({
  // Inputs
  chapterId: Annotation<number>,
  reviewResult: Annotation<any>,
  signal: Annotation<AbortSignal | undefined>,
  taskId: Annotation<string>,

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

function buildRevisionPrompt(chapter: any, novel: any, architecture: any, reviewResult: any): string {
  return `你是一位专业的网络小说编辑，请根据审阅意见修订章节。

## 章节信息
标题：${chapter.title || ''}
序号：第${chapter.chapter_number}章
正文：${(chapter.content || '')}...

## 小说信息
标题：${novel.title}
类型：${novel.genre || ''}

## 架构信息
${formatArchitecture(architecture)}

## 审阅意见
${JSON.stringify(reviewResult.issues || [], null, 2)}

## 要求
请生成修订后的章节内容，保留原有风格，只修复问题。

请返回JSON格式：{ "revisedContent": "string", "summary": "string", "appliedIssues": ["string"] }`;
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
  const tracker = createProgressTracker(state.taskId, STEPS);
  tracker.start(`修订「${chapter.title || '章节'}」`);

  return { chapter, novel };
}

// Node: build review context
async function buildContextNode(state: typeof ChapterRevisionState.State) {
  const tracker = createProgressTracker(state.taskId, STEPS);
  tracker.step(0);

  const reviewContext = await reviewContextService.buildReviewContext(
    Number(state.chapterId),
    state.signal
  );
  return { reviewContext };
}

// Node: call LLM for revision
async function runRevisionNode(state: typeof ChapterRevisionState.State) {
  console.log(`[chapter-revise] 调用 LLM 修订章节... chapterId=${state.chapterId}`);
  const tracker = createProgressTracker(state.taskId, STEPS);
  tracker.step(1);

  const llm = await createLLM({ temperature: 0.7, maxTokens: 12000, provider: 'zhipu' });
  const prompt = buildRevisionPrompt(
    state.chapter,
    state.novel,
    state.reviewContext?.architecture,
    state.reviewResult
  );

  const response = await llm.invoke([new HumanMessage(prompt)], { signal: state.signal });
  const content = response.content as string;
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
  const tracker = createProgressTracker(state.taskId, STEPS);
  tracker.step(2);

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
  await chapterRecord.save();

  const updatedChapter = await Chapter.findByPk(state.chapterId);
  return { updatedChapter };
}

// Node: extract memory for the revised chapter
async function extractMemoryNode(state: typeof ChapterRevisionState.State) {
  const tracker = createProgressTracker(state.taskId, STEPS);
  tracker.step(3);

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
  const tracker = createProgressTracker(state.taskId, STEPS);
  tracker.finish();
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

export { graph as chapterRevisionGraph, ChapterRevisionState };
