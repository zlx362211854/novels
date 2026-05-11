import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { createLLM } from '../llmFactory';
import { invokeWithStreaming } from '../streaming';
import { parseJsonWithRepair, strictJsonOutputRules } from '../jsonUtils';

const StoryBibleBootstrapState = Annotation.Root({
  metadata: Annotation<any>,
  prompt: Annotation<string>,
  constraints: Annotation<any>,
  taskId: Annotation<string | null>,
  result: Annotation<any[]>,
});

function buildRepairPrompt(raw: string): string {
  return `请把以下文本修复成合法 JSON。
要求：
${strictJsonOutputRules()}
保持原有语义，不要添加新结论。

待修复文本：
${raw}`;
}

function buildStoryBiblePrompt(metadata: any, prompt: string, constraints: any): string {
  return `你是一名故事圣经编辑，请为一部长篇小说生成可长期复用的故事圣经条目。

## 用户提示词
${prompt}

## 用户约束
${JSON.stringify(constraints || {}, null, 2)}

## 小说基础信息
${JSON.stringify(metadata, null, 2)}

## 输出要求
只输出 JSON 数组。每个元素格式如下：
{
  "type": "character | relationship | world_rule | plot_thread | faction | location",
  "title": "条目标题",
  "content": "完整条目内容",
  "priority": 10,
  "labels": ["标签1", "标签2"]
}

至少覆盖：
- 男女主
- 核心配角
- 关键人物关系
- 世界规则
- 至少 3 条主线/支线脉络
${strictJsonOutputRules()}`;
}

async function generateNode(state: typeof StoryBibleBootstrapState.State) {
  const llm = await createLLM({
    temperature: 0.7,
    maxTokens: 14000,
    graph: 'architectureGeneration',
  });
  const content = await invokeWithStreaming(
    llm,
    [new HumanMessage(buildStoryBiblePrompt(state.metadata, state.prompt, state.constraints))],
    { taskId: state.taskId ?? null, resetStream: true }
  );
  const parsed = await parseJsonWithRepair(content, llm, buildRepairPrompt);
  return { result: Array.isArray(parsed) ? parsed : [] };
}

export const storyBibleBootstrapGraph = new StateGraph(StoryBibleBootstrapState)
  .addNode('generate', generateNode)
  .addEdge(START, 'generate')
  .addEdge('generate', END)
  .compile();
