import test from 'node:test';
import assert from 'node:assert/strict';

import { buildNextChapterDraft, summarizeMemory, summarizeReview } from '../src/lib/chapterWorkspace.js';

test('summarizeMemory counts structured memory sections for compact context panels', () => {
  const summary = summarizeMemory({
    key_events: [{ event: '发现线索' }, { event: '达成交易' }],
    entities: {
      characters: ['林霄', '阿九'],
      locations: ['旧城'],
      items: ['玄铁佩'],
      organizations: [],
    },
    facts: [{ subject: '林霄', predicate: '持有', object: '玄铁佩' }],
    state_changes: [{ entity: '玄铁佩', from: '失踪', to: '现世' }],
    open_threads: [{ thread: '幕后买家身份未知' }],
  });

  assert.deepEqual(summary, {
    hasMemory: true,
    keyEventCount: 2,
    entityCount: 4,
    factCount: 1,
    stateChangeCount: 1,
    openThreadCount: 1,
  });
});

test('summarizeReview exposes score status and issue counts', () => {
  assert.deepEqual(
    summarizeReview({
      score: 62,
      issues: [{ type: 'timeline_conflict' }, { type: 'knowledge_conflict' }],
      notes: ['需要补足动机'],
    }),
    {
      hasReview: true,
      score: 62,
      status: 'warning',
      issueCount: 2,
      noteCount: 1,
    }
  );

  assert.equal(summarizeReview(null).hasReview, false);
});

test('buildNextChapterDraft creates the next generated chapter payload', () => {
  assert.deepEqual(
    buildNextChapterDraft(
      { chapter_number: 12, title: '风雨前夜' },
      { id: 88, title: '雪夜追踪' }
    ),
    {
      architectureId: 88,
      chapterNumber: 13,
      title: '雪夜追踪',
      content: '',
      status: 'generating',
    }
  );
});
