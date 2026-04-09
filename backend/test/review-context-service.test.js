const test = require('node:test');
const assert = require('node:assert/strict');

const {
  collectQueryTerms,
  scoreMemoryMatch,
  sliceExcerpt
} = require('../src/services/reviewContextService');

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
