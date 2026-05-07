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

test('splitIntoChunks groups trimmed paragraphs into stable chunks', () => {
  const chapterChunkService = loadModuleWithMocks('../src/services/chapterChunkService', {
    '../models/sequelize': {
      Chapter: {},
      ChapterChunk: {},
      ChapterMemory: {},
      sequelize: {},
    },
    './embeddingService': {
      embedTexts: async () => [],
    },
    './vectorStoreService': {
      deleteChapterChunkVectors: async () => undefined,
      insertChapterChunkVectors: async () => undefined,
    },
  });

  const content = [
    ' 第一段 ',
    '',
    '第二段',
    '',
    '',
    '  第三段',
    '',
    '第四段  ',
    '',
  ].join('\n');

  const chunks = chapterChunkService.splitIntoChunks(content, 2);

  assert.deepEqual(chunks, [
    '第一段\n\n第二段',
    '第三段\n\n第四段',
  ]);
});

test('rebuildForChapter replaces chapter chunks and syncs vector rows', async () => {
  const deletedChunkIds = [];
  const insertedVectors = [];
  const createdPayloads = [];

  const fakeModels = {
    Chapter: {
      findByPk: async () => ({
        id: 12,
        novel_id: 3,
        chapter_number: 7,
        title: '第七章',
        content: '第一段\n\n第二段\n\n第三段',
      }),
    },
    ChapterMemory: {
      findOne: async () => ({
        entities: JSON.stringify({
          characters: ['林秋'],
          locations: ['旧港'],
          items: ['铜钥匙'],
          organizations: ['守夜会'],
        }),
      }),
    },
    ChapterChunk: {
      findAll: async () => ([
        { id: 81, chunk_index: 0 },
        { id: 82, chunk_index: 1 },
      ]),
      destroy: async () => undefined,
      bulkCreate: async (payloads) => {
        createdPayloads.push(...payloads);
        return payloads.map((payload, index) => ({
          id: 201 + index,
          ...payload,
        }));
      },
    },
    sequelize: { dialect: 'sqlite' },
  };

  const chapterChunkService = loadModuleWithMocks('../src/services/chapterChunkService', {
    '../models/sequelize': fakeModels,
    './embeddingService': {
      embedTexts: async (texts) => {
        assert.deepEqual(texts, [
          '标签: 人物: 林秋 | 地点: 旧港 | 物品: 铜钥匙 | 组织: 守夜会\n\n第一段\n\n第二段\n\n第三段',
        ]);
        return [[0.1, 0.2, 0.3]];
      },
    },
    './vectorStoreService': {
      deleteChapterChunkVectors: async (sequelize, chunkIds) => {
        assert.equal(sequelize, fakeModels.sequelize);
        deletedChunkIds.push(...chunkIds);
      },
      insertChapterChunkVectors: async (sequelize, rows) => {
        assert.equal(sequelize, fakeModels.sequelize);
        insertedVectors.push(...rows);
      },
    },
  });

  await chapterChunkService.rebuildForChapter(12);

  assert.deepEqual(deletedChunkIds, [81, 82]);
  assert.deepEqual(createdPayloads, [
    {
      novel_id: 3,
      chapter_id: 12,
      chunk_index: 3,
      content: '第一段\n\n第二段\n\n第三段',
      metadata: JSON.stringify({
        chapterNumber: 7,
        labels: {
          characters: ['林秋'],
          locations: ['旧港'],
          items: ['铜钥匙'],
          organizations: ['守夜会'],
        },
      }),
    },
  ]);
  assert.deepEqual(insertedVectors, [
    {
      chunkId: 201,
      embedding: [0.1, 0.2, 0.3],
    },
  ]);
});

test('rebuildForChapter removes freshly created chunks when vector sync fails', async () => {
  const deletedChunkIds = [];
  const destroyCalls = [];

  const fakeModels = {
    Chapter: {
      findByPk: async () => ({
        id: 13,
        novel_id: 3,
        chapter_number: 8,
        title: '第八章',
        content: '第一段\n\n第二段',
      }),
    },
    ChapterMemory: {
      findOne: async () => null,
    },
    ChapterChunk: {
      findAll: async () => ([
        { id: 91, chunk_index: 0 },
      ]),
      destroy: async (options) => {
        destroyCalls.push(options);
      },
      bulkCreate: async (payloads) => payloads.map((payload, index) => ({
        id: 301 + index,
        ...payload,
      })),
    },
    sequelize: { dialect: 'sqlite' },
  };

  const chapterChunkService = loadModuleWithMocks('../src/services/chapterChunkService', {
    '../models/sequelize': fakeModels,
    './embeddingService': {
      embedTexts: async () => [[0.5, 0.6]],
    },
    './vectorStoreService': {
      deleteChapterChunkVectors: async (_sequelize, chunkIds) => {
        deletedChunkIds.push([...chunkIds]);
      },
      insertChapterChunkVectors: async () => {
        throw new Error('vector insert failed');
      },
    },
  });

  await assert.rejects(
    chapterChunkService.rebuildForChapter(13),
    /vector insert failed/
  );

  assert.deepEqual(deletedChunkIds, [[301]]);
  assert.deepEqual(destroyCalls, [
    { where: { id: [301] } },
  ]);
});

test('rebuildForChapter does not wipe old chunks before bulkCreate succeeds', async () => {
  const deletedChunkIds = [];
  const destroyCalls = [];

  const fakeModels = {
    Chapter: {
      findByPk: async () => ({
        id: 14,
        novel_id: 3,
        chapter_number: 9,
        title: '第九章',
        content: '第一段\n\n第二段',
      }),
    },
    ChapterMemory: {
      findOne: async () => null,
    },
    ChapterChunk: {
      findAll: async () => ([
        { id: 101, chunk_index: 0 },
        { id: 102, chunk_index: 1 },
      ]),
      destroy: async (options) => {
        destroyCalls.push(options);
      },
      bulkCreate: async () => {
        throw new Error('bulk create failed');
      },
    },
    sequelize: { dialect: 'sqlite' },
  };

  const chapterChunkService = loadModuleWithMocks('../src/services/chapterChunkService', {
    '../models/sequelize': fakeModels,
    './embeddingService': {
      embedTexts: async () => [[0.5, 0.6]],
    },
    './vectorStoreService': {
      deleteChapterChunkVectors: async (_sequelize, chunkIds) => {
        deletedChunkIds.push([...chunkIds]);
      },
      insertChapterChunkVectors: async () => undefined,
    },
  });

  await assert.rejects(
    chapterChunkService.rebuildForChapter(14),
    /bulk create failed/
  );

  assert.deepEqual(deletedChunkIds, []);
  assert.deepEqual(destroyCalls, []);
});

test('upsertForChapter clears chunks through rebuild path when chapter content is empty', async () => {
  const rebuildCalls = [];

  const chapterMemoryService = loadModuleWithMocks('../src/services/chapterMemoryService', {
    '../models/sequelize': {
      Chapter: {
        findByPk: async () => ({
          id: 8,
          novel_id: 4,
          architecture_id: null,
          chapter_number: 3,
          title: '第三章',
          content: '   ',
        }),
      },
      ChapterMemory: {},
      Novel: {
        findByPk: async () => ({ id: 4, title: '测试小说' }),
      },
      Architecture: {
        findByPk: async () => null,
      },
      ChapterChunk: {},
    },
    '../agents/chapterMemoryAgent': {},
    './chapterChunkService': {
      rebuildForChapter: async (chapterId) => {
        rebuildCalls.push(chapterId);
      },
    },
  });

  const result = await chapterMemoryService.upsertForChapter(8);

  assert.equal(result, null);
  assert.deepEqual(rebuildCalls, [8]);
});

test('upsertForChapter rebuilds chunks after storing memory', async () => {
  const rebuildCalls = [];

  const chapterMemoryService = loadModuleWithMocks('../src/services/chapterMemoryService', {
    '../models/sequelize': {
      Chapter: {
        findByPk: async () => ({
          id: 5,
          novel_id: 9,
          architecture_id: null,
          chapter_number: 2,
          title: '第二章',
          content: '新的章节正文',
        }),
      },
      ChapterMemory: {
        findOne: async () => null,
        count: async () => 1,
        create: async (payload) => payload,
      },
      Novel: {
        findByPk: async () => ({ id: 9, title: '测试小说' }),
      },
      Architecture: {
        findByPk: async () => null,
      },
      ChapterChunk: {
        count: async () => 0,
      },
    },
    '../agents/chapterMemoryAgent': {
      extractMemoryCard: async () => ({
        summary: '摘要',
        key_events: [],
        entities: {
          characters: ['林秋'],
          locations: [],
          items: [],
          organizations: [],
        },
        facts: [],
        state_changes: [],
        open_threads: [],
        source_excerpt_map: [],
      }),
    },
    './chapterChunkService': {
      rebuildForChapter: async (chapterId) => {
        rebuildCalls.push(chapterId);
      },
    },
  });

  await chapterMemoryService.upsertForChapter(5);

  assert.deepEqual(rebuildCalls, [5]);
});

test('upsertForChapter does not persist new memory hash before rebuild succeeds', async () => {
  let updateCalls = 0;

  const existingMemory = {
    content_hash: 'old-hash',
    update: async () => {
      updateCalls += 1;
    },
  };

  const chapterMemoryService = loadModuleWithMocks('../src/services/chapterMemoryService', {
    '../models/sequelize': {
      Chapter: {
        findByPk: async () => ({
          id: 6,
          novel_id: 9,
          architecture_id: null,
          chapter_number: 3,
          title: '第三章',
          content: '新的章节正文',
        }),
      },
      ChapterMemory: {
        findOne: async () => existingMemory,
        count: async () => 1,
      },
      Novel: {
        findByPk: async () => ({ id: 9, title: '测试小说' }),
      },
      Architecture: {
        findByPk: async () => null,
      },
      ChapterChunk: {
        count: async () => 1,
        findAll: async () => [{ id: 12 }],
      },
      sequelize: {},
    },
    '../agents/chapterMemoryAgent': {
      extractMemoryCard: async () => ({
        summary: '摘要',
        key_events: [],
        entities: {
          characters: ['林秋'],
          locations: [],
          items: [],
          organizations: [],
        },
        facts: [],
        state_changes: [],
        open_threads: [],
        source_excerpt_map: [],
      }),
    },
    './chapterChunkService': {
      rebuildForChapter: async () => {
        throw new Error('rebuild failed');
      },
    },
    './vectorStoreService': {
      getChapterChunkVectorStats: async () => ({
        totalRowCount: 1,
        distinctChunkCount: 1,
      }),
    },
  });

  await assert.rejects(
    chapterMemoryService.upsertForChapter(6),
    /rebuild failed/
  );

  assert.equal(updateCalls, 0);
});

test('upsertForChapter repairs chunk vectors when content hash matches but vectors are missing', async () => {
  const rebuildCalls = [];

  const chapterMemoryService = loadModuleWithMocks('../src/services/chapterMemoryService', {
    '../models/sequelize': {
      Chapter: {
        findByPk: async () => ({
          id: 10,
          novel_id: 9,
          architecture_id: null,
          chapter_number: 4,
          title: '第四章',
          content: '稳定正文',
        }),
      },
      ChapterMemory: {
        findOne: async () => ({
          chapter_id: 10,
          content_hash: require('node:crypto').createHash('sha256').update('稳定正文').digest('hex'),
          entities: JSON.stringify({
            characters: ['林秋'],
            locations: [],
            items: [],
            organizations: [],
          }),
        }),
      },
      ChapterChunk: {
        count: async () => 2,
        findAll: async () => [{ id: 71 }, { id: 72 }],
      },
      Novel: {
        findByPk: async () => ({ id: 9, title: '测试小说' }),
      },
      Architecture: {
        findByPk: async () => null,
      },
      sequelize: {},
    },
    '../agents/chapterMemoryAgent': {},
    './chapterChunkService': {
      rebuildForChapter: async (chapterId) => {
        rebuildCalls.push(chapterId);
      },
    },
    './vectorStoreService': {
      getChapterChunkVectorStats: async (_sequelize, chunkIds) => {
        assert.deepEqual(chunkIds, [71, 72]);
        return {
          totalRowCount: 1,
          distinctChunkCount: 1,
        };
      },
    },
  });

  const memory = await chapterMemoryService.upsertForChapter(10);

  assert.equal(memory.chapter_id, 10);
  assert.deepEqual(rebuildCalls, [10]);
});

test('upsertForChapter repairs chunk vectors when content hash matches but vectors are duplicated', async () => {
  const rebuildCalls = [];

  const chapterMemoryService = loadModuleWithMocks('../src/services/chapterMemoryService', {
    '../models/sequelize': {
      Chapter: {
        findByPk: async () => ({
          id: 11,
          novel_id: 9,
          architecture_id: null,
          chapter_number: 5,
          title: '第五章',
          content: '稳定正文',
        }),
      },
      ChapterMemory: {
        findOne: async () => ({
          chapter_id: 11,
          content_hash: require('node:crypto').createHash('sha256').update('稳定正文').digest('hex'),
          entities: JSON.stringify({
            characters: ['林秋'],
            locations: [],
            items: [],
            organizations: [],
          }),
        }),
      },
      ChapterChunk: {
        findAll: async () => [{ id: 81 }, { id: 82 }],
      },
      Novel: {
        findByPk: async () => ({ id: 9, title: '测试小说' }),
      },
      Architecture: {
        findByPk: async () => null,
      },
      sequelize: {},
    },
    '../agents/chapterMemoryAgent': {},
    './chapterChunkService': {
      rebuildForChapter: async (chapterId) => {
        rebuildCalls.push(chapterId);
      },
    },
    './vectorStoreService': {
      getChapterChunkVectorStats: async (_sequelize, chunkIds) => {
        assert.deepEqual(chunkIds, [81, 82]);
        return {
          totalRowCount: 3,
          distinctChunkCount: 2,
        };
      },
    },
  });

  const memory = await chapterMemoryService.upsertForChapter(11);

  assert.equal(memory.chapter_id, 11);
  assert.deepEqual(rebuildCalls, [11]);
});

test('chapter chunk vector helpers bootstrap schema before delete and insert', async () => {
  const originalLoad = Module._load;
  const loadedConnections = [];
  const executedStatements = [];
  const fakeConnection = {
    run(statement, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }

      executedStatements.push({ statement, params });
      callback(null);
    },
  };
  const fakeSequelize = {
    connectionManager: {
      async getConnection() {
        return fakeConnection;
      },
      async releaseConnection() {
        return undefined;
      },
    },
  };
  const resolvedPath = require.resolve('../src/services/vectorStoreService');

  delete require.cache[resolvedPath];
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'sqlite-vec') {
      return {
        load(connection) {
          loadedConnections.push(connection);
        },
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const vectorStoreService = require('../src/services/vectorStoreService');

    await vectorStoreService.deleteChapterChunkVectors(fakeSequelize, [11]);
    await vectorStoreService.insertChapterChunkVectors(fakeSequelize, [
      { chunkId: 21, embedding: [0.1, 0.2] },
    ]);
  } finally {
    Module._load = originalLoad;
  }

  assert.deepEqual(loadedConnections, [fakeConnection]);
  assert.deepEqual(executedStatements, [
    {
      statement: 'CREATE VIRTUAL TABLE IF NOT EXISTS chapter_chunk_vec USING vec0(chunk_id integer, embedding float[1024])',
      params: [],
    },
    {
      statement: 'DELETE FROM chapter_chunk_vec WHERE chunk_id = ?',
      params: [11],
    },
    {
      statement: 'CREATE VIRTUAL TABLE IF NOT EXISTS chapter_chunk_vec USING vec0(chunk_id integer, embedding float[1024])',
      params: [],
    },
    {
      statement: 'INSERT INTO chapter_chunk_vec (chunk_id, embedding) VALUES (?, ?)',
      params: [21, JSON.stringify([0.1, 0.2])],
    },
  ]);
});
