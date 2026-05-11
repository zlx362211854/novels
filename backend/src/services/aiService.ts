import { Architecture, Chapter, ChapterMemory } from '../models/sequelize';

const DEFAULT_CHAPTER_GENERATION_PROMPT_TEMPLATE = `你是一位擅写长篇金庸武侠小说的作家，请直接完成本章正文。

{{novelInfoSection}}

## 执行优先级
1. 先严格遵守“本章架构、用户补充要求、故事圣经硬约束、上一章承接”。
2. 再参考“历史相关记忆、历史原文证据”保证一致性。
3. 最后才参考“全本/本卷远场规划”，且不得提前写出尚未发生的情节。
## 风格与字数
- 文风严格按照金庸式武侠笔法：语气沉稳，半文半白，侠气,古风与苍凉并存。
- 对话风格参照金庸式武侠人物对话，人物情感以动作、神态、细节间接流露，避免直白告白与说教。
- 武打描写重节奏、气势和人物判断，不写流水账式招式堆砌。
- 场景要有江湖气、风物感和感官细节，允许借景抒情；诗词非必须，只能在情绪自然升高时少量使用。
- 字数控制在 5000-6000 字之间。
## 执行规则
- 只写本章架构明确覆盖的内容，不得提前写后续章节具体事件或人物揭示。
- 不得新增本章架构未授权的主要人物；路人、店家、守卫等功能性角色只能轻描淡写，不得引出新主线。
- 所有人物称谓、物品、场景、能力、时间线必须与既有设定一致，尤其注意伤势、位置、关系、道具归属和认知边界。
- 如果上一章结尾仍在动作、对话或同一场景中，本章开头必须连续衔接；若上一章已自然收束，才可合理转场。
- 禁止现代口语、网络用语、西化句式、爽文式主角光环和无代价越级碾压。
- 禁止总结腔、条目腔、说教腔，不要写标题、章号或任何解释性前言。

{{chapterInfo}}

{{userPromptSection}}

{{prevChapterSection}}

{{retrievalContextSection}}

{{farContextSection}}


请开始撰写本章正文：`;

function parseJsonField(value: any, fallback: any): any {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function formatPreviousChapterMemory(memory: any): string {
  if (!memory) return '';

  const facts = parseJsonField(memory.facts, []);
  const stateChanges = parseJsonField(memory.state_changes, []);
  const openThreads = parseJsonField(memory.open_threads, []);
  const keyEvents = parseJsonField(memory.key_events, []);

  const sections: string[] = [];

  if (Array.isArray(keyEvents) && keyEvents.length > 0) {
    sections.push([
      '**上一章关键事件：**',
      keyEvents.slice(0, 6).map((event: any) => {
        const time = event.time ? `[${event.time}]` : '';
        const chars = Array.isArray(event.characters) && event.characters.length
          ? `（${event.characters.join('、')}）`
          : '';
        return `- ${time}${event.event || ''}${chars}`;
      }).join('\n')
    ].join('\n'));
  }

  if (Array.isArray(facts) && facts.length > 0) {
    sections.push([
      '**上一章关键事实：**',
      facts.slice(0, 10).map((f: any) => `- ${f.subject || ''} ${f.predicate || ''} ${f.object || ''}`.trim()).join('\n')
    ].join('\n'));
  }

  if (Array.isArray(stateChanges) && stateChanges.length > 0) {
    sections.push([
      '**上一章状态变化：**',
      stateChanges.slice(0, 8).map((s: any) => `- ${s.entity || ''}.${s.field || ''}：${s.before ?? '?'} → ${s.after ?? '?'}`).join('\n')
    ].join('\n'));
  }

  if (Array.isArray(openThreads) && openThreads.length > 0) {
    sections.push([
      '**上一章未解决线索：**',
      openThreads.slice(0, 8).map((thread: any) => {
        const label = typeof thread === 'string' ? thread : thread.thread;
        const status = typeof thread === 'string' ? '' : thread.status;
        return `- ${label || ''}${status ? `（${status}）` : ''}`;
      }).join('\n')
    ].join('\n'));
  }

  return sections.filter(Boolean).join('\n\n');
}

function formatRetrievalFacts(facts: any[] = []): string[] {
  if (!Array.isArray(facts) || facts.length === 0) return [];
  return facts
    .slice(0, 8)
    .map((fact: any) => `- ${fact?.subject || ''} ${fact?.predicate || ''} ${fact?.object || ''}`.trim())
    .filter((line: string) => line !== '-');
}

function formatRetrievalThreads(threads: any[] = []): string[] {
  if (!Array.isArray(threads) || threads.length === 0) return [];
  return threads
    .slice(0, 6)
    .map((thread: any) => {
      if (typeof thread === 'string') return `- ${thread}`;
      if (thread?.thread) return `- ${thread.thread}`;
      return '';
    })
    .filter(Boolean);
}

function formatRelevantMemories(memories: any[] = []): string {
  if (!Array.isArray(memories) || memories.length === 0) return '';

  const blocks = memories.slice(0, 4).map((memory: any, index: number) => {
    const chapterLabel = memory?.chapter_number ? `第${memory.chapter_number}章` : `历史记忆${index + 1}`;
    const lines = [`### ${chapterLabel}`];
    const facts = formatRetrievalFacts(memory?.facts || []);
    const threads = formatRetrievalThreads(memory?.open_threads || []);
    if (facts.length > 0) {
      lines.push('关键事实：');
      lines.push(...facts);
    }
    if (threads.length > 0) {
      lines.push('未解线索：');
      lines.push(...threads);
    }
    return lines.join('\n');
  });

  return blocks.filter(Boolean).join('\n\n');
}

function formatRetrievedChunks(chunks: any[] = []): string {
  if (!Array.isArray(chunks) || chunks.length === 0) return '';

  return chunks
    .slice(0, 4)
    .map((chunk: any, index: number) => {
      const chapterLabel = chunk?.chapterNumber ? `第${chunk.chapterNumber}章` : `历史片段${index + 1}`;
      const score = Number.isFinite(chunk?.score) ? `（相关度 ${chunk.score.toFixed(2)}）` : '';
      return `### ${chapterLabel}${score}\n${chunk?.text || ''}`.trim();
    })
    .filter(Boolean)
    .join('\n\n');
}

function formatStoryBibleEntries(entries: any[] = []): string {
  if (!Array.isArray(entries) || entries.length === 0) return '';

  return entries
    .slice(0, 6)
    .map((entry: any, index: number) => {
      const title = entry?.title || `故事圣经条目${index + 1}`;
      const type = entry?.type ? `【${entry.type}】` : '';
      const priority = Number.isFinite(entry?.priority) ? `优先级 ${entry.priority}` : '';
      const score = Number.isFinite(entry?.score) ? `相关度 ${entry.score.toFixed(2)}` : '';
      const meta = [type, priority, score].filter(Boolean).join(' ');
      return `### ${title}${meta ? ` ${meta}` : ''}\n${entry?.content || ''}`.trim();
    })
    .filter(Boolean)
    .join('\n\n');
}

function buildRetrievalContextSection(retrievalContext: any = {}): string {
  const storyBibleSection = formatStoryBibleEntries(retrievalContext.storyBibleEntries || []);
  const memoriesSection = formatRelevantMemories(retrievalContext.relevantMemories || []);
  const chunksSection = formatRetrievedChunks(retrievalContext.retrievedChunks || []);

  const blocks: string[] = [];

  if (storyBibleSection) {
    blocks.push(`## 故事圣经硬约束（高优先级，禁止违背）\n${storyBibleSection}`);
  }

  if (memoriesSection) {
    blocks.push(`## 历史相关记忆（用于保持人物、道具、关系和伏笔一致）\n${memoriesSection}`);
  }

  if (chunksSection) {
    blocks.push(`## 历史原文证据（仅用于保持一致性，不得提前扩写未发生情节）\n${chunksSection}`);
  }

  if (blocks.length === 0) {
    return '';
  }

  return `\n${blocks.join('\n\n')}\n`;
}

function extractCharacterNames(value: any): string[] {
  const parsed = parseJsonField(value, value);
  if (Array.isArray(parsed)) {
    return parsed
      .map((item: any) => {
        if (typeof item === 'string') return item;
        return item?.name || '';
      })
      .filter(Boolean);
  }

  if (parsed && typeof parsed === 'object') {
    return Object.values(parsed)
      .map((item: any) => {
        if (typeof item === 'string') return item;
        return item?.name || '';
      })
      .filter(Boolean);
  }

  if (typeof parsed === 'string' && parsed.trim()) {
    return [parsed.trim()];
  }

  return [];
}

function compactStructuredValue(value: any, maxLength = 220): string {
  const parsed = parseJsonField(value, value);
  if (!parsed) return '';

  let text = '';
  if (typeof parsed === 'string') {
    text = parsed.trim();
  } else {
    try {
      text = JSON.stringify(parsed);
    } catch {
      text = String(parsed);
    }
  }

  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function buildArchitectureSummary(title: string, architecture: any, options: { includeCharacters?: boolean; includeWorld?: boolean } = {}): string {
  if (!architecture) return '';

  const lines = [`## ${title}`];
  if (architecture.title) {
    lines.push(`标题：${architecture.title}`);
  }
  if (architecture.plot_outline) {
    lines.push(`情节摘要：${architecture.plot_outline}`);
  }
  if (architecture.emotional_tone) {
    lines.push(`情感基调：${architecture.emotional_tone}`);
  }
  if (options.includeCharacters) {
    const names = extractCharacterNames(architecture.characters);
    if (names.length > 0) {
      lines.push(`关键角色：${names.slice(0, 10).join('、')}`);
    }
  }
  if (options.includeWorld) {
    const world = compactStructuredValue(architecture.world_setting, 180);
    if (world) {
      lines.push(`世界设定摘要：${world}`);
    }
  }

  return lines.join('\n');
}

function buildVolumeChapterOutlineSection(volumeChapterArchs: any[] = [], currentChapterId?: number): string {
  if (!Array.isArray(volumeChapterArchs) || volumeChapterArchs.length === 0) {
    return '';
  }

  const lines = [
    '## 本卷章节顺序提示（仅用于把握节奏，不得提前写后续剧情）',
  ];

  volumeChapterArchs.slice(0, 12).forEach((arch, index) => {
    const marker = arch.id === currentChapterId ? '【当前章】' : `【卷内第${index + 1}章】`;
    const plot = arch.plot_outline ? `：${arch.plot_outline}` : '';
    lines.push(`${marker} ${arch.title || '未命名'}${plot}`);
  });

  return lines.join('\n');
}

function buildPreviousChapterSection(prevChapterContent: any): string {
  if (!prevChapterContent) return '';

  const memorySection = formatPreviousChapterMemory(prevChapterContent.memory);
  const lines = [
    '## 上一章承接（高优先级）',
    `章节：${prevChapterContent.title}（第${prevChapterContent.chapterNumber || '?'}章）`,
    '结尾原文：',
    prevChapterContent.endingContent,
  ];

  if (memorySection) {
    lines.push(memorySection);
  }

  lines.push(
    '承接要求：如果上一章结尾仍处于动作、对话或场景连续状态，本章开头必须严格衔接；若上一章已自然收束，方可合理切换时空与场景。'
  );

  return lines.join('\n');
}

async function getPreviousChapterContent(currentArchId: number, parentId: number | null): Promise<any> {
  const currentArch = await Architecture.findByPk(currentArchId);
  if (!currentArch) return null;

  const volumes = await Architecture.findAll({
    where: { novel_id: currentArch.novel_id, level: 'volume' },
    order: [['id', 'ASC']]
  });
  const volumeOrder = new Map(volumes.map((volume: any, index: number) => [volume.id, index]));

  const chapterArchitectures = await Architecture.findAll({
    where: { novel_id: currentArch.novel_id, level: 'chapter' },
    order: [['id', 'ASC']]
  });

  const orderedArchitectures = chapterArchitectures.sort((left: any, right: any) => {
    const leftOrder = volumeOrder.get(left.parent_id) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = volumeOrder.get(right.parent_id) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.id - right.id;
  });

  const prevArch = selectPreviousChapterArchitecture(orderedArchitectures, currentArchId);
  if (!prevArch) return null;

  return await getChapterByArchitectureId(prevArch.id);
}

function selectPreviousChapterArchitecture(siblings: any[], currentArchId: number): any | null {
  const currentIndex = siblings.findIndex((arch: any) => arch.id === currentArchId);
  if (currentIndex <= 0) return null;
  return siblings[currentIndex - 1] || null;
}

async function getChapterByArchitectureId(archId: number): Promise<any> {
  const prevChapter = await Chapter.findOne({
    where: { architecture_id: archId }
  });

  if (!prevChapter || !prevChapter.content) return null;

  const content = prevChapter.content;
  const lastPart = content.length > 800 ? content.slice(-800) : content;

  let prevMemory = null;
  if (prevChapter.id) {
    const memoryRecord = await ChapterMemory.findOne({
      where: { chapter_id: prevChapter.id }
    });
    if (memoryRecord) {
      prevMemory = typeof (memoryRecord as any).get === 'function'
        ? (memoryRecord as any).get({ plain: true })
        : memoryRecord;
    }
  }

  return {
    title: prevChapter.title,
    chapterNumber: prevChapter.chapter_number,
    endingContent: lastPart,
    memory: prevMemory
  };
}

function buildChapterPrompt(
  novel: any,
  chapterArch: any,
  volumeArch: any,
  fullArch: any,
  prevChapterContent: any,
  volumeChapterArchs: any[] = [],
  userPrompt: string = '',
  retrievalContext: any = {},
  promptTemplate: string = ''
): string {
  const novelInfoSection = [
    '## 小说信息',
    `标题：${novel.title}`,
    `类型：${novel.genre || '未指定'}`,
  ].join('\n');

  let chapterInfo = `## 本章架构（最高优先级）\n标题：${chapterArch.title}`;
  if (chapterArch.plot_outline) {
    chapterInfo += `\n内容概括：${chapterArch.plot_outline}`;
  }
  const chapterCharacters = extractCharacterNames(chapterArch.characters);
  if (chapterCharacters.length > 0) {
    chapterInfo += `\n本章关键角色：${chapterCharacters.join('、')}`;
  }
  const chapterWorld = compactStructuredValue(chapterArch.world_setting, 180);
  if (chapterWorld) {
    chapterInfo += `\n本章世界设定：${chapterWorld}`;
  }
  if (chapterArch.emotional_tone) {
    chapterInfo += `\n本章情感基调：${chapterArch.emotional_tone}`;
  }

  const prevChapterSection = buildPreviousChapterSection(prevChapterContent);
  const normalizedUserPrompt = typeof userPrompt === 'string' ? userPrompt.trim() : '';
  const userPromptSection = normalizedUserPrompt
    ? `## 用户补充要求（高优先级）\n${normalizedUserPrompt}`
    : '';
  const retrievalContextSection = buildRetrievalContextSection(retrievalContext);
  const fullArchSection = buildArchitectureSummary('全本远场规划（仅供把握终局方向，禁止提前写出）', fullArch, {
    includeCharacters: true,
    includeWorld: true,
  });
  const volumeArchSection = buildArchitectureSummary('本卷远场规划（仅供把握本卷节奏，禁止提前写出）', volumeArch, {
    includeCharacters: true,
    includeWorld: false,
  });
  const volumeChapterSection = buildVolumeChapterOutlineSection(volumeChapterArchs, chapterArch.id);

  const farContextSection = [fullArchSection, volumeArchSection, volumeChapterSection]
    .filter(Boolean)
    .join('\n\n');

  const template = (typeof promptTemplate === 'string' && promptTemplate.trim())
    ? promptTemplate
    : DEFAULT_CHAPTER_GENERATION_PROMPT_TEMPLATE;

  return renderPromptTemplate(template, {
    novelInfoSection,
    chapterInfo,
    userPromptSection,
    prevChapterSection,
    retrievalContextSection,
    farContextSection,
  });
}

function renderPromptTemplate(template: string, sections: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(sections)) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    result = result.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), normalized);
  }

  return result
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export {
  DEFAULT_CHAPTER_GENERATION_PROMPT_TEMPLATE,
  buildChapterPrompt,
  buildRetrievalContextSection,
  formatPreviousChapterMemory,
  getPreviousChapterContent,
  getChapterByArchitectureId,
  selectPreviousChapterArchitecture,
};
