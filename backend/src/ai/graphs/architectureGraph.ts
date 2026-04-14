import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { Novel, Architecture } from '../../models/sequelize';
import { createLLM } from '../llmFactory';
import { withRetry } from '../retryUtils';

// --- Single Architecture Generation ---

const ArchitectureGenerationState = Annotation.Root({
  novelId: Annotation<number>,
  level: Annotation<string>,
  parentId: Annotation<number | undefined>,
  title: Annotation<string>,
  signal: Annotation<AbortSignal | undefined>,

  novel: Annotation<any>,
  parentContext: Annotation<string>,
  result: Annotation<any>,
});

function buildPrompt(novel: any, level: string, title: string, parentContext: string): string {
  const levelDesc: Record<string, string> = {
    full: '全本架构（整部小说的整体规划）',
    volume: '卷架构（小说中某一卷的规划）',
    chapter: '章架构（单个章节的详细规划）',
  };

  return `你是一位专业的网络小说策划师。请为以下小说生成${levelDesc[level]}的内容。

## 小说基本信息
标题：${novel.title}
类型：${novel.genre || '未指定'}
简介：${novel.description || '未提供'}
${parentContext}

## 要求
请生成符合要求的架构内容，确保内容详细、逻辑清晰、符合网络小说的特点。

请以JSON格式返回结果。`;
}

async function loadContextNode(state: typeof ArchitectureGenerationState.State) {
  const novel = await Novel.findByPk(state.novelId);
  if (!novel) throw new Error('小说不存在');

  let parentContext = '';
  if (state.parentId) {
    const parent = await Architecture.findByPk(state.parentId);
    if (parent) {
      parentContext = `
## 父级架构信息
层级: ${parent.level}
标题: ${parent.title}
${parent.plot_outline ? `情节大纲: ${parent.plot_outline}` : ''}
${parent.characters ? `人物设定: ${parent.characters}` : ''}
${parent.world_setting ? `世界观: ${parent.world_setting}` : ''}
`;
    }
  }

  return { novel, parentContext };
}

async function generateNode(state: typeof ArchitectureGenerationState.State) {
  const prompt = buildPrompt(state.novel, state.level, state.title || '', state.parentContext);
  const llm = await createLLM({ temperature: 0.8 });

  const result = await withRetry(
    async () => {
      const response = await llm.invoke([new HumanMessage(prompt)], { signal: state.signal });
      const content = response.content as string;
      try {
        return JSON.parse(content);
      } catch {
        return { raw: content };
      }
    },
    { maxAttempts: 3, delayMs: 60000, signal: state.signal, label: 'generateArchitecture' }
  );

  return { result };
}

const architectureGraph = new StateGraph(ArchitectureGenerationState)
  .addNode('loadContext', loadContextNode)
  .addNode('generate', generateNode)
  .addEdge(START, 'loadContext')
  .addEdge('loadContext', 'generate')
  .addEdge('generate', END)
  .compile();

// --- Batch Chapter Architecture Generation ---

const ChapterBatchState = Annotation.Root({
  novelId: Annotation<number>,
  volumeId: Annotation<number>,
  signal: Annotation<AbortSignal | undefined>,

  novel: Annotation<any>,
  volume: Annotation<any>,
  fullArch: Annotation<any>,
  result: Annotation<any[]>,
});

function buildChapterBatchPrompt(novel: any, volume: any, fullArch: any): string {
  return `你是一位专业的网络小说策划师。请为小说《${novel.title}》的卷「${volume.title}」生成章节规划。

## 小说信息
类型：${novel.genre || '未指定'}

## 卷信息
标题：${volume.title}
${volume.plot_outline ? `情节大纲：${volume.plot_outline}` : ''}

${fullArch ? `## 全本设定
${fullArch.plot_outline ? `情节大纲：${fullArch.plot_outline}` : ''}
${fullArch.world_setting ? `世界观：${fullArch.world_setting}` : ''}
${fullArch.characters ? `人物设定：${fullArch.characters}` : ''}` : ''}

## 要求
请生成该卷下的所有章节规划，每个章节需要包含：标题和情节概括。

请以JSON数组格式返回结果。`;
}

async function loadBatchContextNode(state: typeof ChapterBatchState.State) {
  const novel = await Novel.findByPk(state.novelId);
  if (!novel) throw new Error('小说不存在');

  const volume = await Architecture.findByPk(state.volumeId);
  if (!volume) throw new Error('卷架构不存在');

  const fullArch = await Architecture.findOne({
    where: { novel_id: state.novelId, level: 'full' },
  });

  return { novel, volume, fullArch };
}

async function generateBatchNode(state: typeof ChapterBatchState.State) {
  const prompt = buildChapterBatchPrompt(state.novel, state.volume, state.fullArch);
  const llm = await createLLM({ temperature: 0.8 });

  const result = await withRetry(
    async () => {
      const response = await llm.invoke([new HumanMessage(prompt)], { signal: state.signal });
      const content = response.content as string;
      try {
        const parsed = JSON.parse(content);
        return Array.isArray(parsed) ? parsed : parsed.chapters || [];
      } catch {
        return [];
      }
    },
    { maxAttempts: 3, delayMs: 60000, signal: state.signal, label: 'generateChapterArchitectures' }
  );

  return { result };
}

const chapterBatchGraph = new StateGraph(ChapterBatchState)
  .addNode('loadContext', loadBatchContextNode)
  .addNode('generate', generateBatchNode)
  .addEdge(START, 'loadContext')
  .addEdge('loadContext', 'generate')
  .addEdge('generate', END)
  .compile();

export { architectureGraph, chapterBatchGraph, ArchitectureGenerationState, ChapterBatchState };
