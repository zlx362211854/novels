const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildContentHash,
  normalizeMemoryCard,
  upsertForChapter
} = require('../src/services/chapterMemoryService');
const { Chapter, ChapterMemory, Novel } = require('../src/models/sequelize');
const chapterMemoryAgent = require('../src/agents/chapterMemoryAgent');

test('buildContentHash is stable for identical content and changes when content changes', () => {
  const first = buildContentHash('chapter body');
  const second = buildContentHash('chapter body');
  const changed = buildContentHash('chapter body updated');

  assert.equal(first, second);
  assert.notEqual(first, changed);
});

test('normalizeMemoryCard fills missing fields with safe defaults', () => {
  const normalized = normalizeMemoryCard({
    summary: 'summary only'
  });

  assert.equal(normalized.summary, 'summary only');
  assert.deepEqual(normalized.entities, {
    characters: [],
    locations: [],
    items: [],
    organizations: []
  });
  assert.deepEqual(normalized.facts, []);
  assert.deepEqual(normalized.state_changes, []);
  assert.deepEqual(normalized.open_threads, []);
  assert.deepEqual(normalized.source_excerpt_map, []);
});

test('upsertForChapter falls back to an empty memory card for the first chapter when parsing fails', async () => {
  const originalChapterFind = Chapter.findByPk;
  const originalNovelFind = Novel.findByPk;
  const originalMemoryFindOne = ChapterMemory.findOne;
  const originalMemoryCount = ChapterMemory.count;
  const originalMemoryCreate = ChapterMemory.create;
  const originalExtract = chapterMemoryAgent.extractMemoryCard;

  Chapter.findByPk = async () => ({
    id: 1,
    novel_id: 7,
    chapter_number: 1,
    title: '第一章',
    content: '正文内容',
    architecture_id: null
  });
  Novel.findByPk = async () => ({ id: 7, title: '测试小说' });
  ChapterMemory.findOne = async () => null;
  ChapterMemory.count = async () => 0;
  chapterMemoryAgent.extractMemoryCard = async () => {
    throw new Error('bad json');
  };

  let createdPayload = null;
  ChapterMemory.create = async (payload) => {
    createdPayload = payload;
    return payload;
  };

  try {
    const memory = await upsertForChapter(1);
    assert.equal(memory.summary, '');
    assert.deepEqual(memory.entities.characters, []);
    assert.deepEqual(memory.facts, []);
    assert.deepEqual(memory.open_threads, []);
    assert.ok(createdPayload);
  } finally {
    Chapter.findByPk = originalChapterFind;
    Novel.findByPk = originalNovelFind;
    ChapterMemory.findOne = originalMemoryFindOne;
    ChapterMemory.count = originalMemoryCount;
    ChapterMemory.create = originalMemoryCreate;
    chapterMemoryAgent.extractMemoryCard = originalExtract;
  }
});
