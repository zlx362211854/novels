import { StoryBibleEntry, sequelize } from '../models/sequelize';
import { embedText } from './embeddingService';
import {
  deleteStoryBibleEntryVector,
  getStoryBibleEntriesVectors,
  getStoryBibleEntryVector,
  upsertStoryBibleEntryVector,
} from './vectorStoreService';

interface NormalizeInput {
  type?: string;
  title?: string;
  content?: string;
  priority?: number;
  labels?: unknown;
}

interface CreateEntryInput extends NormalizeInput {
  novelId: number;
}

interface UpdateEntryInput extends NormalizeInput {}

function normalizeStoryBibleEntry(entry: NormalizeInput = {}) {
  return {
    type: typeof entry.type === 'string' && entry.type.trim() ? entry.type.trim() : 'world_rule',
    title: typeof entry.title === 'string' && entry.title.trim() ? entry.title.trim() : '未命名条目',
    content: typeof entry.content === 'string' ? entry.content.trim() : '',
    priority: Number.isFinite(entry.priority) ? Number(entry.priority) : 100,
    labels: Array.isArray(entry.labels)
      ? entry.labels.filter((label): label is string => typeof label === 'string' && label.trim().length > 0)
      : [],
  };
}

function parseMetadata(metadata: unknown): {
  priority: number;
  labels: string[];
} {
  if (!metadata) {
    return {
      priority: 100,
      labels: [],
    };
  }

  try {
    const parsed = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
    return {
      priority: Number.isFinite(parsed?.priority) ? Number(parsed.priority) : 100,
      labels: Array.isArray(parsed?.labels)
        ? parsed.labels.filter((label: unknown): label is string => typeof label === 'string' && label.trim().length > 0)
        : [],
    };
  } catch {
    return {
      priority: 100,
      labels: [],
    };
  }
}

function serializeEntry(entry: any) {
  if (!entry) {
    return null;
  }

  const metadata = parseMetadata(entry.metadata);
  return {
    id: entry.id,
    novel_id: entry.novel_id,
    type: entry.entry_type,
    title: entry.title,
    content: entry.content,
    priority: metadata.priority,
    labels: metadata.labels,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
  };
}

function buildEmbeddingText(title: string, content: string): string {
  if (!content) {
    return title;
  }

  return `${title}\n\n${content}`;
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0 || right.length === 0) {
    return 0;
  }

  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < length; index += 1) {
    const leftValue = Number(left[index] || 0);
    const rightValue = Number(right[index] || 0);
    dot += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }

  if (!leftNorm || !rightNorm) {
    return 0;
  }

  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function computePriorityBoost(priority: number): number {
  const normalizedPriority = Number.isFinite(priority) ? Math.max(1, Number(priority)) : 100;
  return Math.max(0, (101 - Math.min(normalizedPriority, 100)) / 1000);
}

async function findEntryRecord(novelId: number | string, entryId: number | string) {
  return await StoryBibleEntry.findOne({
    where: {
      id: entryId,
      novel_id: novelId,
    },
  });
}

async function createEntry(data: CreateEntryInput) {
  const normalized = normalizeStoryBibleEntry(data);
  const entry = await StoryBibleEntry.create({
    novel_id: data.novelId,
    entry_type: normalized.type,
    title: normalized.title,
    content: normalized.content,
    metadata: JSON.stringify({
      priority: normalized.priority,
      labels: normalized.labels,
    }),
  });

  try {
    const embedding = await embedText(buildEmbeddingText(normalized.title, normalized.content));
    await upsertStoryBibleEntryVector(sequelize, {
      entryId: entry.id,
      embedding,
    });
  } catch (error) {
    console.warn(
      `[story-bible] embedding skipped for entry ${entry.id} (novelId=${data.novelId}, title="${normalized.title}")`,
      error instanceof Error ? error.message : error
    );
  }

  return serializeEntry(entry);
}

async function listEntries(novelId: number | string) {
  const entries = await StoryBibleEntry.findAll({
    where: { novel_id: novelId },
    order: [
      ['updated_at', 'DESC'],
      ['id', 'DESC'],
    ],
  });

  return entries.map(serializeEntry);
}

async function getEntryById(novelId: number | string, entryId: number | string) {
  const entry = await findEntryRecord(novelId, entryId);
  return serializeEntry(entry);
}

async function updateEntry(novelId: number | string, entryId: number | string, data: UpdateEntryInput) {
  const entry = await findEntryRecord(novelId, entryId);
  if (!entry) {
    return null;
  }

  const previous = serializeEntry(entry);
  const normalized = normalizeStoryBibleEntry({
    type: data.type ?? previous?.type,
    title: data.title ?? previous?.title,
    content: data.content ?? previous?.content,
    priority: data.priority ?? previous?.priority,
    labels: data.labels ?? previous?.labels,
  });

  entry.entry_type = normalized.type;
  entry.title = normalized.title;
  entry.content = normalized.content;
  entry.metadata = JSON.stringify({
    priority: normalized.priority,
    labels: normalized.labels,
  });

  await entry.save();

  try {
    const embedding = await embedText(buildEmbeddingText(normalized.title, normalized.content));
    await upsertStoryBibleEntryVector(sequelize, {
      entryId: entry.id,
      embedding,
    });
  } catch (error) {
    entry.entry_type = previous!.type;
    entry.title = previous!.title;
    entry.content = previous!.content;
    entry.metadata = JSON.stringify({
      priority: previous!.priority,
      labels: previous!.labels,
    });
    await entry.save();
    throw error;
  }

  return serializeEntry(entry);
}

async function deleteEntry(novelId: number | string, entryId: number | string) {
  const entry = await findEntryRecord(novelId, entryId);
  if (!entry) {
    return false;
  }

  const previousVector = await getStoryBibleEntryVector(sequelize, Number(entryId));
  await deleteStoryBibleEntryVector(sequelize, Number(entryId));

  try {
    await entry.destroy();
  } catch (error) {
    if (previousVector) {
      await upsertStoryBibleEntryVector(sequelize, {
        entryId: Number(entryId),
        embedding: previousVector,
      });
    }
    throw error;
  }

  return true;
}

async function findRelevantEntries(
  novelId: number,
  queryEmbedding: number[],
  options: { limit?: number } = {}
) {
  const entries = await StoryBibleEntry.findAll({
    where: { novel_id: novelId },
    order: [['updated_at', 'DESC'], ['id', 'DESC']],
  });

  const entryIds = entries
    .map((entry: any) => entry.id)
    .filter((entryId: unknown): entryId is number => typeof entryId === 'number');
  const vectors = await getStoryBibleEntriesVectors(sequelize, entryIds);
  const vectorMap = new Map(vectors.map((row) => [row.entryId, row.embedding]));

  return entries
    .map((entry: any) => {
      const embedding = vectorMap.get(Number(entry.id));
      if (!embedding) return null;
      const serialized = serializeEntry(entry);
      const semanticScore = cosineSimilarity(queryEmbedding, embedding);
      return {
        ...serialized,
        semanticScore,
        priorityBoost: computePriorityBoost(serialized.priority),
        score: semanticScore + computePriorityBoost(serialized.priority),
      };
    })
    .filter((entry: any) => entry && entry.score > 0)
    .sort((left: any, right: any) => right.score - left.score)
    .slice(0, options.limit || 6);
}

export {
  createEntry,
  deleteEntry,
  findRelevantEntries,
  getEntryById,
  listEntries,
  normalizeStoryBibleEntry,
  updateEntry,
};
