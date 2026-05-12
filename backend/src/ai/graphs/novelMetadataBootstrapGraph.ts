import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { createLLM } from '../llmFactory';
import { invokeWithStreaming } from '../streaming';
import { parseJsonWithRepair, strictJsonOutputRules } from '../jsonUtils';
import { serializeNovelAiConfig } from '../runtimeConfig';

const MetadataBootstrapState = Annotation.Root({
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

function buildMetadataPrompt(prompt: string, constraints: any): string {
  return `你是一名长篇网络小说总策划。请根据用户提示，一次生成新小说的基础信息、主要角色和故事主线。

## 用户提示词
${prompt}

## 用户约束
${JSON.stringify(constraints || {}, null, 2)}

## 输出要求
请只输出合法 JSON，格式如下：
{
  "novel": {
    "title": "小说名称",
    "description": "简介，80-200字",
    "genre": "题材"
  },
  "cast": {
    "maleLead": {
      "name": "姓名",
      "role": "男主",
      "description": "角色描述",
      "goal": "核心目标"
    },
    "femaleLead": {
      "name": "姓名",
      "role": "女主",
      "description": "角色描述",
      "goal": "核心目标"
    },
    "supportingCharacters": [
      {
        "name": "姓名",
        "role": "配角定位",
        "description": "角色描述",
        "goal": "目标或动机"
      }
    ],
    "relationships": [
      {
        "from": "角色A",
        "to": "角色B",
        "type": "关系类型",
        "description": "关系说明"
      }
    ]
  },
  "story": {
    "premise": "故事前提",
    "mainLine": "主线脉络",
    "arcs": ["阶段弧线1", "阶段弧线2"],
    "bibleSummary": "供故事圣经扩展的总体摘要"
  }
}
${strictJsonOutputRules()}`;
}

async function generateNode(state: typeof MetadataBootstrapState.State) {
  const llm = await createLLM({
    temperature: 0.8,
    maxTokens: 12000,
    graph: 'architectureGeneration',
    novel: {
      ai_config: serializeNovelAiConfig(state.aiConfig),
    },
  });
  const content = await invokeWithStreaming(
    llm,
    [new HumanMessage(buildMetadataPrompt(state.prompt, state.constraints))],
    { taskId: state.taskId ?? null, resetStream: true }
  );
  const result = await parseJsonWithRepair(content, llm, buildRepairPrompt);
  return { result };
}

export const novelMetadataBootstrapGraph = new StateGraph(MetadataBootstrapState)
  .addNode('generate', generateNode)
  .addEdge(START, 'generate')
  .addEdge('generate', END)
  .compile();
