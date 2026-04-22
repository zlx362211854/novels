import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { Novel, Architecture } from '../../models/sequelize';
import { createLLM } from '../llmFactory';
import { withRetry } from '../retryUtils';
import { invokeWithStreaming } from '../streaming';
import { parseJson, parseJsonWithRepair } from '../jsonUtils';
import * as aiStatus from '../../services/aiStatusService';

// --- Single Architecture Generation ---

const ArchitectureGenerationState = Annotation.Root({
  novelId: Annotation<number>,
  level: Annotation<string>,
  parentId: Annotation<number | undefined>,
  title: Annotation<string>,
  plotOutline: Annotation<string | undefined>,
  taskId: Annotation<string | null>,
  signal: Annotation<AbortSignal | undefined>,

  novel: Annotation<any>,
  parentContext: Annotation<string>,
  siblingContext: Annotation<string>,
  volumeNumber: Annotation<number | null>,
  result: Annotation<any>,
});

function buildPrompt(novel: any, level: string, title: string, parentContext: string, siblingContext: string, volumeNumber: number | null, plotOutline?: string): string {
  const levelDesc: Record<string, string> = {
    full: '全本架构（整部小说的整体规划）',
    volume: `第${volumeNumber ?? 1}卷架构`,
    chapter: `第${volumeNumber ?? 1}章架构`,
  };

  const scopeNote = level === 'volume'
    ? `\n**重要：只输出第${volumeNumber ?? 1}卷的内容，不要生成其他卷。**`
    : level === 'chapter'
    ? `\n**重要：只输出第${volumeNumber ?? 1}章的内容，不要生成其他章节。**`
    : '';

  return `你是一位专业的网络小说策划师。请根据作者提供的内容，为以下小说生成${levelDesc[level]}。${scopeNote}

## 小说基本信息
标题：${novel.title}
类型：${novel.genre || '未指定'}
简介：${novel.description || '未提供'}
${parentContext}
${siblingContext}
${plotOutline ? `## 作者提供的情节思路（请在此基础上补全和丰富）\n${plotOutline}` : ''}

## 要求
只生成${levelDesc[level]}的内容，包含情节大纲、人物设定、世界观设定、情感基调，确保详细、逻辑清晰、符合网络小说的特点。

请严格按以下JSON格式返回，不要增减字段：
{
  "plot_outline": "字符串，直接用文字描述情节大纲",
  "emotional_tone": "字符串，直接用文字描述情感基调",
  "characters": [
    {
      "name": "角色名",
      "role": "角色定位，如男主/女主/反派",
      "description": "角色背景与性格简述",
      "goal": "角色目标或动机"
    }
  ],
  "world_setting": {
    "era": "时代背景",
    "location": "主要地点",
    "factions": ["势力1", "势力2"],
    "rules": "世界规则或武学体系说明"
  }
}`;
}

async function loadContextNode(state: typeof ArchitectureGenerationState.State) {
  const novel = await Novel.findByPk(state.novelId);
  if (!novel) throw new Error('小说不存在');

  if (state.taskId) {
    aiStatus.start(state.taskId, `生成架构「${state.title || novel.title}」`, ['生成架构内容']);
  }

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

  // 查同级已有架构，确定当前卷/章序号，避免内容重复
  let siblingContext = '';
  let volumeNumber: number | null = null;
  if (state.level !== 'full') {
    const siblings = await Architecture.findAll({
      where: { novel_id: state.novelId, level: state.level, parent_id: state.parentId ?? null },
      order: [['id', 'ASC']],
    });
    const unitLabel = state.level === 'volume' ? '卷' : '章';
    volumeNumber = siblings.length + 1;
    if (siblings.length > 0) {
      const siblingList = siblings.map((s: any, i: number) =>
        `第${i + 1}${unitLabel}「${s.title}」：${s.plot_outline ? String(s.plot_outline).slice(0, 100) : '暂无概括'}`
      ).join('\n');
      siblingContext = `
## 已有${unitLabel}架构（共 ${siblings.length} 个，当前生成第 ${volumeNumber} 个）
${siblingList}
请确保新生成的内容在情节上紧接上一${unitLabel}，不重复已有内容。`;
    }
  }

  return { novel, parentContext, siblingContext, volumeNumber };
}

async function generateNode(state: typeof ArchitectureGenerationState.State) {
  const prompt = buildPrompt(state.novel, state.level, state.title || '', state.parentContext, state.siblingContext, state.volumeNumber, state.plotOutline);
  const llm = await createLLM({ temperature: 0.8, maxTokens: 40000, provider: 'minimax' });

  try {
    const result = await withRetry(
      async () => {
        const content = await invokeWithStreaming(llm, [new HumanMessage(prompt)], {
          signal: state.signal,
          taskId: state.taskId,
          resetStream: true,
        });
        return await parseJsonWithRepair(content, llm, (raw) => `请把以下文本修复成合法JSON：${raw}`);
      },
      { maxAttempts: 3, delayMs: 60000, signal: state.signal, label: 'generateArchitecture' }
    );
    if (state.taskId) aiStatus.finish(state.taskId);
    return { result };
  } catch (err: any) {
    if (state.taskId) aiStatus.error(state.taskId, err.message);
    throw err;
  }
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
  taskId: Annotation<string | null>,
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

  if (state.taskId) {
    aiStatus.start(state.taskId, `生成「${volume.title}」章架构`, ['生成章节规划']);
  }

  return { novel, volume, fullArch };
}

async function generateBatchNode(state: typeof ChapterBatchState.State) {
  const prompt = buildChapterBatchPrompt(state.novel, state.volume, state.fullArch);
  const llm = await createLLM({ temperature: 0.8, maxTokens: 40000, provider: 'minimax' });

  try {
    const result = await withRetry(
      async () => {
        const content = await invokeWithStreaming(llm, [new HumanMessage(prompt)], {
          signal: state.signal,
          taskId: state.taskId,
          resetStream: true,
        });
        const parsed = parseJson(content);
        return Array.isArray(parsed) ? parsed : parsed.chapters || [];
      },
      { maxAttempts: 3, delayMs: 60000, signal: state.signal, label: 'generateChapterArchitectures' }
    );
    if (state.taskId) aiStatus.finish(state.taskId);
    return { result };
  } catch (err: any) {
    if (state.taskId) aiStatus.error(state.taskId, err.message);
    throw err;
  }
}

const chapterBatchGraph = new StateGraph(ChapterBatchState)
  .addNode('loadContext', loadBatchContextNode)
  .addNode('generate', generateBatchNode)
  .addEdge(START, 'loadContext')
  .addEdge('loadContext', 'generate')
  .addEdge('generate', END)
  .compile();

export { architectureGraph, chapterBatchGraph, ArchitectureGenerationState, ChapterBatchState };
