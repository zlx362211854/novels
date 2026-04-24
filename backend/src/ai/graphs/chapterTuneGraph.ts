import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { Chapter, Novel } from '../../models/sequelize';
import * as reviewContextService from '../../services/reviewContextService';
import { createLLM } from '../llmFactory';
import { parseJsonWithRepair, strictJsonOutputRules } from '../jsonUtils';
import { createProgressTracker } from '../progressAdapter';
import { invokeWithStreaming } from '../streaming';
import { formatRelevantEvidence } from './chapterRevisionGraph';

const STEPS = ['构建上下文', '生成微调草稿'];

const ChapterTuneState = Annotation.Root({
  chapterId: Annotation<number>,
  userPrompt: Annotation<string>,
  signal: Annotation<AbortSignal | undefined>,
  taskId: Annotation<string | null>,

  chapter: Annotation<any>,
  novel: Annotation<any>,
  reviewContext: Annotation<any>,
  tuneResult: Annotation<any>,
});

function formatArchitecture(architecture: any): string {
  if (!architecture) return '无';
  return `层级: ${architecture.level}\n标题: ${architecture.title}\n情节: ${architecture.plot_outline || ''}\n`;
}

function buildTunePrompt(
  chapter: any,
  novel: any,
  architecture: any,
  userPrompt: string,
  reviewContext: any = {}
): string {
  const originalLength = (chapter.content || '').length;
  return `你是一位专业的网络小说润色编辑。请根据用户微调要求，对当前章节做定向微调。

## 章节信息
标题：${chapter.title || ''}
序号：第${chapter.chapter_number}章
原文字数：约${originalLength}字

## 当前章节正文
${chapter.content || ''}

## 小说信息
标题：${novel.title}
类型：${novel.genre || ''}

## 架构信息
${formatArchitecture(architecture)}

## 相关历史证据
${formatRelevantEvidence(reviewContext)}

## 用户微调要求
${userPrompt.trim()}

## 微调原则
- 只围绕“用户微调要求”做必要改动，不要重写成另一章
- 保留本章核心事件、人物关系、物品状态、因果顺序和结局
- 保持原文风格、叙事视角和章节体量，除非用户明确要求改变
- 可以局部增强描写、调整语气、补充衔接、优化对话或删减明显不合适表达
- 不要新增主线人物、世界规则、关键物品或大段新剧情
- 不要覆盖“相关历史证据”中已经成立的事实
- 如果用户要求与历史证据或架构冲突，以历史证据和架构为先，并在 summary 中说明取舍

请返回 JSON，不要 markdown 代码块：
{
  "revisedContent": "微调后的完整章节正文",
  "summary": "本次微调摘要",
  "changedAreas": ["改动点1", "改动点2"]
}
${strictJsonOutputRules()}`;
}

function buildRepairPrompt(raw: string): string {
  return `请把以下文本修复成合法 JSON，不要添加新语义，必须包含 revisedContent、summary、changedAreas。
要求：
${strictJsonOutputRules()}

待修复文本：
${raw}`;
}

function validateTuneResult(result: any, originalContent: string): void {
  if (!result?.revisedContent || !String(result.revisedContent).trim()) {
    throw new Error('模型未返回微调正文');
  }

  const originalLength = (originalContent || '').trim().length;
  const revisedLength = String(result.revisedContent || '').trim().length;

  if (originalLength >= 800 && revisedLength < Math.max(200, Math.floor(originalLength * 0.2))) {
    throw new Error('微调结果疑似被截断');
  }
}

async function loadContextNode(state: typeof ChapterTuneState.State) {
  const chapter = await Chapter.findByPk(state.chapterId);
  if (!chapter) throw new Error('章节不存在');
  if (!chapter.content || !chapter.content.trim()) {
    throw new Error('章节正文为空，无法微调');
  }

  const novel = await Novel.findByPk(chapter.novel_id);
  if (!novel) throw new Error('小说不存在');

  if (state.taskId) {
    const tracker = createProgressTracker(state.taskId, STEPS);
    tracker.start(`微调「${chapter.title || '章节'}」`);
  }

  return { chapter, novel };
}

async function buildContextNode(state: typeof ChapterTuneState.State) {
  if (state.taskId) {
    const tracker = createProgressTracker(state.taskId, STEPS);
    tracker.step(0);
  }

  const reviewContext = await reviewContextService.buildReviewContext(Number(state.chapterId), state.signal);
  return { reviewContext };
}

async function runTuneNode(state: typeof ChapterTuneState.State) {
  if (state.taskId) {
    const tracker = createProgressTracker(state.taskId, STEPS);
    tracker.step(1);
  }

  const llm = await createLLM({ temperature: 0.65, maxTokens: 40000, provider: 'deepseek' });
  const prompt = buildTunePrompt(
    state.chapter,
    state.novel,
    state.reviewContext?.architecture,
    state.userPrompt,
    state.reviewContext
  );

  const content = await invokeWithStreaming(
    llm,
    [new HumanMessage(prompt)],
    { signal: state.signal, taskId: state.taskId, resetStream: true }
  );

  const tuneResult = await parseJsonWithRepair(content, llm, buildRepairPrompt);
  validateTuneResult(tuneResult, state.chapter.content || '');

  return {
    tuneResult: {
      revisedContent: tuneResult.revisedContent,
      summary: tuneResult.summary || '',
      changedAreas: Array.isArray(tuneResult.changedAreas) ? tuneResult.changedAreas : [],
    },
  };
}

async function finalizeNode(state: typeof ChapterTuneState.State) {
  if (state.taskId) {
    const tracker = createProgressTracker(state.taskId, STEPS);
    tracker.finish();
  }
  return {};
}

const graph = new StateGraph(ChapterTuneState)
  .addNode('loadContext', loadContextNode)
  .addNode('buildContext', buildContextNode)
  .addNode('runTune', runTuneNode)
  .addNode('finalize', finalizeNode)
  .addEdge(START, 'loadContext')
  .addEdge('loadContext', 'buildContext')
  .addEdge('buildContext', 'runTune')
  .addEdge('runTune', 'finalize')
  .addEdge('finalize', END)
  .compile();

export {
  graph as chapterTuneGraph,
  ChapterTuneState,
  buildTunePrompt,
  validateTuneResult,
};
