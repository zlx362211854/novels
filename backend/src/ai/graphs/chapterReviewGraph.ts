import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { Chapter, Novel, Architecture } from '../../models/sequelize';
import * as chapterMemoryService from '../../services/chapterMemoryService';
import * as reviewContextService from '../../services/reviewContextService';
import { createLLM, getAIConfig } from '../llmFactory';
import { parseJsonWithRepair } from '../jsonUtils';
import * as aiStatus from '../../services/aiStatusService';
import { invokeWithStreaming } from '../streaming';

const ChapterReviewState = Annotation.Root({
  // Inputs
  chapterId: Annotation<number>,
  signal: Annotation<AbortSignal | undefined>,

  // Preloaded (optional, avoids re-fetching)
  chapter: Annotation<any>,
  novel: Annotation<any>,
  architecture: Annotation<any>,

  // Intermediate
  currentMemory: Annotation<any>,
  reviewContext: Annotation<any>,

  // Output
  reviewResult: Annotation<any>,

  // Progress (null = called as sub-graph, skip standalone progress)
  taskId: Annotation<string | null>,
});

function formatArchitecture(architecture: any): string {
  if (!architecture) return '无';
  return `层级: ${architecture.level}\n标题: ${architecture.title}\n情节: ${architecture.plot_outline || ''}\n`;
}

function formatMemoryCard(memory: any): string {
  if (!memory) return '无';
  return `概要: ${memory.summary || ''}\n人物: ${(memory.entities?.characters || []).join(', ')}\n地点: ${(memory.entities?.locations || []).join(', ')}\n事实: ${(memory.facts || []).slice(0, 3).map((f: any) => `${f.subject}${f.predicate}${f.object}`).join('; ')}`;
}

function buildReviewPrompt(chapter: any, novel: any, architecture: any, config: any, reviewContext: any = {}): string {
  const strictnessGuide = config.reviewStrictness === 'strict' ? '请严格审核，任何不一致都需要指出' : '请宽松审核，只指出明显的不一致问题';
  const relevantMemories = Array.isArray(reviewContext.relevantMemories) ? reviewContext.relevantMemories : [];
  const sourceExcerpts = Array.isArray(reviewContext.sourceExcerpts) ? reviewContext.sourceExcerpts : [];
  return `你是一位专业的小说逻辑审校编辑，请审核以下章节内容，只找"有证据的硬逻辑错误"。${strictnessGuide}
## 章节信息
标题：${chapter.title || ''}
序号：第${chapter.chapter_number}章
正文：${(chapter.content || '').slice(0, 3000)}...
## 小说信息
标题：${novel.title}
类型：${novel.genre || ''}
## 架构信息
${formatArchitecture(architecture)}
## 当前章节记忆卡
${formatMemoryCard(reviewContext.currentMemory)}
${relevantMemories.map((m: any, i: number) => `### 相关记忆 ${i + 1} (第${m.chapter_number}章)\n${formatMemoryCard(m)}\n### 参考段落 ${i + 1}\n${sourceExcerpts[i]?.excerpt || ''}`).join('\n')}
## 审核要求
请检查：1.时间线错误 2.人物状态矛盾 3.情节因果错乱 4.数字不一致 5.场景逻辑错误。
只报告有证据的错误，不要推测。
请返回JSON格式：{ "score": number, "issues": [{ "type": string, "severity": string, "description": string, "currentEvidence": string, "historicalEvidence": string, "historicalChapterNumber": number|null, "suggestion": string }], "notes": [] }`;
}

function buildRepairPrompt(rawResult: string): string {
  return `请把以下文本修复成合法JSON：${rawResult}`;
}

// Node: load context from DB if not preloaded
async function loadContextNode(state: typeof ChapterReviewState.State) {
  let { chapter, novel, architecture } = state;

  if (!chapter) {
    chapter = await Chapter.findByPk(state.chapterId);
    if (!chapter) throw new Error('章节不存在');
  }
  if (!novel) {
    novel = await Novel.findByPk(chapter.novel_id);
    if (!novel) throw new Error('小说不存在');
  }
  if (architecture === undefined && chapter.architecture_id) {
    architecture = await Architecture.findByPk(chapter.architecture_id);
  }

  if (state.taskId) {
    aiStatus.start(state.taskId, `审阅「${chapter.title || '章节'}」`, ['提取记忆卡', '逻辑审阅']);
  }

  return { chapter, novel, architecture };
}

// Node: extract memory for current chapter
async function extractMemoryNode(state: typeof ChapterReviewState.State) {
  let currentMemory = null;
  if (state.chapter.content) {
    currentMemory = await chapterMemoryService.upsertForChapter(Number(state.chapterId), state.signal);
  }
  return { currentMemory };
}

// Node: build review context (find related chapters, excerpts)
async function buildContextNode(state: typeof ChapterReviewState.State) {
  if (state.taskId) {
    aiStatus.step(state.taskId, 1, '逻辑审阅');
  }

  const reviewContext = await reviewContextService.buildReviewContext(Number(state.chapterId), state.signal, {
    chapter: state.chapter,
    novel: state.novel,
    architecture: state.architecture,
    currentMemory: state.currentMemory,
  });

  return { reviewContext };
}

// Node: call LLM for review
async function runReviewNode(state: typeof ChapterReviewState.State) {
  const config = await getAIConfig();
  const llm = await createLLM({ temperature: 0.2, provider: 'zhipu', maxTokens: 12000 });

  const prompt = buildReviewPrompt(
    state.chapter,
    state.novel,
    state.architecture ?? state.reviewContext?.architecture,
    config,
    {
      currentMemory: state.reviewContext?.currentMemory ?? state.currentMemory,
      relevantMemories: state.reviewContext?.relevantMemories,
      sourceExcerpts: state.reviewContext?.sourceExcerpts,
    }
  );

  try {
    const content = await invokeWithStreaming(
      llm,
      [new HumanMessage(prompt)],
      { signal: state.signal, taskId: state.taskId, resetStream: true }
    );
    const reviewResult = await parseJsonWithRepair(
      content,
      llm,
      buildRepairPrompt
    );
    return { reviewResult };
  } catch (error: any) {
    console.error('审核失败:', error.message);
    return {
      reviewResult: {
        score: 0,
        issues: [{ type: 'review_error', severity: 'high', description: '审核服务异常', currentEvidence: '', historicalEvidence: '', historicalChapterNumber: null, suggestion: error.message }],
        notes: [],
      },
    };
  }
}

// Node: save review result to DB
async function saveResultNode(state: typeof ChapterReviewState.State) {
  const chapterRecord = await Chapter.findByPk(state.chapterId);
  if (chapterRecord) {
    chapterRecord.review_result = JSON.stringify(state.reviewResult);
    await chapterRecord.save();
  }

  if (state.taskId) {
    aiStatus.finish(state.taskId);
  }

  return {};
}

const graph = new StateGraph(ChapterReviewState)
  .addNode('loadContext', loadContextNode)
  .addNode('extractMemory', extractMemoryNode)
  .addNode('buildContext', buildContextNode)
  .addNode('runReview', runReviewNode)
  .addNode('saveResult', saveResultNode)
  .addEdge(START, 'loadContext')
  .addEdge('loadContext', 'extractMemory')
  .addEdge('extractMemory', 'buildContext')
  .addEdge('buildContext', 'runReview')
  .addEdge('runReview', 'saveResult')
  .addEdge('saveResult', END)
  .compile();

export { graph as chapterReviewGraph, ChapterReviewState };
