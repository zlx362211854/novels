const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node').register({
  project: require('node:path').join(__dirname, '..', 'tsconfig.json'),
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    moduleResolution: 'node',
    ignoreDeprecations: '6.0',
  },
});

const {
  collectQueryTerms,
  buildReviewContext,
  scoreMemoryMatch,
  sliceExcerpt
} = require('../src/services/reviewContextService');
const chapterMemoryService = require('../src/services/chapterMemoryService');
const { Chapter, Novel } = require('../src/models/sequelize');

test('collectQueryTerms flattens entity and fact terms for retrieval', () => {
  const terms = collectQueryTerms({
    entities: {
      characters: ['林秋'],
      locations: ['黑水城'],
      items: [],
      organizations: ['巡夜司']
    },
    facts: [
      {
        subject: '林秋',
        predicate: 'knows',
        object: '青铜钥匙'
      }
    ],
    open_threads: [
      { thread: '青铜钥匙的来历' }
    ]
  });

  assert.deepEqual(terms, ['林秋', '黑水城', '巡夜司', 'knows', '青铜钥匙', '青铜钥匙的来历']);
});

test('scoreMemoryMatch prefers shared entities and facts', () => {
  const currentMemory = {
    entities: {
      characters: ['林秋'],
      locations: ['黑水城'],
      items: [],
      organizations: []
    },
    facts: [
      { subject: '林秋', predicate: 'injured', object: '右手' }
    ],
    open_threads: []
  };

  const relatedMemory = {
    entities: {
      characters: ['林秋'],
      locations: ['黑水城'],
      items: [],
      organizations: []
    },
    facts: [
      { subject: '林秋', predicate: 'injured', object: '右手' }
    ],
    open_threads: []
  };

  const unrelatedMemory = {
    entities: {
      characters: ['沈夜'],
      locations: ['天井镇'],
      items: [],
      organizations: []
    },
    facts: [
      { subject: '沈夜', predicate: 'holds', object: '木牌' }
    ],
    open_threads: []
  };

  assert.ok(scoreMemoryMatch(currentMemory, relatedMemory) > scoreMemoryMatch(currentMemory, unrelatedMemory));
});

test('sliceExcerpt falls back to the beginning when term is missing', () => {
  const excerpt = sliceExcerpt('abcdefghij', 'zzz');
  assert.equal(excerpt, 'abcdefghij');
});

test('buildReviewContext falls back to an empty memory card when current chapter has no content yet', async () => {
  const originalFindByPk = Chapter.findByPk;
  const originalNovelFindByPk = Novel.findByPk;
  const originalUpsert = chapterMemoryService.upsertForChapter;
  const originalFindByNovelId = chapterMemoryService.findByNovelId;

  Chapter.findByPk = async (id) => {
    if (id === 101) {
      return { id: 101, novel_id: 7, content: '', chapter_number: 5, architecture_id: null };
    }
    return null;
  };
  Novel.findByPk = async (id) => {
    if (id === 7) {
      return { id: 7, title: '测试小说' };
    }
    return null;
  };
  chapterMemoryService.upsertForChapter = async () => null;
  chapterMemoryService.findByNovelId = async () => [
    {
      chapter_id: 88,
      chapter_number: 4,
      entities: { characters: ['沈夜'], locations: [], items: [], organizations: [] },
      facts: [{ subject: '沈夜', predicate: '持有', object: '玄铁令' }],
      state_changes: [],
      key_events: [],
      open_threads: [],
      source_excerpt_map: [],
    },
  ];

  try {
    const result = await buildReviewContext(101);
    assert.deepEqual(result.currentMemory.entities, {
      characters: [],
      locations: [],
      items: [],
      organizations: [],
    });
    assert.deepEqual(result.currentMemory.facts, []);
    assert.deepEqual(result.relevantMemories, []);
    assert.deepEqual(result.sourceExcerpts, []);
  } finally {
    Chapter.findByPk = originalFindByPk;
    Novel.findByPk = originalNovelFindByPk;
    chapterMemoryService.upsertForChapter = originalUpsert;
    chapterMemoryService.findByNovelId = originalFindByNovelId;
  }
});
