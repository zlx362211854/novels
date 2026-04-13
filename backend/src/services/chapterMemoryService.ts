import * as crypto from 'node:crypto';
import { Chapter, ChapterMemory, Novel, Architecture } from '../models/sequelize';
import * as chapterMemoryAgent from '../agents/chapterMemoryAgent';

function buildContentHash(content: string): string {
  return crypto.createHash('sha256').update(content || '').digest('hex');
}

function normalizeMemoryCard(memoryCard: any = {}): any {
  return {
    summary: memoryCard.summary || '',
    entities: {
      characters: Array.isArray(memoryCard.entities?.characters) ? memoryCard.entities.characters : [],
      locations: Array.isArray(memoryCard.entities?.locations) ? memoryCard.entities.locations : [],
      items: Array.isArray(memoryCard.entities?.items) ? memoryCard.entities.items : [],
      organizations: Array.isArray(memoryCard.entities?.organizations) ? memoryCard.entities.organizations : []
    },
    facts: Array.isArray(memoryCard.facts) ? memoryCard.facts : [],
    state_changes: Array.isArray(memoryCard.state_changes) ? memoryCard.state_changes : [],
    open_threads: Array.isArray(memoryCard.open_threads) ? memoryCard.open_threads : [],
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
    entities: JSON.stringify(memory.entities),
    facts: JSON.stringify(memory.facts),
    state_changes: JSON.stringify(memory.state_changes),
    open_threads: JSON.stringify(memory.open_threads),
    source_excerpt_map: JSON.stringify(memory.source_excerpt_map)
  };
}

function deserializeMemory(row: any): any {
  if (!row) return null;

  const plain = typeof row.get === 'function' ? row.get({ plain: true }) : row;
  return {
    ...plain,
    entities: parseJsonField(plain.entities, {
      characters: [],
      locations: [],
      items: [],
      organizations: []
    }),
    facts: parseJsonField(plain.facts, []),
    state_changes: parseJsonField(plain.state_changes, []),
    open_threads: parseJsonField(plain.open_threads, []),
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

async function upsertForChapter(chapterId: number, signal?: AbortSignal): Promise<any> {
  const { chapter, novel, architecture } = await loadChapterContext(chapterId);

  if (!chapter.content || !chapter.content.trim()) {
    return null;
  }

  const contentHash = buildContentHash(chapter.content);
  const existing = await ChapterMemory.findOne({ where: { chapter_id: chapterId } });
  if (existing && existing.content_hash === contentHash) {
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
      { skipRepairOnParseFailure: existingNovelMemoryCount === 0 }
    );
    memory = normalizeMemoryCard(extracted);
  } catch (error: any) {
    if (existingNovelMemoryCount === 0) {
      console.warn(
        `[chapter-memory] 首章记忆卡生成失败，回退为空记忆卡。chapterId=${chapterId} error=${error.message}`
      );
      memory = normalizeMemoryCard({
        summary: '',
        entities: {},
        facts: [],
        state_changes: [],
        open_threads: [],
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