import 'dotenv/config';

import { Chapter, StoryBibleEntry, initDatabase, sequelize } from '../models/sequelize';
import { embedText } from '../services/embeddingService';
import { rebuildForChapter } from '../services/chapterChunkService';
import { upsertStoryBibleEntryVector, VECTOR_DIMENSION } from '../services/vectorStoreService';

function buildStoryBibleEmbeddingText(title: string, content: string): string {
  if (!content) {
    return title;
  }

  return `${title}\n\n${content}`;
}

async function rebuildStoryBibleVectors(): Promise<{ processed: number; failed: number }> {
  const entries = await StoryBibleEntry.findAll({
    order: [['id', 'ASC']],
  });
  let failed = 0;

  for (const entry of entries as any[]) {
    try {
      const embedding = await embedText(buildStoryBibleEmbeddingText(entry.title || '', entry.content || ''));
      await upsertStoryBibleEntryVector(sequelize, {
        entryId: entry.id,
        embedding,
      });
      console.log(`[rebuild-vectors] story bible entry ${entry.id} rebuilt (${embedding.length} dims)`);
    } catch (error) {
      failed += 1;
      console.error(
        `[rebuild-vectors] story bible entry ${entry.id} failed:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return {
    processed: entries.length,
    failed,
  };
}

async function rebuildChapterChunkVectors(): Promise<{ processed: number; failed: number }> {
  const chapters = await Chapter.findAll({
    order: [['id', 'ASC']],
  });
  let failed = 0;

  for (const chapter of chapters as any[]) {
    try {
      await rebuildForChapter(chapter.id);
      console.log(`[rebuild-vectors] chapter ${chapter.id} rebuilt`);
    } catch (error) {
      failed += 1;
      console.error(
        `[rebuild-vectors] chapter ${chapter.id} failed:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return {
    processed: chapters.length,
    failed,
  };
}

async function main(): Promise<void> {
  console.log(`[rebuild-vectors] initializing database with vector dimension ${VECTOR_DIMENSION}`);
  await initDatabase();

  const storyBible = await rebuildStoryBibleVectors();
  const chapterChunks = await rebuildChapterChunkVectors();

  console.log(
    `[rebuild-vectors] done: storyBible processed=${storyBible.processed} failed=${storyBible.failed}, chapters processed=${chapterChunks.processed} failed=${chapterChunks.failed}`
  );

  if (storyBible.failed > 0 || chapterChunks.failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error('[rebuild-vectors] fatal:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await sequelize.close();
    } catch {}
  });
