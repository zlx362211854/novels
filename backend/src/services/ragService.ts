import * as reviewContextService from './reviewContextService';
import { embedText } from './embeddingService';
import * as chapterChunkService from './chapterChunkService';
import * as storyBibleService from './storyBibleService';

function formatFacts(facts: any[] = []): string {
  return facts
    .map((fact: any) => [fact.subject, fact.predicate, fact.object].filter(Boolean).join(' '))
    .filter(Boolean)
    .join('\n');
}

function buildQueryText(input: any = {}): string {
  return [
    input.chapter?.title || '',
    input.architecture?.plot_outline || '',
    formatFacts(input.currentMemory?.facts || []),
    input.userPrompt || '',
  ]
    .filter((part) => typeof part === 'string' && part.trim())
    .join('\n');
}

async function buildRetrievalContext(chapterId: number, options: any = {}) {
  const reviewContext = await reviewContextService.buildReviewContext(
    chapterId,
    options.signal,
    options.preloaded || {}
  );

  const queryText = buildQueryText({
    chapter: reviewContext.currentChapter,
    architecture: reviewContext.architecture,
    currentMemory: reviewContext.currentMemory,
    userPrompt: options.userPrompt || '',
  });

  const queryEmbedding = queryText ? await embedText(queryText) : [];
  const novelId = reviewContext.currentChapter?.novel_id;
  const chapterIdToExclude = reviewContext.currentChapter?.id;

  const [retrievedChunks, storyBibleEntries] = await Promise.all([
    queryEmbedding.length > 0 && novelId
      ? chapterChunkService.findRelevantChunks(novelId, queryEmbedding, {
          excludeChapterId: chapterIdToExclude,
          limit: options.chunkLimit || 6,
        })
      : [],
    queryEmbedding.length > 0 && novelId
      ? storyBibleService.findRelevantEntries(novelId, queryEmbedding, {
          limit: options.storyBibleLimit || 6,
        })
      : [],
  ]);

  return {
    ...reviewContext,
    queryText,
    queryEmbedding,
    retrievedChunks,
    storyBibleEntries,
  };
}

export {
  buildQueryText,
  buildRetrievalContext,
};
