import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { createLLM } from '../llmFactory';
import { parseJson } from '../jsonUtils';
import { invokeWithStreaming } from '../streaming';

const MemoryExtractionState = Annotation.Root({
  // Inputs
  chapter: Annotation<any>,
  novel: Annotation<any>,
  architecture: Annotation<any>,
  signal: Annotation<AbortSignal | undefined>,
  skipRepairOnParseFailure: Annotation<boolean>,

  // Intermediate
  rawResponse: Annotation<string>,
  memoryCard: Annotation<any>,
  parseSucceeded: Annotation<boolean>,
  parseError: Annotation<string>,
});

function formatArchitecture(architecture: any): string {
  if (!architecture) return '无架构设定';
  let info = `层级: ${architecture.level}\n标题: ${architecture.title}\n`;
  if (architecture.plot_outline) info += `情节大纲: ${architecture.plot_outline}\n`;
  if (architecture.characters) info += `人物设定: ${architecture.characters}\n`;
  if (architecture.world_setting) info += `世界观: ${architecture.world_setting}\n`;
  if (architecture.emotional_tone) info += `情感基调: ${architecture.emotional_tone}\n`;
  return info;
}

function buildMemoryPrompt(chapter: any, novel: any, architecture: any): string {
  return `你是一位长篇小说审校助手。请从下面章节中提取"硬逻辑记忆卡"，只记录明确出现或可以直接推出的事实，不要脑补。

## 小说信息
标题：${novel.title}
类型：${novel.genre || '未指定'}

## 章节信息
章节标题：${chapter.title || '未命名'}
章节序号：${chapter.chapter_number}

## 架构信息（仅辅助理解，若与正文冲突，以正文为准）
${formatArchitecture(architecture)}

## 章节正文
${chapter.content || ''}

请返回 JSON，结构必须完全符合：
{
  "summary": "string",
  "entities": {
    "characters": ["string"],
    "locations": ["string"],
    "items": ["string"],
    "organizations": ["string"]
  },
  "facts": [
    {
      "type": "character_state|relationship|world_rule|knowledge|timeline|item_state",
      "subject": "string",
      "predicate": "string",
      "object": "string",
      "status": "active|resolved|uncertain",
      "evidence": "string"
    }
  ],
  "state_changes": [
    {
      "entity": "string",
      "field": "string",
      "before": "string",
      "after": "string",
      "evidence": "string"
    }
  ],
  "open_threads": [
    {
      "thread": "string",
      "status": "opened|advanced|resolved",
      "evidence": "string"
    }
  ],
  "source_excerpt_map": [
    {
      "label": "string",
      "excerpt": "string"
    }
  ]
}

要求：
1. evidence 和 excerpt 必须来自正文的短原句，不要改写过度
2. 没有的字段返回空数组，不要省略
3. 只保留和硬逻辑相关的信息
4. 输出必须是合法 JSON，不要加 markdown 代码块
5. 所有字符串必须使用英文半角双引号 "
6. summary、evidence、excerpt、thread 尽量简短，避免冗长`;
}

function buildRepairPrompt(rawResult: string): string {
  return `请把下面这段"本来想输出为JSON，但格式损坏了"的文本，修复成合法 JSON。

要求：
1. 只能输出 JSON
2. 保持原有语义，不要添加新结论
3. 所有字符串必须使用英文半角双引号 "
4. 结构必须保持为章节记忆卡：
{
  "summary": "",
  "entities": {
    "characters": [],
    "locations": [],
    "items": [],
    "organizations": []
  },
  "facts": [],
  "state_changes": [],
  "open_threads": [],
  "source_excerpt_map": []
}

待修复文本：
${rawResult}`;
}

// Node: call LLM to extract memory
async function callLLMNode(state: typeof MemoryExtractionState.State) {
  const llm = await createLLM({ temperature: 0.2 });
  const prompt = buildMemoryPrompt(state.chapter, state.novel, state.architecture);

  console.log('[AI] 开始调用 LLM (chapter-memory)');
  const rawResponse = await invokeWithStreaming(
    llm,
    [new HumanMessage(prompt)],
    { signal: state.signal, resetStream: true }
  );
  console.log('[AI] LLM (chapter-memory) 返回完成');

  return { rawResponse };
}

// Node: try to parse the JSON response
async function parseResponseNode(state: typeof MemoryExtractionState.State) {
  try {
    const memoryCard = parseJson(state.rawResponse);
    return { memoryCard, parseSucceeded: true, parseError: '' };
  } catch (error: any) {
    console.error('解析记忆卡失败:', error.message);
    console.error('原始记忆卡输出片段:', (state.rawResponse || '').slice(0, 800));
    return { parseSucceeded: false, parseError: error.message };
  }
}

// Node: repair JSON via LLM
async function repairJsonNode(state: typeof MemoryExtractionState.State) {
  const llm = await createLLM({ temperature: 0.2 });
  console.log('[AI] 尝试修复记忆卡 JSON...');
  const repaired = await invokeWithStreaming(
    llm,
    [new HumanMessage(buildRepairPrompt(state.rawResponse))],
    { signal: state.signal, resetStream: true }
  );

  try {
    const memoryCard = parseJson(repaired);
    return { memoryCard, parseSucceeded: true };
  } catch (repairError: any) {
    console.error('修复后记忆卡解析仍失败:', repairError.message);
    throw repairError;
  }
}

// Node: normalize the memory card structure
async function normalizeNode(state: typeof MemoryExtractionState.State) {
  const mc = state.memoryCard || {};
  return {
    memoryCard: {
      summary: mc.summary || '',
      entities: {
        characters: Array.isArray(mc.entities?.characters) ? mc.entities.characters : [],
        locations: Array.isArray(mc.entities?.locations) ? mc.entities.locations : [],
        items: Array.isArray(mc.entities?.items) ? mc.entities.items : [],
        organizations: Array.isArray(mc.entities?.organizations) ? mc.entities.organizations : [],
      },
      facts: Array.isArray(mc.facts) ? mc.facts : [],
      state_changes: Array.isArray(mc.state_changes) ? mc.state_changes : [],
      open_threads: Array.isArray(mc.open_threads) ? mc.open_threads : [],
      source_excerpt_map: Array.isArray(mc.source_excerpt_map) ? mc.source_excerpt_map : [],
    },
  };
}

// Conditional routing after parse
function routeAfterParse(state: typeof MemoryExtractionState.State): string {
  if (state.parseSucceeded) return 'normalize';
  if (state.skipRepairOnParseFailure) {
    throw new Error(`记忆卡 JSON 解析失败: ${state.parseError}`);
  }
  return 'repairJson';
}

const graph = new StateGraph(MemoryExtractionState)
  .addNode('callLLM', callLLMNode)
  .addNode('parseResponse', parseResponseNode)
  .addNode('repairJson', repairJsonNode)
  .addNode('normalize', normalizeNode)
  .addEdge(START, 'callLLM')
  .addEdge('callLLM', 'parseResponse')
  .addConditionalEdges('parseResponse', routeAfterParse, {
    normalize: 'normalize',
    repairJson: 'repairJson',
  })
  .addEdge('repairJson', 'normalize')
  .addEdge('normalize', END)
  .compile();

export { graph as memoryExtractionGraph, MemoryExtractionState };
