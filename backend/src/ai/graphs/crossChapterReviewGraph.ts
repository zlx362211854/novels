import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import * as crypto from 'crypto';
import { Chapter, ChapterMemory, MultiChapterReview } from '../../models/sequelize';
import { createLLM } from '../llmFactory';
import { parseJsonWithRepair } from '../jsonUtils';
import { createProgressTracker } from '../progressAdapter';
import { invokeWithStreaming } from '../streaming';
import * as aiStatus from '../../services/aiStatusService';

const STEPS = ['加载章节记忆卡', 'AI 跨章分析', '保存审阅结果'];

const CrossChapterReviewState = Annotation.Root({
  novelId: Annotation<number>,
  chapterIds: Annotation<number[]>,
  taskId: Annotation<string>,
  signal: Annotation<AbortSignal | undefined>,
  chapters: Annotation<any[]>,
  issues: Annotation<any[]>,
  reviewId: Annotation<string>,
});

function buildCrossChapterReviewPrompt(chapters: any[]): string {
  const memoryCards = chapters.map((ch) => {
    const mem = ch.memory;
    if (!mem) {
      return `# 第${ch.chapter_number}章：${ch.title || '无标题'}\n（无记忆卡）\n`;
    }

    const characters = (mem.entities?.characters || []).join(', ') || '无';
    const locations = (mem.entities?.locations || []).join(', ') || '无';

    const facts = (mem.facts || []).slice(0, 15).map((f: any) =>
      `  - ${f.subject} ${f.predicate} ${f.object}（证据："${f.evidence || ''}"）`
    ).join('\n') || '  （无）';

    const stateChanges = (mem.state_changes || []).map((sc: any) =>
      `  - ${sc.entity}.${sc.field}：${sc.before} → ${sc.after}`
    ).join('\n') || '  （无）';

    const openThreads = (mem.open_threads || []).map((t: any) =>
      `  - ${t.thread || t}（${t.status || ''}）`
    ).join('\n') || '  （无）';

    return [
      `# 第${ch.chapter_number}章：${ch.title || '无标题'}`,
      `摘要：${mem.summary || '无'}`,
      `人物：${characters}`,
      `地点：${locations}`,
      `关键事实（前15条）：`,
      facts,
      `状态变化：`,
      stateChanges,
      `开放线索：`,
      openThreads,
    ].join('\n');
  }).join('\n\n');

  return `你是一位专业的长篇小说逻辑审校编辑。
以下是按章顺序排列的 ${chapters.length} 章记忆卡，请找出跨章的逻辑矛盾。
只报告有记忆卡证据支撑的问题，不要推测。

===== 章节记忆卡 =====

${memoryCards}

===== 审核要求 =====
请检查：时间线矛盾、人物状态矛盾、世界规则违反、知识/信息时序问题、物品状态矛盾。
每个问题必须标注来自哪几章的记忆卡证据。
如果没有发现问题，返回 { "issues": [] }。

返回 JSON（不要 markdown 代码块）：
{
  "issues": [
    {
      "type": "timeline|character_state|world_rule|knowledge|item_state",
      "severity": "high|medium|low",
      "description": "问题描述",
      "affectedChapterNumbers": [1, 3],
      "evidence": [
        { "chapterNumber": 1, "excerpt": "记忆卡中的证据" },
        { "chapterNumber": 3, "excerpt": "记忆卡中的证据" }
      ],
      "suggestion": "建议修改方向"
    }
  ]
}`;
}

function buildAnalysisPreface(chapters: any[]): string {
  const chapterCount = chapters.length;
  const characterSet = new Set<string>();
  const locationSet = new Set<string>();
  const threadSet = new Set<string>();
  let factsCount = 0;

  for (const chapter of chapters) {
    const memory = chapter.memory;
    if (!memory) continue;

    for (const name of memory.entities?.characters || []) {
      if (name) characterSet.add(name);
    }
    for (const name of memory.entities?.locations || []) {
      if (name) locationSet.add(name);
    }
    for (const thread of memory.open_threads || []) {
      const label = typeof thread === 'string' ? thread : thread?.thread;
      if (label) threadSet.add(label);
    }
    factsCount += Array.isArray(memory.facts) ? memory.facts.length : 0;
  }

  return [
    `已载入 ${chapterCount} 章记忆卡`,
    `涉及人物 ${characterSet.size} 个`,
    `涉及地点 ${locationSet.size} 个`,
    `涉及关键事实 ${factsCount} 条`,
    `涉及开放线索 ${threadSet.size} 条`,
    '开始进行跨章逻辑比对...',
  ].join('\n');
}

function buildRepairPrompt(raw: string): string {
  return `请把以下文本修复成合法JSON：${raw}`;
}

// Node: load chapters and their memory cards
async function loadChaptersNode(state: typeof CrossChapterReviewState.State) {
  const tracker = createProgressTracker(state.taskId, STEPS);
  tracker.start('跨章审阅');
  tracker.step(0);

  if (state.chapterIds.length > 30) {
    throw new Error('最多选择 30 章进行跨章审阅');
  }

  // Load chapters (no content field needed here)
  const chapterRecords = await Chapter.findAll({
    attributes: ['id', 'chapter_number', 'title', 'novel_id'],
    where: { id: state.chapterIds },
  });

  // Sort by chapter_number ascending
  chapterRecords.sort((a: any, b: any) => a.chapter_number - b.chapter_number);

  // Load memory cards for all chapters
  const memoryRecords = await ChapterMemory.findAll({
    where: { chapter_id: state.chapterIds },
  });

  const memoryByChapterId = new Map<number, any>();
  for (const mem of memoryRecords) {
    memoryByChapterId.set((mem as any).chapter_id, mem);
  }

  // Build chapters array with deserialized memory
  const chapters = chapterRecords.map((ch: any) => {
    const memRecord = memoryByChapterId.get(ch.id);
    let memory: any = null;

    if (memRecord) {
      try {
        memory = {
          summary: memRecord.summary,
          entities: memRecord.entities ? JSON.parse(memRecord.entities) : { characters: [], locations: [] },
          facts: memRecord.facts ? JSON.parse(memRecord.facts) : [],
          state_changes: memRecord.state_changes ? JSON.parse(memRecord.state_changes) : [],
          open_threads: memRecord.open_threads ? JSON.parse(memRecord.open_threads) : [],
        };
      } catch (e) {
        console.warn(`[cross-review] 章节 ${ch.id} 记忆卡解析失败:`, (e as Error).message);
        memory = null;
      }
    } else {
      console.warn(`[cross-review] 章节 ${ch.id}（第${ch.chapter_number}章）没有记忆卡，将跳过`);
    }

    return {
      id: ch.id,
      chapter_number: ch.chapter_number,
      title: ch.title,
      memory,
    };
  });

  return { chapters };
}

// Node: call LLM for cross-chapter analysis
async function crossChapterReviewNode(state: typeof CrossChapterReviewState.State) {
  const tracker = createProgressTracker(state.taskId, STEPS);
  tracker.step(1);
  aiStatus.setStream(state.taskId, buildAnalysisPreface(state.chapters));

  const prompt = buildCrossChapterReviewPrompt(state.chapters);
  const llm = await createLLM({
    temperature: 0.2,
    maxTokens: 50000,
    provider: 'minimax',
  });

  const content = await invokeWithStreaming(
    llm,
    [new HumanMessage(prompt)],
    { signal: state.signal, taskId: state.taskId, resetStream: true }
  );
  const parsed = await parseJsonWithRepair(content, llm, buildRepairPrompt);

  const rawIssues: any[] = parsed.issues || [];

  // Assign uuid to each issue and resolve affectedChapterIds from chapter numbers
  const issues = rawIssues.map((issue: any) => {
    const affectedChapterIds = (issue.affectedChapterNumbers || []).map((num: number) => {
      const found = state.chapters.find((ch) => ch.chapter_number === num);
      return found ? found.id : null;
    }).filter(Boolean);

    return {
      ...issue,
      id: crypto.randomUUID(),
      affectedChapterIds,
    };
  });

  console.log(`[cross-review] 发现跨章问题 ${issues.length} 个`);
  return { issues };
}

// Node: save review result to DB
async function saveReviewNode(state: typeof CrossChapterReviewState.State) {
  const tracker = createProgressTracker(state.taskId, STEPS);
  tracker.step(2);

  const reviewId = crypto.randomUUID();

  await MultiChapterReview.create({
    id: reviewId,
    novel_id: state.novelId,
    chapter_ids: JSON.stringify(state.chapterIds),
    review_data: JSON.stringify(state.issues),
    fix_data: null,
    status: 'reviewed',
  });

  return { reviewId };
}

// Node: finalize
async function finalizeNode(state: typeof CrossChapterReviewState.State) {
  const tracker = createProgressTracker(state.taskId, STEPS);
  tracker.finish();
  console.log(`[cross-review] 跨章审阅完成，reviewId=${state.reviewId}`);
  return {};
}

const graph = new StateGraph(CrossChapterReviewState)
  .addNode('loadChapters', loadChaptersNode)
  .addNode('crossChapterReview', crossChapterReviewNode)
  .addNode('saveReview', saveReviewNode)
  .addNode('finalize', finalizeNode)
  .addEdge(START, 'loadChapters')
  .addEdge('loadChapters', 'crossChapterReview')
  .addEdge('crossChapterReview', 'saveReview')
  .addEdge('saveReview', 'finalize')
  .addEdge('finalize', END)
  .compile();

export { graph as crossChapterReviewGraph, CrossChapterReviewState };
