import { Chapter, ChapterChunk, ChapterMemory, sequelize } from '../models/sequelize';
import { embedTexts } from './embeddingService';
import {
  deleteChapterChunkVectors,
  getChapterChunkVectors,
  insertChapterChunkVectors,
} from './vectorStoreService';

type ChunkLabels = {
  characters: string[];
  locations: string[];
  items: string[];
  organizations: string[];
};

function splitIntoChunks(content: string, paragraphLimit = 4): string[] {
  if (!content || !content.trim()) {
    return [];
  }

  const normalizedParagraphs = content
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (normalizedParagraphs.length === 0) {
    return [];
  }

  const safeLimit = Math.max(1, Math.floor(paragraphLimit) || 1);
  const chunks: string[] = [];

  for (let index = 0; index < normalizedParagraphs.length; index += safeLimit) {
    chunks.push(normalizedParagraphs.slice(index, index + safeLimit).join('\n\n'));
  }

  return chunks;
}

function parseLabels(memoryRow: any): ChunkLabels {
  const fallback: ChunkLabels = {
    characters: [],
    locations: [],
    items: [],
    organizations: [],
  };

  if (!memoryRow?.entities) {
    return fallback;
  }

  let entities = memoryRow.entities;
  if (typeof entities === 'string') {
    try {
      entities = JSON.parse(entities);
    } catch {
      return fallback;
    }
  }

  return {
    characters: Array.isArray(entities?.characters) ? entities.characters : [],
    locations: Array.isArray(entities?.locations) ? entities.locations : [],
    items: Array.isArray(entities?.items) ? entities.items : [],
    organizations: Array.isArray(entities?.organizations) ? entities.organizations : [],
  };
}

function buildEmbeddingText(chunk: string, labels: ChunkLabels): string {
  const labelParts = [
    labels.characters.length > 0 ? `人物: ${labels.characters.join('、')}` : null,
    labels.locations.length > 0 ? `地点: ${labels.locations.join('、')}` : null,
    labels.items.length > 0 ? `物品: ${labels.items.join('、')}` : null,
    labels.organizations.length > 0 ? `组织: ${labels.organizations.join('、')}` : null,
  ].filter(Boolean);

  if (labelParts.length === 0) {
    return chunk;
  }

  return `标签: ${labelParts.join(' | ')}\n\n${chunk}`;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new Error('Operation aborted');
  }
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

function parseMetadata(metadata: any = {}): any {
  if (!metadata) return {};
  if (typeof metadata !== 'string') return metadata;
  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

async function rebuildForChapter(
  chapterId: number,
  signal?: AbortSignal,
  options: { memoryOverride?: any } = {}
): Promise<void> {
  const chapter = await Chapter.findByPk(chapterId);
  if (!chapter) {
    throw new Error('章节不存在');
  }

  const existingChunks = await ChapterChunk.findAll({
    where: { chapter_id: chapterId },
    order: [['chunk_index', 'ASC']],
  });
  const existingChunkIds = existingChunks
    .map((chunk: any) => chunk.id)
    .filter((chunkId: unknown): chunkId is number => typeof chunkId === 'number');

  const content = chapter.content?.trim() || '';
  if (!content) {
    if (existingChunkIds.length > 0) {
      await deleteChapterChunkVectors(sequelize, existingChunkIds);
      await ChapterChunk.destroy({ where: { chapter_id: chapterId } });
    }
    return;
  }

  const chunkContents = splitIntoChunks(content);
  const memory = options.memoryOverride ?? await ChapterMemory.findOne({ where: { chapter_id: chapterId } });
  const labels = parseLabels(memory);
  const metadata = JSON.stringify({
    chapterNumber: chapter.chapter_number,
    labels,
  });

  throwIfAborted(signal);
  const embeddings = await embedTexts(chunkContents.map((chunk) => buildEmbeddingText(chunk, labels)));

  if (embeddings.length !== chunkContents.length) {
    throw new Error(`章节分块向量数量不匹配: expected ${chunkContents.length}, received ${embeddings.length}`);
  }

  throwIfAborted(signal);

  let createdChunkIds: number[] = [];
  const existingChunkIndexMax = existingChunks.reduce((max: number, chunk: any) => {
    return Math.max(max, typeof chunk.chunk_index === 'number' ? chunk.chunk_index : -1);
  }, -1);
  const tempChunkIndexOffset = existingChunkIndexMax + chunkContents.length + 1;

  try {
    const createdChunks = await ChapterChunk.bulkCreate(
      chunkContents.map((chunk, chunkIndex) => ({
        novel_id: chapter.novel_id,
        chapter_id: chapter.id,
        chunk_index: chunkIndex + tempChunkIndexOffset,
        content: chunk,
        metadata,
      }))
    );

    createdChunkIds = createdChunks
      .map((chunk: any) => chunk.id)
      .filter((chunkId: unknown): chunkId is number => typeof chunkId === 'number');

    await insertChapterChunkVectors(
      sequelize,
      createdChunks.map((chunk: any, index: number) => {
        if (typeof chunk.id !== 'number') {
          throw new Error('Chapter chunk id is missing after creation');
        }

        return {
          chunkId: chunk.id,
          embedding: embeddings[index],
        };
      })
    );

    if (existingChunkIds.length > 0) {
      await deleteChapterChunkVectors(sequelize, existingChunkIds);
      await ChapterChunk.destroy({ where: { chapter_id: chapterId, id: existingChunkIds } });
    }

    for (let index = 0; index < createdChunks.length; index += 1) {
      const chunk = createdChunks[index] as any;
      if (typeof chunk.update !== 'function') {
        continue;
      }

      await chunk.update({ chunk_index: index });
    }
  } catch (error) {
    if (createdChunkIds.length > 0) {
      try {
        await deleteChapterChunkVectors(sequelize, createdChunkIds);
      } catch {}

      try {
        await ChapterChunk.destroy({ where: { id: createdChunkIds } });
      } catch {}
    }

    throw error;
  }
}

async function findRelevantChunks(
  novelId: number,
  queryEmbedding: number[],
  options: { excludeChapterId?: number; limit?: number } = {}
) {
  const allChunks = await ChapterChunk.findAll({
    where: { novel_id: novelId },
    order: [['id', 'ASC']],
  });

  const filteredChunks = allChunks.filter((chunk: any) => {
    if (options.excludeChapterId && chunk.chapter_id === options.excludeChapterId) {
      return false;
    }
    return typeof chunk.id === 'number';
  });

  const vectors = await getChapterChunkVectors(
    sequelize,
    filteredChunks.map((chunk: any) => Number(chunk.id))
  );
  const vectorMap = new Map(vectors.map((row) => [row.chunkId, row.embedding]));

  return filteredChunks
    .map((chunk: any) => {
      const embedding = vectorMap.get(Number(chunk.id));
      if (!embedding) return null;
      const metadata = parseMetadata(chunk.metadata);
      return {
        chunkId: chunk.id,
        chapterId: chunk.chapter_id,
        chapterNumber: metadata.chapterNumber,
        text: chunk.content,
        labels: metadata.labels || {},
        score: cosineSimilarity(queryEmbedding, embedding),
      };
    })
    .filter((item: any) => item && item.score > 0)
    .sort((left: any, right: any) => right.score - left.score)
    .slice(0, options.limit || 6);
}

export {
  rebuildForChapter,
  findRelevantChunks,
  splitIntoChunks,
};
