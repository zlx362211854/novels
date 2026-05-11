import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { createLLM } from '../llmFactory';
import { invokeWithStreaming } from '../streaming';
import { parseJsonWithRepair, strictJsonOutputRules } from '../jsonUtils';
import * as aiStatus from '../../services/aiStatusService';

const ArchitectureBootstrapState = Annotation.Root({
  metadata: Annotation<any>,
  prompt: Annotation<string>,
  constraints: Annotation<any>,
  taskId: Annotation<string | null>,
  result: Annotation<any>,
});

function buildRepairPrompt(raw: string): string {
  return `请把以下文本修复成合法 JSON。
要求：
${strictJsonOutputRules()}
保持原有语义，不要添加新结论。

待修复文本：
${raw}`;
}

function buildFullPrompt(metadata: any, prompt: string, constraints: any): string {
  return `你是一名长篇小说总策划，请生成一部小说的全本架构。

## 用户提示词
${prompt}

## 用户约束
${JSON.stringify(constraints || {}, null, 2)}

## 已有小说设定
${JSON.stringify(metadata, null, 2)}

## 输出要求
只输出 JSON：
{
  "title": "全本架构标题",
  "plotOutline": "完整全书主线与阶段推进",
  "characters": [],
  "worldSetting": {},
  "emotionalTone": "整体情感基调",
  "metadata": {
    "theme": "主题",
    "endingDirection": "结局方向"
  }
}
${strictJsonOutputRules()}`;
}

function buildVolumePrompt(metadata: any, fullArchitecture: any, constraints: any): string {
  const volumeCount = Math.max(1, Number(constraints?.volumeCount) || 4);
  return `你是一名长篇小说总策划，请根据全本架构拆出 ${volumeCount} 个卷架构。

## 小说设定
${JSON.stringify(metadata, null, 2)}

## 全本架构
${JSON.stringify(fullArchitecture, null, 2)}

## 输出要求
只输出 JSON 数组，每个元素格式：
{
  "title": "卷标题",
  "plotOutline": "本卷目标、冲突、高潮和卷尾钩子",
  "characters": [],
  "worldSetting": {},
  "emotionalTone": "本卷情绪",
  "metadata": {
    "volumeNumber": 1
  }
}
${strictJsonOutputRules()}`;
}

function buildChapterPrompt(
  metadata: any,
  fullArchitecture: any,
  volume: any,
  constraints: any,
  startChapterNumber: number,
  batchCount: number,
  totalChapterCount: number,
): string {
  const endChapterNumber = startChapterNumber + batchCount - 1;
  return `你是一名长篇小说分章策划，请为一个卷架构生成第 ${startChapterNumber} 章到第 ${endChapterNumber} 章，共 ${batchCount} 个可直接用于后续创作的章架构。整卷目标总章数为 ${totalChapterCount} 章。

## 小说设定
${JSON.stringify(metadata, null, 2)}

## 全本架构
${JSON.stringify(fullArchitecture, null, 2)}

## 当前卷架构
${JSON.stringify(volume, null, 2)}

## 输出要求
只输出 JSON 数组，并且只生成第 ${startChapterNumber}-${endChapterNumber} 章，不要生成其他章节。数组顺序必须与章号顺序一致。每个元素格式：
{
  "title": "章节标题",
  "plotOutline": "章节概要",
  "characters": ["人物A", "人物B"],
  "worldSetting": {
    "location": "主要场景",
    "ruleFocus": "本章涉及的规则"
  },
  "emotionalTone": "本章情绪",
  "metadata": {
    "chapterGoal": "本章叙事目标",
    "plotSummary": "开端、冲突、转折、结尾",
    "plotBeats": ["情节点1", "情节点2"],
    "requiredCharacters": ["必须出场人物"],
    "allowedOptionalCharacters": ["可选出场人物"],
    "sceneLocations": ["场景"],
    "conflict": "核心冲突",
    "foreshadowing": ["伏笔"],
    "stateChangesExpected": [],
    "endingHook": "章末钩子",
    "forbiddenContent": ["禁止提前泄露内容"]
  }
}
${strictJsonOutputRules()}`;
}

function getBatchSize(constraints: any): number {
  const requested = Number(constraints?.chapterBatchSize);
  if (Number.isFinite(requested) && requested > 0) {
    return Math.min(6, Math.max(2, Math.floor(requested)));
  }
  return 4;
}

function normalizeChapterDraft(
  chapter: any,
  volume: any,
  draftId: string,
): any {
  return {
    draftId,
    parentDraftVolumeId: volume.draftId,
    title: chapter.title || `${volume.title} ${draftId}`,
    plotOutline: chapter.plotOutline || chapter.metadata?.plotSummary || '',
    characters: chapter.characters || [],
    worldSetting: chapter.worldSetting || {},
    emotionalTone: chapter.emotionalTone || '',
    metadata: chapter.metadata || {},
  };
}

async function generateNode(state: typeof ArchitectureBootstrapState.State) {
  const llm = await createLLM({
    temperature: 0.8,
    maxTokens: 12000,
    graph: 'architectureGeneration',
  });

  if (state.taskId) {
    aiStatus.step(state.taskId, 2, '生成全本架构');
  }
  const fullContent = await invokeWithStreaming(
    llm,
    [new HumanMessage(buildFullPrompt(state.metadata, state.prompt, state.constraints))],
    { taskId: state.taskId ?? null, resetStream: true }
  );
  const fullArchitecture = await parseJsonWithRepair(fullContent, llm, buildRepairPrompt);

  if (state.taskId) {
    aiStatus.step(state.taskId, 2, '生成卷架构');
  }
  const volumeContent = await invokeWithStreaming(
    llm,
    [new HumanMessage(buildVolumePrompt(state.metadata, fullArchitecture, state.constraints))],
    { taskId: state.taskId ?? null, resetStream: true }
  );
  const parsedVolumes = await parseJsonWithRepair(volumeContent, llm, buildRepairPrompt);
  const volumeArchitectures = (Array.isArray(parsedVolumes) ? parsedVolumes : []).map((volume: any, index: number) => ({
    draftId: `vol_${index + 1}`,
    title: volume.title,
    plotOutline: volume.plotOutline,
    characters: volume.characters || [],
    worldSetting: volume.worldSetting || {},
    emotionalTone: volume.emotionalTone || '',
    metadata: volume.metadata || { volumeNumber: index + 1 },
  }));

  const chapterArchitectures: any[] = [];
  const totalChapterCount = Math.max(1, Number(state.constraints?.chaptersPerVolume) || 12);
  const batchSize = getBatchSize(state.constraints);
  let globalIndex = 1;
  for (const volume of volumeArchitectures) {
    for (let startChapterNumber = 1; startChapterNumber <= totalChapterCount; startChapterNumber += batchSize) {
      const batchCount = Math.min(batchSize, totalChapterCount - startChapterNumber + 1);
      if (state.taskId) {
        aiStatus.step(
          state.taskId,
          2,
          `生成 ${volume.title} 第 ${startChapterNumber}-${startChapterNumber + batchCount - 1} 章架构`
        );
      }
      const chapterContent = await invokeWithStreaming(
        llm,
        [
          new HumanMessage(
            buildChapterPrompt(
              state.metadata,
              fullArchitecture,
              volume,
              state.constraints,
              startChapterNumber,
              batchCount,
              totalChapterCount,
            )
          ),
        ],
        { taskId: state.taskId ?? null, resetStream: true }
      );
      const parsedChapters = await parseJsonWithRepair(chapterContent, llm, buildRepairPrompt);
      const normalized = (Array.isArray(parsedChapters) ? parsedChapters : []).map((chapter: any) =>
        normalizeChapterDraft(chapter, volume, `ch_${globalIndex++}`)
      );
      chapterArchitectures.push(...normalized);
    }
  }

  return {
    result: {
      fullArchitecture: {
        draftId: 'full_1',
        title: fullArchitecture.title,
        plotOutline: fullArchitecture.plotOutline,
        characters: fullArchitecture.characters || [],
        worldSetting: fullArchitecture.worldSetting || {},
        emotionalTone: fullArchitecture.emotionalTone || '',
        metadata: fullArchitecture.metadata || {},
      },
      volumeArchitectures,
      chapterArchitectures,
    },
  };
}

export const novelArchitectureBootstrapGraph = new StateGraph(ArchitectureBootstrapState)
  .addNode('generate', generateNode)
  .addEdge(START, 'generate')
  .addEdge('generate', END)
  .compile();
