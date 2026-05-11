import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { createLLM } from '../llmFactory';
import { parseJson, strictJsonOutputRules } from '../jsonUtils';
import { invokeWithStreaming } from '../streaming';
import * as aiStatus from '../../services/aiStatusService';

const MemoryExtractionState = Annotation.Root({
  // Inputs
  chapter: Annotation<any>,
  novel: Annotation<any>,
  architecture: Annotation<any>,
  signal: Annotation<AbortSignal | undefined>,
  skipRepairOnParseFailure: Annotation<boolean>,
  taskId: Annotation<string | null>,

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
  "key_events": [
    {
      "event": "string",
      "characters": ["string"],
      "time": "string"
    }
  ],
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
  "time_sequence": [
    {
      "day": 1,
      "phase": "morning|day|night",
      "label": "第1天白天",
      "event": "string",
      "characters": ["string"],
      "location": "string",
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
1. key_events 是本章核心事件列表（2-6条），每条用10字以内描述一件事，characters 列出直接涉及的人名，time 填简短时间标记
2. evidence 和 excerpt 必须来自正文的短原句，不要改写过度
3. 没有的字段返回空数组，不要省略
4. 只保留和硬逻辑相关的信息
5. ${strictJsonOutputRules()}
6. JSON 的 key 和字符串边界使用英文半角双引号；字符串内容里引用原文时使用中文引号“”
7. summary、evidence、excerpt、thread 尽量简短，避免冗长
8. time_sequence 必须按正文实际发生顺序填写，day 从 1 开始递增，phase 只能是 morning、day、night 三个值
9. time_sequence.label 必须写成“第N天白天 / 第N天晚上 / 第N天早上”这类绝对表述，不要只写“次日”“当晚”“夜里”
10. 不要只记录大事件。time_sequence 必须覆盖整章主要场景顺序：只要出现时间变化、地点变化、离开某处后又回到原处、或同一天内发生新的独立行动，就应新起一条
11. 如果正文写了“在山洞过夜→次日出洞赶路→当晚又回山洞”，time_sequence 必须拆成至少三条，不能压缩成一条“逃亡赶路”
12. 如果正文没有足够信息判断具体是第几天，也要结合上下文尽量给出相对稳定的日序；无法判断时可省略该条，不要乱猜`;
}

function buildRepairPrompt(rawResult: string): string {
  return `请把下面这段"本来想输出为JSON，但格式损坏了"的文本，修复成合法 JSON。

要求：
1. 只能输出 JSON
2. 保持原有语义，不要添加新结论
3. ${strictJsonOutputRules()}
4. 结构必须保持为章节记忆卡：
{
  "summary": "",
  "key_events": [],
  "entities": {
    "characters": [],
    "locations": [],
    "items": [],
    "organizations": []
  },
  "facts": [],
  "state_changes": [],
  "open_threads": [],
  "time_sequence": [],
  "source_excerpt_map": []
}

待修复文本：
${rawResult}`;
}

function buildTimeSequencePrompt(chapter: any, memoryCard: any): string {
  const knownLocations = Array.isArray(memoryCard?.entities?.locations) && memoryCard.entities.locations.length > 0
    ? memoryCard.entities.locations.join('、')
    : '无';
  const knownEvents = Array.isArray(memoryCard?.key_events) && memoryCard.key_events.length > 0
    ? memoryCard.key_events.map((event: any) => `${event.time ? `[${event.time}]` : ''}${event.event || ''}`).join('；')
    : '无';
  const coarseSequence = Array.isArray(memoryCard?.time_sequence) && memoryCard.time_sequence.length > 0
    ? memoryCard.time_sequence.map((item: any) => `${item.label || ''}:${item.event || ''}${item.location ? `@${item.location}` : ''}`).join('；')
    : '无';

  return `你是一位长篇小说时间线审校助手。请只做一件事：从下面章节中抽取“按正文顺序排列的细粒度时间/场景序列”。

## 章节信息
章节标题：${chapter.title || '未命名'}
章节序号：${chapter.chapter_number}

## 已有粗记忆（仅作提示，可纠正）
已知地点：${knownLocations}
已知关键事件：${knownEvents}
已有粗时间顺序：${coarseSequence}

## 章节正文
${chapter.content || ''}

请返回 JSON，结构必须完全符合：
{
  "time_sequence": [
    {
      "day": 1,
      "phase": "morning|day|night",
      "label": "第1天白天",
      "event": "string",
      "characters": ["string"],
      "location": "string",
      "evidence": "string"
    }
  ]
}

要求：
1. 只输出 JSON
2. time_sequence 必须按正文真实顺序排列，不能按重要性筛选
3. 不要只抽大事件。只要出现明显的时间推进、地点切换、行动段落切换、离开后返回原处，都应单独列一条
4. 同一天内允许出现多条，例如“第2天白天@山洞外”“第2天白天@山路”“第2天晚上@山洞”
5. label 必须写成“第N天白天 / 第N天晚上 / 第N天早上”这类绝对表述
6. phase 只能是 morning、day、night
7. 如果正文写到“再次回到某地”“又回到山洞”“夜里重新宿于原处”，必须单独体现这次返回，不能省略
8. event 用简洁短句说明这一时段发生了什么；location 要尽量填具体地点
9. evidence 必须摘录正文中的短原句，证明这一条时间/场景顺序确实存在
10. ${strictJsonOutputRules()}`;
}

// Node: call LLM to extract memory
async function callLLMNode(state: typeof MemoryExtractionState.State) {
  const llm = await createLLM({
    temperature: 0.2,
    maxTokens: 12000,
    graph: 'memoryExtraction',
    novel: state.novel,
  });
  const prompt = buildMemoryPrompt(state.chapter, state.novel, state.architecture);

  console.log('[AI] 开始调用 LLM (chapter-memory)');
  const rawResponse = await invokeWithStreaming(
    llm,
    [new HumanMessage(prompt)],
    { signal: state.signal, taskId: state.taskId, resetStream: true }
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
    if (state.taskId) {
      aiStatus.step(state.taskId, 1, '修复记忆卡结果');
    }
    return { parseSucceeded: false, parseError: error.message };
  }
}

// Node: repair JSON via LLM
async function repairJsonNode(state: typeof MemoryExtractionState.State) {
  const llm = await createLLM({
    temperature: 0.2,
    graph: 'memoryRepair',
    novel: state.novel,
  });
  console.log('[AI] 尝试修复记忆卡 JSON...');
  const repaired = await invokeWithStreaming(
    llm,
    [new HumanMessage(buildRepairPrompt(state.rawResponse))],
    { signal: state.signal, taskId: state.taskId, resetStream: true }
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
      key_events: Array.isArray(mc.key_events) ? mc.key_events : [],
      entities: {
        characters: Array.isArray(mc.entities?.characters) ? mc.entities.characters : [],
        locations: Array.isArray(mc.entities?.locations) ? mc.entities.locations : [],
        items: Array.isArray(mc.entities?.items) ? mc.entities.items : [],
        organizations: Array.isArray(mc.entities?.organizations) ? mc.entities.organizations : [],
      },
      facts: Array.isArray(mc.facts) ? mc.facts : [],
      state_changes: Array.isArray(mc.state_changes) ? mc.state_changes : [],
      open_threads: Array.isArray(mc.open_threads) ? mc.open_threads : [],
      time_sequence: Array.isArray(mc.time_sequence) ? mc.time_sequence : [],
      source_excerpt_map: Array.isArray(mc.source_excerpt_map) ? mc.source_excerpt_map : [],
    },
  };
}

async function enrichTimeSequenceNode(state: typeof MemoryExtractionState.State) {
  if (!state.chapter?.content?.trim()) {
    return {};
  }

  try {
    console.log('[AI] 开始调用 LLM (chapter-memory-time-sequence)');
    const llm = await createLLM({
      temperature: 0.1,
      maxTokens: 4000,
      graph: 'memoryTimeSequence',
      novel: state.novel,
    });
    const prompt = buildTimeSequencePrompt(state.chapter, state.memoryCard);
    const content = await invokeWithStreaming(
      llm,
      [new HumanMessage(prompt)],
      { signal: state.signal, taskId: null, resetStream: false }
    );
    const parsed = parseJson(content);
    const timeSequence = Array.isArray(parsed?.time_sequence) ? parsed.time_sequence : [];

    if (timeSequence.length === 0) {
      console.log('[chapter-memory] 细粒度时间顺序提取完成，但结果为空，保留主记忆卡结果');
      aiStatus.appendLog(state.taskId, '[chapter-memory] 细粒度时间顺序提取完成，但结果为空，保留主记忆卡结果');
      return {};
    }

    console.log(`[chapter-memory] 细粒度时间顺序提取完成，共 ${timeSequence.length} 条`);
    aiStatus.appendLog(state.taskId, `[chapter-memory] 细粒度时间顺序提取完成，共 ${timeSequence.length} 条`);

    return {
      memoryCard: {
        ...state.memoryCard,
        time_sequence: timeSequence,
      },
    };
  } catch (error: any) {
    console.warn('[chapter-memory] 细粒度时间顺序提取失败，保留主记忆卡结果:', error.message);
    aiStatus.appendLog(state.taskId, `[chapter-memory] 细粒度时间顺序提取失败，保留主记忆卡结果: ${error.message}`);
    return {};
  }
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
  .addNode('enrichTimeSequence', enrichTimeSequenceNode)
  .addEdge(START, 'callLLM')
  .addEdge('callLLM', 'parseResponse')
  .addConditionalEdges('parseResponse', routeAfterParse, {
    normalize: 'normalize',
    repairJson: 'repairJson',
  })
  .addEdge('repairJson', 'normalize')
  .addEdge('normalize', 'enrichTimeSequence')
  .addEdge('enrichTimeSequence', END)
  .compile();

export { graph as memoryExtractionGraph, MemoryExtractionState };
