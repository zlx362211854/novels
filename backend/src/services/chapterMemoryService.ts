import * as crypto from 'node:crypto';
import { Chapter, ChapterMemory, Novel, Architecture, ChapterChunk, sequelize } from '../models/sequelize';
import * as chapterMemoryAgent from '../agents/chapterMemoryAgent';
import * as chapterChunkService from './chapterChunkService';
import { getChapterChunkVectorStats } from './vectorStoreService';

function buildContentHash(content: string): string {
  return crypto.createHash('sha256').update(content || '').digest('hex');
}

function parseDayFromLabel(label: string): number | null {
  if (!label) return null;
  const match = label.match(/第\s*(\d+)\s*天/);
  return match ? Number(match[1]) : null;
}

function normalizePhase(value: any, label = ''): 'morning' | 'day' | 'night' {
  const text = `${String(value || '')} ${label}`.toLowerCase();
  if (/morning|凌晨|拂晓|黎明|清晨|早晨|早上|晨/.test(text)) return 'morning';
  if (/night|傍晚|黄昏|入夜|夜|夜里|夜晚|晚上|深夜|月下/.test(text)) return 'night';
  return 'day';
}

function buildPhaseLabel(day: number | null, phase: 'morning' | 'day' | 'night'): string {
  const safeDay = day && day > 0 ? day : 1;
  const suffix = phase === 'morning' ? '早上' : phase === 'night' ? '晚上' : '白天';
  return `第${safeDay}天${suffix}`;
}

function normalizeTimeSequenceItem(item: any, fallbackDay: number): any | null {
  if (!item || !item.event) return null;
  const parsedDay = Number.isFinite(Number(item.day)) ? Number(item.day) : parseDayFromLabel(String(item.label || ''));
  const day = parsedDay && parsedDay > 0 ? parsedDay : fallbackDay;
  const phase = normalizePhase(item.phase, String(item.label || ''));
  return {
    day,
    phase,
    label: buildPhaseLabel(day, phase),
    event: String(item.event || '').trim(),
    characters: Array.isArray(item.characters) ? item.characters.filter(Boolean) : [],
    location: item.location ? String(item.location).trim() : '',
    evidence: item.evidence ? String(item.evidence).trim() : '',
  };
}

function normalizeMemoryCard(memoryCard: any = {}): any {
  let fallbackDay = 1;
  const timeSequence = Array.isArray(memoryCard.time_sequence)
    ? memoryCard.time_sequence
        .map((item: any) => {
          const normalized = normalizeTimeSequenceItem(item, fallbackDay);
          if (normalized?.day) {
            fallbackDay = normalized.day;
          }
          return normalized;
        })
        .filter(Boolean)
    : [];

  return {
    summary: memoryCard.summary || '',
    key_events: Array.isArray(memoryCard.key_events) ? memoryCard.key_events : [],
    entities: {
      characters: Array.isArray(memoryCard.entities?.characters) ? memoryCard.entities.characters : [],
      locations: Array.isArray(memoryCard.entities?.locations) ? memoryCard.entities.locations : [],
      items: Array.isArray(memoryCard.entities?.items) ? memoryCard.entities.items : [],
      organizations: Array.isArray(memoryCard.entities?.organizations) ? memoryCard.entities.organizations : []
    },
    facts: Array.isArray(memoryCard.facts) ? memoryCard.facts : [],
    state_changes: Array.isArray(memoryCard.state_changes) ? memoryCard.state_changes : [],
    open_threads: Array.isArray(memoryCard.open_threads) ? memoryCard.open_threads : [],
    time_sequence: timeSequence,
    source_excerpt_map: Array.isArray(memoryCard.source_excerpt_map) ? memoryCard.source_excerpt_map : []
  };
}

function parseJsonField(value: any, fallback: any): any {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function serializeMemory(memory: any): any {
  return {
    summary: memory.summary,
    key_events: JSON.stringify(memory.key_events || []),
    entities: JSON.stringify(memory.entities),
    facts: JSON.stringify(memory.facts),
    state_changes: JSON.stringify(memory.state_changes),
    open_threads: JSON.stringify(memory.open_threads),
    time_sequence: JSON.stringify(memory.time_sequence || []),
    source_excerpt_map: JSON.stringify(memory.source_excerpt_map)
  };
}

function deserializeMemory(row: any): any {
  if (!row) return null;

  const plain = typeof row.get === 'function' ? row.get({ plain: true }) : row;
  return {
    ...plain,
    key_events: parseJsonField(plain.key_events, []),
    entities: parseJsonField(plain.entities, {
      characters: [],
      locations: [],
      items: [],
      organizations: []
    }),
    facts: parseJsonField(plain.facts, []),
    state_changes: parseJsonField(plain.state_changes, []),
    open_threads: parseJsonField(plain.open_threads, []),
    time_sequence: parseJsonField(plain.time_sequence, []),
    source_excerpt_map: parseJsonField(plain.source_excerpt_map, [])
  };
}

async function loadChapterContext(chapterId: number): Promise<any> {
  const chapter = await Chapter.findByPk(chapterId);
  if (!chapter) {
    throw new Error('章节不存在');
  }

  const novel = await Novel.findByPk(chapter.novel_id);
  if (!novel) {
    throw new Error('小说不存在');
  }

  const architecture = chapter.architecture_id
    ? await Architecture.findByPk(chapter.architecture_id)
    : null;

  return { chapter, novel, architecture };
}

async function upsertForChapter(chapterId: number, signal?: AbortSignal, options: { taskId?: string | null } = {}): Promise<any> {
  const { chapter, novel, architecture } = await loadChapterContext(chapterId);

  if (!chapter.content || !chapter.content.trim()) {
    await chapterChunkService.rebuildForChapter(chapterId, signal);
    return null;
  }

  const contentHash = buildContentHash(chapter.content);
  const existing = await ChapterMemory.findOne({ where: { chapter_id: chapterId } });
  if (existing && existing.content_hash === contentHash) {
    const existingChunks = await ChapterChunk.findAll({
      where: { chapter_id: chapterId },
      order: [['chunk_index', 'ASC']]
    });
    const existingChunkIds = existingChunks
      .map((chunk: any) => chunk.id)
      .filter((chunkId: unknown): chunkId is number => typeof chunkId === 'number');

    if (existingChunkIds.length === 0) {
      await chapterChunkService.rebuildForChapter(chapterId, signal);
      return deserializeMemory(existing);
    }

    const vectorStats = await getChapterChunkVectorStats(sequelize, existingChunkIds);
    if (
      vectorStats.totalRowCount !== existingChunkIds.length ||
      vectorStats.distinctChunkCount !== existingChunkIds.length
    ) {
      await chapterChunkService.rebuildForChapter(chapterId, signal);
    }

    return deserializeMemory(existing);
  }

  const existingNovelMemoryCount = await ChapterMemory.count({
    where: { novel_id: chapter.novel_id }
  });

  let memory;
  try {
    const extracted = await chapterMemoryAgent.extractMemoryCard(
      { chapter, novel, architecture },
      signal,
      {
        skipRepairOnParseFailure: existingNovelMemoryCount === 0,
        taskId: options.taskId ?? null,
      }
    );
    memory = normalizeMemoryCard(extracted);
  } catch (error: any) {
    if (existingNovelMemoryCount === 0) {
      console.warn(
        `[chapter-memory] 首章记忆卡生成失败，回退为空记忆卡。chapterId=${chapterId} error=${error.message}`
      );
      memory = normalizeMemoryCard({
        summary: '',
        key_events: [],
        entities: {},
        facts: [],
        state_changes: [],
        open_threads: [],
        time_sequence: [],
        source_excerpt_map: []
      });
    } else {
      throw error;
    }
  }

  const payload: any = {
    novel_id: chapter.novel_id,
    chapter_id: chapter.id,
    chapter_number: chapter.chapter_number,
    content_hash: contentHash,
    ...serializeMemory(memory)
  };

  await chapterChunkService.rebuildForChapter(chapterId, signal, { memoryOverride: memory });

  if (existing) {
    await existing.update(payload);
    return deserializeMemory(existing);
  }

  const created = await ChapterMemory.create(payload);
  return deserializeMemory(created);
}

async function findByChapterId(chapterId: number): Promise<any> {
  const memory = await ChapterMemory.findOne({ where: { chapter_id: chapterId } });
  return deserializeMemory(memory);
}

async function findByNovelId(novelId: number): Promise<any[]> {
  const memories = await ChapterMemory.findAll({
    where: { novel_id: novelId },
    order: [['chapter_number', 'ASC']]
  });
  return memories.map(deserializeMemory);
}

export {
  upsertForChapter,
  findByChapterId,
  findByNovelId,
  buildContentHash,
  normalizeMemoryCard,
  deserializeMemory
};
