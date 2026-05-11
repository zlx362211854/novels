require('ts-node').register({
  project: require('node:path').join(__dirname, '..', 'tsconfig.json'),
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    moduleResolution: 'node',
    ignoreDeprecations: '6.0',
  },
});

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function loadModuleWithMocks(modulePath, mocks) {
  const resolvedPath = require.resolve(modulePath);
  const originalLoad = Module._load;

  delete require.cache[resolvedPath];

  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(modulePath);
  } finally {
    Module._load = originalLoad;
  }
}

test('buildChapterArchitectureReviewPrompt serializes full, volume and ordered chapter architectures', () => {
  const service = loadModuleWithMocks('../src/services/architectureReviewService', {
    '../models/sequelize': {
      Novel: {},
      Architecture: {},
    },
    './architectureService': {},
  });

  const prompt = service.buildChapterArchitectureReviewPrompt(
    { title: '寒刃凌霄', genre: '武侠' },
    { id: 1, title: '全书', plot_outline: '总纲' },
    [{ id: 2, title: '第一卷', plot_outline: '卷纲' }],
    [
      { id: 10, title: '第一章', plot_outline: '章一', parent_id: 2, characters: '[]', world_setting: '临安', emotional_tone: '沉郁' },
      { id: 11, title: '第二章', plot_outline: '章二', parent_id: 2, characters: '[]', world_setting: '江湖', emotional_tone: '压抑' },
    ],
  );

  assert.match(prompt, /寒刃凌霄/);
  assert.match(prompt, /第一卷/);
  // chapter blocks should lead with the DB id, not the ordinal,
  // so the model treats `章架构ID=10` as the canonical identifier.
  assert.match(prompt, /## 章架构ID=10 第1章「第一章」/);
  assert.match(prompt, /## 章架构ID=11 第2章「第二章」/);
  assert.match(prompt, /禁止使用「第N章」中的序号/);
  assert.match(prompt, /完整性/);
  assert.match(prompt, /missing_transition/);
});

test('reviewChapterArchitectures loads ordered architecture context and parses review json', async () => {
  const novel = { id: 2, title: '寒刃凌霄', genre: '武侠' };
  const architectures = [
    { id: 1, novel_id: 2, level: 'full', title: '全书', plot_outline: '总纲' },
    { id: 2, novel_id: 2, level: 'volume', title: '第一卷', plot_outline: '卷纲' },
    { id: 10, novel_id: 2, level: 'chapter', parent_id: 2, title: '第一章', plot_outline: '章一' },
  ];

  const service = loadModuleWithMocks('../src/services/architectureReviewService', {
    '../models/sequelize': {
      Novel: { findByPk: async () => novel },
      Architecture: { findAll: async () => architectures },
    },
    '../ai/llmFactory': {
      createLLM: async () => ({}),
    },
    '../ai/streaming': {
      invokeWithStreaming: async () => '{"summary":{"overallAssessment":"ok","integrityScore":80,"flowScore":81,"bugScore":82},"issues":[]}',
    },
    './architectureService': {},
  });

  const result = await service.reviewChapterArchitectures(2);

  assert.equal(result.summary.overallAssessment, 'ok');
  assert.deepEqual(result.issues, []);
});

test('repairChapterArchitectures returns structured updated and new chapters only', async () => {
  const service = loadModuleWithMocks('../src/services/architectureReviewService', {
    '../models/sequelize': {
      Novel: { findByPk: async () => ({ id: 2, title: '寒刃凌霄', genre: '武侠' }) },
      Architecture: {
        findAll: async () => [
          { id: 1, novel_id: 2, level: 'full', title: '全书', plot_outline: '总纲' },
          { id: 2, novel_id: 2, level: 'volume', title: '第一卷', plot_outline: '卷纲' },
          { id: 10, novel_id: 2, level: 'chapter', parent_id: 2, title: '第一章', plot_outline: '章一' },
        ],
      },
    },
    '../ai/llmFactory': {
      createLLM: async () => ({}),
    },
    '../ai/streaming': {
      invokeWithStreaming: async () => JSON.stringify({
        updatedChapters: [
          {
            chapterId: 10,
            title: '第一章',
            plotOutline: '修补后',
            characters: ['林霄'],
            worldSetting: '临安',
            emotionalTone: '压抑',
          },
        ],
        newChapters: [],
      }),
    },
    './architectureService': {},
  });

  const result = await service.repairChapterArchitectures(2, { summary: {}, issues: [] }, '');

  assert.equal(result.updatedChapters.length, 1);
  assert.deepEqual(result.newChapters, []);
});

test('applyChapterArchitectureRepair updates affected chapter architectures', async () => {
  const updates = [];

  const service = loadModuleWithMocks('../src/services/architectureReviewService', {
    '../models/sequelize': {
      Novel: {},
      Architecture: {
        findAll: async () => [
          { id: 10, novel_id: 2, level: 'chapter', parent_id: 2 },
        ],
      },
    },
    './architectureService': {
      update: async (id, payload) => {
        updates.push({ id, payload });
        return { id, ...payload };
      },
      create: async () => undefined,
    },
  });

  const result = await service.applyChapterArchitectureRepair(2, {
    updatedChapters: [
      {
        chapterId: 10,
        title: '第一章',
        plotOutline: '修补后',
        characters: ['林霄'],
        worldSetting: '临安',
        emotionalTone: '压抑',
      },
    ],
    newChapters: [],
  });

  assert.equal(result.updated, 1);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].id, 10);
  assert.equal(updates[0].payload.title, '第一章');
});

test('applyChapterArchitectureRepair inserts new chapter under the target parent volume', async () => {
  const creates = [];

  const service = loadModuleWithMocks('../src/services/architectureReviewService', {
    '../models/sequelize': {
      Novel: {},
      Architecture: {
        findAll: async () => [
          { id: 10, novel_id: 2, level: 'chapter', parent_id: 2 },
        ],
      },
    },
    './architectureService': {
      update: async () => undefined,
      create: async (payload) => {
        creates.push(payload);
        return payload;
      },
    },
  });

  const result = await service.applyChapterArchitectureRepair(2, {
    updatedChapters: [],
    newChapters: [
      {
        insertAfterChapterId: 10,
        title: '新增桥段章',
        plotOutline: '补桥',
        characters: ['林霄'],
        worldSetting: '边地',
        emotionalTone: '压抑',
      },
    ],
  });

  assert.equal(result.created, 1);
  assert.equal(creates.length, 1);
  assert.equal(creates[0].parentId, 2);
});

test('applyChapterArchitectureRepair rejects ordinal-looking ids with a helpful hint', async () => {
  const service = loadModuleWithMocks('../src/services/architectureReviewService', {
    '../models/sequelize': {
      Novel: {},
      Architecture: {
        findAll: async () => [
          { id: 613, novel_id: 2, level: 'chapter', parent_id: 612 },
          { id: 614, novel_id: 2, level: 'chapter', parent_id: 612 },
          { id: 615, novel_id: 2, level: 'chapter', parent_id: 612 },
        ],
      },
    },
    './architectureService': {
      update: async () => undefined,
      create: async () => undefined,
    },
  });

  await assert.rejects(
    () =>
      service.applyChapterArchitectureRepair(2, {
        updatedChapters: [
          {
            chapterId: 33,
            title: 'x',
            plotOutline: 'y',
            characters: [],
            worldSetting: '',
            emotionalTone: '',
          },
        ],
        newChapters: [],
      }),
    /chapterId=33 不是本小说的章架构ID|第N章/
  );
});
