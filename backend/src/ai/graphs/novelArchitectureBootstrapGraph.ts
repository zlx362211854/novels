import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { createLLM } from '../llmFactory';
import { invokeWithStreaming } from '../streaming';
import { parseJsonWithRepair, strictJsonOutputRules } from '../jsonUtils';
import * as aiStatus from '../../services/aiStatusService';
import { serializeNovelAiConfig } from '../runtimeConfig';

const ArchitectureBootstrapState = Annotation.Root({
  metadata: Annotation<any>,
  prompt: Annotation<string>,
  constraints: Annotation<any>,
  aiConfig: Annotation<any>,
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
只输出 JSON 数组。禁止输出 markdown，禁止在字段之间嵌套额外对象。每个元素必须严格使用下列同级字段：
{
  "title": "卷标题",
  "plotOutline": "本卷目标、冲突、高潮和卷尾钩子",
  "characters": [
    "本卷核心人物A",
    "本卷核心人物B"
  ],
  "worldSetting": "本卷涉及的世界规则、局势与场域变化，使用单个字符串，不要输出对象",
  "emotionalTone": "本卷情绪",
  "metadata": {
    "volumeNumber": 1
  }
}

再次强调：
- characters 必须是数组
- worldSetting 必须是字符串
- emotionalTone 必须与 worldSetting 同级
- metadata 必须与 worldSetting 同级
${strictJsonOutputRules()}`;
}

async function generateNode(state: typeof ArchitectureBootstrapState.State) {
  const llm = await createLLM({
    temperature: 0.8,
    maxTokens: 12000,
    graph: 'architectureGeneration',
    novel: {
      ai_config: serializeNovelAiConfig(state.aiConfig),
    },
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
    aiStatus.step(state.taskId, 3, '生成卷架构');
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
    worldSetting: typeof volume.worldSetting === 'string' ? { summary: volume.worldSetting } : (volume.worldSetting || {}),
    emotionalTone: volume.emotionalTone || '',
    metadata: volume.metadata || { volumeNumber: index + 1 },
  }));

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
    },
  };
}

export const novelArchitectureBootstrapGraph = new StateGraph(ArchitectureBootstrapState)
  .addNode('generate', generateNode)
  .addEdge(START, 'generate')
  .addEdge('generate', END)
  .compile();
