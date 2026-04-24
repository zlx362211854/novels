import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { HumanMessage } from '@langchain/core/messages';
import { Op } from 'sequelize';
import { Chapter, Novel, Architecture } from '../../models/sequelize';
import * as chapterMemoryService from '../../services/chapterMemoryService';
import * as reviewContextService from '../../services/reviewContextService';
import { createLLM, getAIConfig } from '../llmFactory';
import { parseJsonWithRepair, strictJsonOutputRules } from '../jsonUtils';
import * as aiStatus from '../../services/aiStatusService';
import { invokeWithStreaming } from '../streaming';

const ChapterReviewState = Annotation.Root({
  // Inputs
  chapterId: Annotation<number>,
  signal: Annotation<AbortSignal | undefined>,

  // Preloaded (optional, avoids re-fetching)
  chapter: Annotation<any>,
  novel: Annotation<any>,
  architecture: Annotation<any>,
  previousChapter: Annotation<any>,

  // Intermediate
  currentMemory: Annotation<any>,
  reviewContext: Annotation<any>,
  volumeChapterArchs: Annotation<any[]>,
  allMemories: Annotation<any[]>,

  // Output
  reviewResult: Annotation<any>,

  // Progress (null = called as sub-graph, skip standalone progress)
  taskId: Annotation<string | null>,
});

function formatArchitecture(architecture: any): string {
  if (!architecture) return '无';
  let text = `层级: ${architecture.level}\n标题: ${architecture.title}\n情节: ${architecture.plot_outline || ''}\n`;
  if (architecture.characters) {
    try {
      const chars = typeof architecture.characters === 'string'
        ? JSON.parse(architecture.characters)
        : architecture.characters;
      const list = Array.isArray(chars) ? chars : Object.values(chars);
      if (list.length) {
        const names = list.map((c: any) => {
          const name = c.name || String(c);
          const role = c.role ? `（${c.role}）` : '';
          return `${name}${role}`;
        }).join('、');
        text += `角色列表（以下是全部合法角色名，审核时只能使用这些名字，不得自行推断别名）: ${names}\n`;
      }
    } catch { }
  }
  return text;
}

function formatMemoryCard(memory: any): string {
  if (!memory) return '无';
  const keyEvents = (memory.key_events || [])
    .map((event: any) => {
      const chars = Array.isArray(event.characters) && event.characters.length > 0
        ? `(${event.characters.join('、')})`
        : '';
      const time = event.time ? `[${event.time}]` : '';
      return `${time}${event.event || ''}${chars}`;
    })
    .filter(Boolean)
    .join('; ');
  const stateChanges = (memory.state_changes || [])
    .map((s: any) => `${s.entity}:${s.before ?? '?'}→${s.after ?? '?'}`)
    .join('; ');
  return [
    `概要: ${memory.summary || ''}`,
    keyEvents ? `关键事件: ${keyEvents}` : '',
    `人物: ${(memory.entities?.characters || []).join(', ')}`,
    `地点: ${(memory.entities?.locations || []).join(', ')}`,
    `事实: ${(memory.facts || []).map((f: any) => `${f.subject}${f.predicate}${f.object}`).join('; ')}`,
    stateChanges ? `状态变化: ${stateChanges}` : '',
  ].filter(Boolean).join('\n');
}

function formatKeyEvents(memory: any): string {
  const events = Array.isArray(memory?.key_events) ? memory.key_events : [];
  if (events.length === 0) return '无';
  return events.map((event: any, index: number) => {
    const time = event.time ? `[${event.time}]` : '';
    const chars = Array.isArray(event.characters) && event.characters.length > 0
      ? `（${event.characters.join('、')}）`
      : '';
    return `${index + 1}. ${time}${event.event || '未命名事件'}${chars}`;
  }).join('\n');
}

function buildHistoricalKeyEventsSection(relevantMemories: any[], previousChapterId?: number | null): string {
  const filtered = relevantMemories.filter((memory: any) => memory?.chapter_id !== previousChapterId);
  if (filtered.length === 0) return '无';
  return filtered.map((memory: any) => {
    const events = formatKeyEvents(memory);
    return `### 第${memory.chapter_number}章\n${events}`;
  }).join('\n');
}
function buildContinuityPrompt(state: typeof ChapterReviewState.State): string {
  const previousChapter = state.previousChapter;
  const previousMemory = state.reviewContext?.previousChapterMemory;
  const currentMemory = state.reviewContext?.currentMemory ?? state.currentMemory;
  const relevantMemories = Array.isArray(state.reviewContext?.relevantMemories) ? state.reviewContext.relevantMemories : [];
  const sourceExcerpts = Array.isArray(state.reviewContext?.sourceExcerpts) ? state.reviewContext.sourceExcerpts : [];
  const previousEnding = (state.reviewContext?.previousChapterContent || '')
    .split(/\n+/)
    .map((part: string) => part.trim())
    .filter(Boolean)
    .slice(-2)
    .join('\n\n');
  const currentOpening = (state.chapter?.content || '')
    .split(/\n+/)
    .map((part: string) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join('\n\n');

  return `你是一位专业的小说章节承接审校编辑。请只判断“上一章到当前章”的衔接是否存在重复推进、状态回退、重复介绍、把已完成事件重新写成新事件等问题。

## 当前章
标题：${state.chapter?.title || ''}
序号：第${state.chapter?.chapter_number || ''}章

## 上一章
标题：${previousChapter?.title || '无'}
序号：${previousChapter ? `第${previousChapter.chapter_number}章` : '无'}

## 当前章关键事件
${formatKeyEvents(currentMemory)}

## 上一章关键事件
${formatKeyEvents(previousMemory)}

## 当前章状态变化
${(currentMemory?.state_changes || []).length ? JSON.stringify(currentMemory.state_changes) : '[]'}

## 上一章状态变化
${(previousMemory?.state_changes || []).length ? JSON.stringify(previousMemory.state_changes) : '[]'}

## 当前章开头原文
${currentOpening || '无'}

## 上一章结尾原文
${previousEnding || '无'}

## 相关历史关键事件
${buildHistoricalKeyEventsSection(relevantMemories, state.reviewContext?.previousChapterId)}

## 相关历史参考段落
${relevantMemories.map((memory: any, index: number) => `### 第${memory.chapter_number}章\n${sourceExcerpts[index]?.excerpt || ''}`).join('\n') || '无'}

请重点判断：
1. 当前章开头是否把上一章已经完成的事件又重复写了一遍
2. 当前章是否把上一章已经稳定/完成的状态重新写回未处理状态
3. 当前章是否把已经认识/已经出场的角色重新按“初见”方式介绍
4. 当前章是否把已经交付/获得的物品、功法、信息再次当作新事件处理

要求：
- 只报告有证据的承接问题，不要猜测
- 如果没有问题，返回空 issues
- 问题类型请优先使用：plot_duplication、continuity_regression、character_intro_repeat、item_state_conflict
- 最多返回 3 条问题

请返回 JSON：
{
  "issues": [
    {
      "type": "string",
      "severity": "high|medium|low",
      "description": "string",
      "currentEvidence": "string",
      "historicalEvidence": "string",
      "historicalChapterNumber": number|null,
      "suggestion": "string"
    }
  ]
}
${strictJsonOutputRules()}`;
}

function mergeAiIssues(reviewResult: any, continuityResult: any): any {
  const baseIssues = Array.isArray(reviewResult?.issues) ? reviewResult.issues : [];
  const continuityIssues = Array.isArray(continuityResult?.issues) ? continuityResult.issues : [];
  const existingKeys = new Set(baseIssues.map((issue: any) => `${issue.type}|${issue.historicalChapterNumber}|${issue.currentEvidence}`));
  const mergedIssues = [...baseIssues];

  continuityIssues.forEach((issue: any) => {
    const key = `${issue.type}|${issue.historicalChapterNumber}|${issue.currentEvidence}`;
    if (!existingKeys.has(key)) {
      mergedIssues.push(issue);
    }
  });

  return {
    issues: mergedIssues,
    notes: Array.isArray(reviewResult?.notes) ? reviewResult.notes : [],
  };
}

function formatVolumeChapterArchs(volumeChapterArchs: any[], currentChapterId: number, relevantMemories: any[] = [], allMemories: any[] = []): string {
  if (!volumeChapterArchs || volumeChapterArchs.length === 0) return '';
  // 用全量记忆（按 chapter_id 索引）而非仅 relevantMemories，确保每章都能查到物品信息
  const memoryMap = new Map([...allMemories, ...relevantMemories].map((m: any) => [m.chapter_id, m]));
  let text = `## 本卷章节架构（按顺序，用于理解角色出场时机和物品获取）\n`;
  text += `⚠️ 以下是本卷所有章节的架构信息，请结合这些信息判断角色/物品是否"应在当前章节出现"。这里的顺位标签仅表示卷内先后，不是正文的全书章号，禁止据此报告“正文序号与架构不一致”。\n`;
  volumeChapterArchs.forEach((arch, index) => {
    const isCurrentChapter = arch.id === currentChapterId;
    const marker = isCurrentChapter ? '【当前章节】' : `【同卷顺位${index + 1}】`;
    text += `\n${marker} ${arch.title || '未命名'}\n`;
    if (arch.plot_outline) {
      text += `  情节：${arch.plot_outline}\n`;
    }
    if (arch.characters) {
      try {
        const chars = typeof arch.characters === 'string' ? JSON.parse(arch.characters) : arch.characters;
        const charList = Array.isArray(chars) ? chars : Object.values(chars);
        const charNames = charList.map((c: any) => typeof c === 'string' ? c : (c.name || '')).filter(Boolean);
        if (charNames.length > 0) {
          text += `  角色：${charNames.join('、')}\n`;
        }
      } catch { }
    }
    const chapterMemory = memoryMap.get(arch.chapter_id);
    if (chapterMemory && chapterMemory.entities?.items?.length > 0) {
      text += `  已知物品：${chapterMemory.entities.items.join('、')}\n`;
    }
  });
  return text;
}

export function buildReviewPrompt(chapter: any, novel: any, architecture: any, config: any, reviewContext: any = {}, volumeChapterArchs: any[] = [], allMemories: any[] = []): string {
  const strictnessGuide = config.reviewStrictness === 'strict' ? '请严格审核，任何不一致都需要指出' : '请宽松审核，只指出明显的不一致问题';
  const relevantMemories = Array.isArray(reviewContext.relevantMemories) ? reviewContext.relevantMemories : [];
  const sourceExcerpts = Array.isArray(reviewContext.sourceExcerpts) ? reviewContext.sourceExcerpts : [];
  const prevContent: string = reviewContext.previousChapterContent || '';
  const currentContent: string = chapter.content || '';
  const currentKeyEvents = formatKeyEvents(reviewContext.currentMemory);
  const previousKeyEvents = formatKeyEvents(reviewContext.previousChapterMemory);
  const historicalKeyEvents = buildHistoricalKeyEventsSection(relevantMemories, reviewContext.previousChapterId);

  // 取段落而非固定字符，语义更完整
  function lastParagraphs(text: string, n: number): string {
    const paras = text.split(/\n+/).map(p => p.trim()).filter(Boolean);
    return paras.slice(-n).join('\n\n');
  }
  function firstParagraphs(text: string, n: number): string {
    const paras = text.split(/\n+/).map(p => p.trim()).filter(Boolean);
    return paras.slice(0, n).join('\n\n');
  }

  const prevLastParas = prevContent ? lastParagraphs(prevContent, 2) : '';
  const curFirstParas = currentContent ? firstParagraphs(currentContent, 2) : '';

  const transitionSection = prevLastParas
    ? `## 章节承接强对比（必查区）
▼ 上一章最后两段：
${prevLastParas}

▼ 本章开头两段：
${curFirstParas}

⚠️ 必须核查以下承接问题：
- 人物伤势/体力/位置是否被重置或回退（如上章已愈，本章又重新疗伤）
- 人物关系/认知是否被回退（如上章已相识，本章又当作初次相遇介绍）
- 已出场角色是否被重复当作"初次登场"描写（年龄、外貌等初见写法重复出现）
- 场景/时间是否无故回退或重复
`
    : '';

  return `你是一位专业的小说逻辑审校编辑，请审核以下章节内容，只找"有证据的硬逻辑错误"。${strictnessGuide}
## 章节信息
标题：${chapter.title || ''}
序号：第${chapter.chapter_number}章
正文：${chapter.content || ''}
${transitionSection}## 小说信息
标题：${novel.title}
类型：${novel.genre || ''}
## 架构信息
${formatArchitecture(architecture)}
## 当前章关键事件
${currentKeyEvents}
## 上一章关键事件
${previousKeyEvents}
## 相关历史关键事件
${historicalKeyEvents}
## 当前章节记忆卡
${formatMemoryCard(reviewContext.currentMemory)}
${relevantMemories.map((m: any, i: number) => `### 相关记忆 ${i + 1} (第${m.chapter_number}章)\n${formatMemoryCard(m)}\n### 参考段落 ${i + 1}\n${sourceExcerpts[i]?.excerpt || ''}`).join('\n')}
${formatVolumeChapterArchs(volumeChapterArchs, chapter.id, relevantMemories, allMemories)}
## 审核要求
请检查包括但不限于：1.时间线错误 2.人物状态矛盾 3.情节因果错乱 4.数字不一致 5.场景逻辑错误 6.角色称呼错误（仅依据上方"角色列表"中的名字判断，列表之外的名字、别名、化名一律不得自行推断，必须在正文中有明确原文依据才能报告）7.物品/功法/技能获取时机错误 8.章节承接错误（对比上方"章节承接强对比"区，必须检查：①人物伤势/体力/位置回退 ②人物关系/认知状态回退 ③已出场角色被重复当作初次登场介绍 ④场景/时间无故重复或回退）。
请注意：
- 角色列表包含的是"全书角色"，不代表每个角色都应在当前章节出现。判断角色"缺失"问题时，需要结合历史记忆卡判断该角色是否已在更早章节出场。只有当角色在历史章节中已出场过，或架构明确要求当前章节必须出现，才报告"角色缺失"问题。如果角色在所有历史章节中都未出场，则可能是该角色的出场时机尚未到来，不应报告为缺失。
- 物品/功法获取时机：当前章节出现的物品，必须在该章节或更早章节的"已知物品"列表中出现。如果当前章节出现了某物品但它只在后续章节的"已知物品"中出现，说明该物品出现时机错误。
- “本卷章节架构”里的顺位标签仅用于表示卷内先后，不等于正文的全书章号；正文写“第12章”而当前架构在本卷中排第2位，并不构成错误。
只报告有原文直接证据的错误，不得基于推测或训练数据中的常识报告问题。
请返回JSON格式：{ "issues": [{ "type": string, "severity": string, "description": string, "currentEvidence": string, "historicalEvidence": string, "historicalChapterNumber": number|null, "suggestion": string }], "notes": [] }
${strictJsonOutputRules()}`;
}

function buildRepairPrompt(rawResult: string): string {
  return `请把以下文本修复成合法 JSON。
要求：
${strictJsonOutputRules()}
保持原有语义，不要添加新结论。

待修复文本：
${rawResult}`;
}

// Node: load context from DB if not preloaded
async function loadContextNode(state: typeof ChapterReviewState.State) {
  let { chapter, novel, architecture, previousChapter } = state;

  if (!chapter) {
    chapter = await Chapter.findByPk(state.chapterId);
    if (!chapter) throw new Error('章节不存在');
  }
  if (!novel) {
    novel = await Novel.findByPk(chapter.novel_id);
    if (!novel) throw new Error('小说不存在');
  }
  if (architecture === undefined && chapter.architecture_id) {
    architecture = await Architecture.findByPk(chapter.architecture_id);
  }

  if (!previousChapter) {
    previousChapter = await Chapter.findOne({
      where: {
        novel_id: chapter.novel_id,
        chapter_number: { [Op.lt]: chapter.chapter_number }
      },
      order: [['chapter_number', 'DESC']]
    });
  }

  if (state.taskId) {
    aiStatus.start(state.taskId, `审阅「${chapter.title || '章节'}」`, ['提取记忆卡', '逻辑审阅']);
  }

  return { chapter, novel, architecture, previousChapter };
}

// Node: extract memory for current chapter
async function extractMemoryNode(state: typeof ChapterReviewState.State) {
  let currentMemory = null;
  if (state.chapter.content) {
    currentMemory = await chapterMemoryService.upsertForChapter(Number(state.chapterId), state.signal);
  }
  return { currentMemory };
}

// Node: build review context (find related chapters, excerpts)
async function buildContextNode(state: typeof ChapterReviewState.State) {
  if (state.taskId) {
    aiStatus.step(state.taskId, 1, '逻辑审阅');
  }

  const reviewContext = await reviewContextService.buildReviewContext(Number(state.chapterId), state.signal, {
    chapter: state.chapter,
    novel: state.novel,
    architecture: state.architecture,
    currentMemory: state.currentMemory,
  });

  let volumeChapterArchs: any[] = [];
  const arch = state.architecture ?? reviewContext.architecture;
  if (arch) {
    const parentId = arch.level === 'chapter' ? arch.parent_id : arch.level === 'volume' ? arch.id : null;
    if (parentId) {
      const rawArchs = await Architecture.findAll({
        where: { parent_id: parentId, level: 'chapter' },
        order: [['id', 'ASC']],
      });
      // 关联每个章节架构对应的 chapter_id，供物品时序查询使用
      const linkedChapters = await Chapter.findAll({
        where: { architecture_id: rawArchs.map((a: any) => a.id) },
        attributes: ['id', 'architecture_id'],
      });
      const archToChapterId = new Map(linkedChapters.map((c: any) => [c.architecture_id, c.id]));
      volumeChapterArchs = rawArchs.map((a: any) => ({
        ...a.get({ plain: true }),
        chapter_id: archToChapterId.get(a.id) ?? null,
      }));
    }
  }

  // 取全量记忆供卷章节物品时序判断
  const allMemories = await chapterMemoryService.findByNovelId(state.chapter.novel_id);
  const previousChapterMemory = state.previousChapter
    ? allMemories.find((memory: any) => memory.chapter_id === state.previousChapter.id) || null
    : null;

  return {
    reviewContext: {
      ...reviewContext,
      previousChapterContent: state.previousChapter?.content || '',
      previousChapterId: state.previousChapter?.id || null,
      previousChapterMemory,
    },
    volumeChapterArchs,
    allMemories,
  };
}

// Node: call LLM for review
async function runReviewNode(state: typeof ChapterReviewState.State) {
  const config = await getAIConfig();
  const llm = await createLLM({ temperature: 0.2, maxTokens: 40000, provider: 'deepseek' });

  const prompt = buildReviewPrompt(
    state.chapter,
    state.novel,
    state.architecture ?? state.reviewContext?.architecture,
    config,
    {
      currentMemory: state.reviewContext?.currentMemory ?? state.currentMemory,
      previousChapterMemory: state.reviewContext?.previousChapterMemory ?? null,
      previousChapterId: state.reviewContext?.previousChapterId ?? null,
      relevantMemories: state.reviewContext?.relevantMemories,
      sourceExcerpts: state.reviewContext?.sourceExcerpts,
      previousChapterContent: state.reviewContext?.previousChapterContent ?? '',
    },
    state.volumeChapterArchs || [],
    state.allMemories || [],
  );

  try {
    const content = await invokeWithStreaming(
      llm,
      [new HumanMessage(prompt)],
      { signal: state.signal, taskId: state.taskId, resetStream: true }
    );
    console.log('审核原始内容:', content);
    const reviewResult = await parseJsonWithRepair(
      content,
      llm,
      buildRepairPrompt
    );

    let continuityResult = { issues: [] as any[] };
    if (state.previousChapter && state.reviewContext?.previousChapterMemory && (state.reviewContext?.currentMemory ?? state.currentMemory)) {
      const continuityPrompt = buildContinuityPrompt(state);
      const continuityContent = await invokeWithStreaming(
        llm,
        [new HumanMessage(continuityPrompt)],
        { signal: state.signal, taskId: state.taskId, resetStream: true }
      );
      continuityResult = await parseJsonWithRepair(
        continuityContent,
        llm,
        buildRepairPrompt
      );
    }

    return { reviewResult: mergeAiIssues(reviewResult, continuityResult) };
  } catch (error: any) {
    console.error('审核失败:', error.message);
    return {
      reviewResult: {
        issues: [{ type: 'review_error', severity: 'high', description: '审核服务异常', currentEvidence: '', historicalEvidence: '', historicalChapterNumber: null, suggestion: error.message }],
        notes: [],
      },
    };
  }
}

// Node: save review result to DB
async function saveResultNode(state: typeof ChapterReviewState.State) {
  const chapterRecord = await Chapter.findByPk(state.chapterId);
  if (chapterRecord) {
    chapterRecord.review_result = JSON.stringify(state.reviewResult);
    await chapterRecord.save();
  }

  if (state.taskId) {
    aiStatus.finish(state.taskId);
  }

  return {};
}

const graph = new StateGraph(ChapterReviewState)
  .addNode('loadContext', loadContextNode)
  .addNode('extractMemory', extractMemoryNode)
  .addNode('buildContext', buildContextNode)
  .addNode('runReview', runReviewNode)
  .addNode('saveResult', saveResultNode)
  .addEdge(START, 'loadContext')
  .addEdge('loadContext', 'extractMemory')
  .addEdge('extractMemory', 'buildContext')
  .addEdge('buildContext', 'runReview')
  .addEdge('runReview', 'saveResult')
  .addEdge('saveResult', END)
  .compile();

export { graph as chapterReviewGraph, ChapterReviewState };
