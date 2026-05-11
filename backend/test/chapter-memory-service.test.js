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

const { normalizeMemoryCard } = require('../src/services/chapterMemoryService');

test('normalizeMemoryCard preserves structured time_sequence entries', () => {
  const memory = normalizeMemoryCard({
    summary: '摘要',
    entities: {
      characters: ['林霄'],
    },
    time_sequence: [
      {
        day: 1,
        phase: 'night',
        label: '第1天晚上',
        event: '山洞歇息',
        characters: ['林霄', '宋诗淇'],
        location: '山洞',
      },
    ],
  });

  assert.equal(memory.summary, '摘要');
  assert.deepEqual(memory.entities.characters, ['林霄']);
  assert.equal(memory.time_sequence[0].label, '第1天晚上');
  assert.equal(memory.time_sequence[0].phase, 'night');
});

test('normalizeMemoryCard canonicalizes loose chinese time labels', () => {
  const memory = normalizeMemoryCard({
    time_sequence: [
      {
        day: 2,
        phase: 'afternoon',
        label: '第2天下午',
        event: '山路赶路',
        location: '山路',
      },
      {
        label: '第4天傍晚',
        event: '抵达渡口',
        location: '富春江渡口',
      },
    ],
  });

  assert.equal(memory.time_sequence[0].phase, 'day');
  assert.equal(memory.time_sequence[0].label, '第2天白天');
  assert.equal(memory.time_sequence[1].day, 4);
  assert.equal(memory.time_sequence[1].phase, 'night');
  assert.equal(memory.time_sequence[1].label, '第4天晚上');
});
