const test = require('node:test');
const assert = require('node:assert/strict');

const chapterService = require('../src/services/chapterService');
const chapterMemoryService = require('../src/services/chapterMemoryService');
const reviewContextService = require('../src/services/reviewContextService');

test('reviewChapter reuses preloaded currentMemory instead of rebuilding it twice', async () => {
  const originalUpsert = chapterMemoryService.upsertForChapter;
  const originalBuildReviewContext = reviewContextService.buildReviewContext;

  const sentinelMemory = { summary: 'm', entities: {}, facts: [], open_threads: [] };
  let upsertCalls = 0;
  let receivedCurrentMemory = null;

  chapterMemoryService.upsertForChapter = async () => {
    upsertCalls += 1;
    return sentinelMemory;
  };

  reviewContextService.buildReviewContext = async (_chapterId, _signal, preloaded = {}) => {
    receivedCurrentMemory = preloaded.currentMemory;
    throw new Error('stop-after-context');
  };

  try {
    await assert.rejects(
      () => chapterService.reviewChapter(999, undefined, {
        chapter: { id: 999, novel_id: 1, content: '正文', chapter_number: 1 },
        novel: { id: 1, title: '测试小说' }
      }),
      /stop-after-context/
    );
    assert.equal(upsertCalls, 1);
    assert.equal(receivedCurrentMemory, sentinelMemory);
  } finally {
    chapterMemoryService.upsertForChapter = originalUpsert;
    reviewContextService.buildReviewContext = originalBuildReviewContext;
  }
});
