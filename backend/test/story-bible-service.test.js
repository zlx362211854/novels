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

async function withRuntimeMocks(mocks, callback) {
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) {
      return mocks[request];
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return await callback();
  } finally {
    Module._load = originalLoad;
  }
}

function createVectorStoreHarness(options = {}) {
  const state = {
    rows: new Map(),
    deletedEmbeddings: new Map(),
    deleteCountByEntryId: new Map(),
    failInsertForEntryIds: new Set(options.failInsertForEntryIds || []),
    failedInsertForEntryIds: new Set(),
  };

  if (options.initialRows) {
    for (const [entryId, embedding] of Object.entries(options.initialRows)) {
      state.rows.set(Number(entryId), JSON.stringify(embedding));
    }
  }

  const connection = {
    loadExtension() {
      return undefined;
    },
    exec(statement, callback) {
      callback(null);
    },
    run(statement, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }

      const normalizedStatement = statement.replace(/\s+/g, ' ').trim();

      if (normalizedStatement.startsWith('DELETE FROM story_bible_vec')) {
        const entryId = Number(params[0]);
        state.deleteCountByEntryId.set(entryId, (state.deleteCountByEntryId.get(entryId) || 0) + 1);
        if (state.rows.has(entryId)) {
          state.deletedEmbeddings.set(entryId, state.rows.get(entryId));
        }
        state.rows.delete(entryId);
        callback(null);
        return;
      }

      if (normalizedStatement.startsWith('INSERT INTO story_bible_vec')) {
        const entryId = Number(params[0]);
        const shouldFail =
          state.failInsertForEntryIds.has(entryId) &&
          !state.failedInsertForEntryIds.has(entryId);
        if (shouldFail) {
          state.failedInsertForEntryIds.add(entryId);
          callback(new Error('vector insert failed'));
          return;
        }

        state.rows.set(entryId, params[1]);
        callback(null);
        return;
      }

      callback(null);
    },
    all(statement, params, callback) {
      const normalizedStatement = statement.replace(/\s+/g, ' ').trim();
      if (normalizedStatement.startsWith('SELECT embedding FROM story_bible_vec')) {
        const entryId = Number(params[0]);
        const embedding = state.rows.get(entryId);
        callback(null, embedding === undefined ? [] : [{ embedding }]);
        return;
      }

       if (normalizedStatement.startsWith('SELECT entry_id, embedding FROM story_bible_vec WHERE entry_id IN')) {
        const rows = params
          .map((entryId) => {
            const numericId = Number(entryId);
            const embedding = state.rows.get(numericId);
            if (embedding === undefined) {
              return null;
            }
            return {
              entry_id: numericId,
              embedding,
            };
          })
          .filter(Boolean);
        callback(null, rows);
        return;
      }

      callback(null, []);
    },
  };

  const sequelize = {
    connectionManager: {
      async getConnection() {
        return connection;
      },
      async releaseConnection() {
        return undefined;
      },
    },
  };

  return { sequelize, state };
}

function toFloatBuffer(values) {
  const floatArray = Float32Array.from(values);
  return Buffer.from(floatArray.buffer.slice(0));
}

test('normalizeStoryBibleEntry applies planned defaults', () => {
  const storyBibleService = loadModuleWithMocks('../src/services/storyBibleService', {
    '../models/sequelize': {
      StoryBibleEntry: {},
      sequelize: {},
    },
    './embeddingService': {
      embedText: async () => [],
    },
    './vectorStoreService': {
      upsertStoryBibleEntryVector: async () => undefined,
      deleteStoryBibleEntryVector: async () => undefined,
    },
  });

  const normalized = storyBibleService.normalizeStoryBibleEntry({
    content: '设定正文',
  });

  assert.deepEqual(normalized, {
    type: 'world_rule',
    title: '未命名条目',
    content: '设定正文',
    priority: 100,
    labels: [],
  });
});

test('createEntry stores record and syncs story bible vector', async () => {
  const createdPayloads = [];
  const vectorUpserts = [];

  const fakeModels = {
    StoryBibleEntry: {
      create: async (payload) => {
        createdPayloads.push(payload);
        return {
          id: 51,
          novel_id: payload.novel_id,
          entry_type: payload.entry_type,
          title: payload.title,
          content: payload.content,
          metadata: payload.metadata,
          created_at: new Date('2026-04-24T00:00:00.000Z'),
          updated_at: new Date('2026-04-24T00:00:00.000Z'),
        };
      },
    },
    sequelize: { dialect: 'sqlite' },
  };

  const storyBibleService = loadModuleWithMocks('../src/services/storyBibleService', {
    '../models/sequelize': fakeModels,
    './embeddingService': {
      embedText: async (text) => {
        assert.equal(text, '人物小传\n\n她从不违背自己的誓言。');
        return [0.11, 0.22];
      },
    },
    './vectorStoreService': {
      upsertStoryBibleEntryVector: async (sequelize, row) => {
        assert.equal(sequelize, fakeModels.sequelize);
        vectorUpserts.push(row);
      },
      deleteStoryBibleEntryVector: async () => undefined,
    },
  });

  const created = await storyBibleService.createEntry({
    novelId: 9,
    title: '人物小传',
    content: '她从不违背自己的誓言。',
    type: 'character',
    priority: 12,
    labels: ['主角', '守誓者'],
  });

  assert.deepEqual(createdPayloads, [
    {
      novel_id: 9,
      entry_type: 'character',
      title: '人物小传',
      content: '她从不违背自己的誓言。',
      metadata: JSON.stringify({
        priority: 12,
        labels: ['主角', '守誓者'],
      }),
    },
  ]);
  assert.deepEqual(vectorUpserts, [
    {
      entryId: 51,
      embedding: [0.11, 0.22],
    },
  ]);
  assert.equal(created.type, 'character');
  assert.equal(created.priority, 12);
  assert.deepEqual(created.labels, ['主角', '守誓者']);
});

test('findRelevantEntries returns all matching entries by default', async () => {
  const storyBibleService = loadModuleWithMocks('../src/services/storyBibleService', {
    '../models/sequelize': {
      StoryBibleEntry: {
        findAll: async () => [
          {
            id: 1,
            novel_id: 7,
            entry_type: 'world_rule',
            title: '门规',
            content: '玄铁令不可离身',
            metadata: JSON.stringify({
              priority: 10,
              labels: ['玄铁令'],
            }),
          },
          {
            id: 2,
            novel_id: 7,
            entry_type: 'foreshadow',
            title: '后续反转',
            content: '师父其实是幕后人',
            metadata: JSON.stringify({
              priority: 20,
              labels: ['师父'],
            }),
          },
          {
            id: 3,
            novel_id: 7,
            entry_type: 'taboo',
            title: '隐藏真相',
            content: '主角身世不可提前揭露',
            metadata: JSON.stringify({
              priority: 5,
              labels: ['主角'],
            }),
          },
        ],
      },
      sequelize: {},
    },
    './embeddingService': {
      embedText: async () => [],
    },
    './vectorStoreService': {
      getStoryBibleEntriesVectors: async () => [
        { entryId: 1, embedding: [0.9, 0.1] },
        { entryId: 2, embedding: [0.8, 0.2] },
        { entryId: 3, embedding: [0.7, 0.3] },
      ],
      upsertStoryBibleEntryVector: async () => undefined,
      deleteStoryBibleEntryVector: async () => undefined,
    },
  });

  const entries = await storyBibleService.findRelevantEntries(7, [1, 0]);
  assert.equal(entries.length, 3);
  assert.equal(entries[0].id, 1);
  assert.equal(entries[1].id, 2);
  assert.equal(entries[2].id, 3);
});

test('findRelevantEntries uses priority as a secondary ranking factor', async () => {
  const storyBibleService = loadModuleWithMocks('../src/services/storyBibleService', {
    '../models/sequelize': {
      StoryBibleEntry: {
        findAll: async () => [
          {
            id: 11,
            novel_id: 7,
            entry_type: 'world_rule',
            title: '高优先级硬规则',
            content: '甲',
            metadata: JSON.stringify({
              priority: 5,
              labels: ['甲'],
            }),
          },
          {
            id: 12,
            novel_id: 7,
            entry_type: 'world_rule',
            title: '低优先级普通规则',
            content: '乙',
            metadata: JSON.stringify({
              priority: 80,
              labels: ['乙'],
            }),
          },
        ],
      },
      sequelize: {},
    },
    './embeddingService': {
      embedText: async () => [],
    },
    './vectorStoreService': {
      getStoryBibleEntriesVectors: async () => [
        { entryId: 11, embedding: [0.88, 0.12] },
        { entryId: 12, embedding: [0.89, 0.11] },
      ],
      upsertStoryBibleEntryVector: async () => undefined,
      deleteStoryBibleEntryVector: async () => undefined,
    },
  });

  const entries = await storyBibleService.findRelevantEntries(7, [1, 0]);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].id, 11);
  assert.equal(entries[1].id, 12);
});

test('createEntry removes the relational row when vector sync fails', async () => {
  let destroyed = false;

  const createdRecord = {
    id: 52,
    novel_id: 9,
    entry_type: 'world_rule',
    title: '失败条目',
    content: '向量写入失败',
    metadata: JSON.stringify({
      priority: 100,
      labels: [],
    }),
    created_at: new Date('2026-04-24T00:00:00.000Z'),
    updated_at: new Date('2026-04-24T00:00:00.000Z'),
    async destroy() {
      destroyed = true;
    },
  };

  const storyBibleService = loadModuleWithMocks('../src/services/storyBibleService', {
    '../models/sequelize': {
      StoryBibleEntry: {
        create: async () => createdRecord,
      },
      sequelize: { dialect: 'sqlite' },
    },
    './embeddingService': {
      embedText: async () => [0.8, 0.9],
    },
    './vectorStoreService': {
      upsertStoryBibleEntryVector: async () => {
        throw new Error('vector upsert failed');
      },
      deleteStoryBibleEntryVector: async () => undefined,
    },
  });

  await assert.rejects(
    storyBibleService.createEntry({
      novelId: 9,
      title: '失败条目',
      content: '向量写入失败',
    }),
    /vector upsert failed/
  );

  assert.equal(destroyed, true);
});

test('updateEntry refreshes vector after save and deleteEntry removes vector row', async () => {
  const savedStates = [];
  const vectorUpserts = [];
  const vectorDeletes = [];
  let destroyed = false;

  const entryRecord = {
    id: 77,
    novel_id: 5,
    entry_type: 'world_rule',
    title: '旧标题',
    content: '旧内容',
    metadata: JSON.stringify({
      priority: 100,
      labels: [],
    }),
    created_at: new Date('2026-04-20T00:00:00.000Z'),
    updated_at: new Date('2026-04-21T00:00:00.000Z'),
    async save() {
      savedStates.push({
        entry_type: this.entry_type,
        title: this.title,
        content: this.content,
        metadata: this.metadata,
      });
      this.updated_at = new Date('2026-04-24T00:00:00.000Z');
      return this;
    },
    async destroy() {
      destroyed = true;
    },
  };

  const fakeModels = {
    StoryBibleEntry: {
      findOne: async ({ where }) => (where.id === 77 && where.novel_id === 5 ? entryRecord : null),
      findAll: async () => [entryRecord],
    },
    sequelize: { dialect: 'sqlite' },
  };

  const storyBibleService = loadModuleWithMocks('../src/services/storyBibleService', {
    '../models/sequelize': fakeModels,
    './embeddingService': {
      embedText: async (text) => {
        assert.equal(text, '新标题\n\n新内容');
        return [0.33, 0.44];
      },
    },
    './vectorStoreService': {
      getStoryBibleEntryVector: async () => [0.55, 0.66],
      upsertStoryBibleEntryVector: async (_sequelize, row) => {
        vectorUpserts.push(row);
      },
      deleteStoryBibleEntryVector: async (_sequelize, entryId) => {
        vectorDeletes.push(entryId);
      },
    },
  });

  const updated = await storyBibleService.updateEntry(5, 77, {
    title: '新标题',
    content: '新内容',
    labels: ['已更新'],
  });
  const listed = await storyBibleService.listEntries(5);
  const deleted = await storyBibleService.deleteEntry(5, 77);

  assert.deepEqual(savedStates, [
    {
      entry_type: 'world_rule',
      title: '新标题',
      content: '新内容',
      metadata: JSON.stringify({
        priority: 100,
        labels: ['已更新'],
      }),
    },
  ]);
  assert.deepEqual(vectorUpserts, [
    {
      entryId: 77,
      embedding: [0.33, 0.44],
    },
  ]);
  assert.deepEqual(vectorDeletes, [77]);
  assert.equal(updated.title, '新标题');
  assert.deepEqual(listed.map((entry) => entry.id), [77]);
  assert.equal(deleted, true);
  assert.equal(destroyed, true);
});

test('updateEntry restores the previous row when embedding or vector sync fails', async () => {
  const savedStates = [];

  const entryRecord = {
    id: 88,
    novel_id: 6,
    entry_type: 'character',
    title: '旧人物',
    content: '旧设定',
    metadata: JSON.stringify({
      priority: 7,
      labels: ['旧标签'],
    }),
    created_at: new Date('2026-04-20T00:00:00.000Z'),
    updated_at: new Date('2026-04-21T00:00:00.000Z'),
    async save() {
      savedStates.push({
        entry_type: this.entry_type,
        title: this.title,
        content: this.content,
        metadata: this.metadata,
      });
      return this;
    },
  };

  const storyBibleService = loadModuleWithMocks('../src/services/storyBibleService', {
    '../models/sequelize': {
      StoryBibleEntry: {
        findOne: async ({ where }) => (where.id === 88 && where.novel_id === 6 ? entryRecord : null),
      },
      sequelize: { dialect: 'sqlite' },
    },
    './embeddingService': {
      embedText: async () => {
        throw new Error('embedding failed');
      },
    },
    './vectorStoreService': {
      upsertStoryBibleEntryVector: async () => undefined,
      deleteStoryBibleEntryVector: async () => undefined,
    },
  });

  await assert.rejects(
    storyBibleService.updateEntry(6, 88, {
      title: '新人物',
      content: '新设定',
      priority: 9,
      labels: ['新标签'],
    }),
    /embedding failed/
  );

  assert.deepEqual(savedStates, [
    {
      entry_type: 'character',
      title: '新人物',
      content: '新设定',
      metadata: JSON.stringify({
        priority: 9,
        labels: ['新标签'],
      }),
    },
    {
      entry_type: 'character',
      title: '旧人物',
      content: '旧设定',
      metadata: JSON.stringify({
        priority: 7,
        labels: ['旧标签'],
      }),
    },
  ]);
});

test('upsertStoryBibleEntryVector restores the old vector when insert fails after delete', async () => {
  const { sequelize, state } = createVectorStoreHarness({
    initialRows: {
      88: [0.9, 0.1],
    },
    failInsertForEntryIds: [88],
  });

  const vectorStoreService = loadModuleWithMocks('../src/services/vectorStoreService', {
  });

  await withRuntimeMocks(
    {
      'sqlite-vec': {
        load(connection) {
          connection.sqliteVecLoaded = true;
        },
      },
    },
    async () => {
      await assert.rejects(
        vectorStoreService.upsertStoryBibleEntryVector(sequelize, {
          entryId: 88,
          embedding: [0.3, 0.4],
        }),
        /vector insert failed/
      );
    }
  );

  assert.equal(state.rows.get(88), JSON.stringify([0.9, 0.1]));
});

test('story bible vector reads decode sqlite-vec buffers', async () => {
  const { sequelize, state } = createVectorStoreHarness();
  state.rows.set(201, toFloatBuffer([0.25, 0.5, 0.75]));

  const vectorStoreService = loadModuleWithMocks('../src/services/vectorStoreService', {});
  const single = await vectorStoreService.getStoryBibleEntryVector(sequelize, 201);
  const batch = await vectorStoreService.getStoryBibleEntriesVectors(sequelize, [201]);

  assert.deepEqual(single?.map((value) => Number(value.toFixed(2))), [0.25, 0.5, 0.75]);
  assert.deepEqual(batch.map((row) => row.entryId), [201]);
  assert.deepEqual(batch[0].embedding.map((value) => Number(value.toFixed(2))), [0.25, 0.5, 0.75]);
});

test('get/update/delete enforce the novel boundary', async () => {
  let findOneCalls = 0;
  let destroyed = false;

  const storyBibleService = loadModuleWithMocks('../src/services/storyBibleService', {
    '../models/sequelize': {
      StoryBibleEntry: {
        findOne: async ({ where }) => {
          findOneCalls += 1;
          if (where.id === 91 && where.novel_id === 12) {
            return null;
          }

          return {
            id: 91,
            novel_id: 11,
            entry_type: 'world_rule',
            title: '不该被看到',
            content: '跨小说数据',
            metadata: JSON.stringify({
              priority: 100,
              labels: [],
            }),
            async save() {
              return this;
            },
            async destroy() {
              destroyed = true;
            },
          };
        },
      },
      sequelize: { dialect: 'sqlite' },
    },
    './embeddingService': {
      embedText: async () => [0.1, 0.2],
    },
    './vectorStoreService': {
      upsertStoryBibleEntryVector: async () => undefined,
      deleteStoryBibleEntryVector: async () => undefined,
    },
  });

  const got = await storyBibleService.getEntryById(12, 91);
  const updated = await storyBibleService.updateEntry(12, 91, { title: '不会更新' });
  const deleted = await storyBibleService.deleteEntry(12, 91);

  assert.equal(got, null);
  assert.equal(updated, null);
  assert.equal(deleted, false);
  assert.equal(destroyed, false);
  assert.equal(findOneCalls, 3);
});

test('deleteEntry restores the vector when row deletion fails', async () => {
  const vectorDeletes = [];
  const vectorUpserts = [];

  const storyBibleService = loadModuleWithMocks('../src/services/storyBibleService', {
    '../models/sequelize': {
      StoryBibleEntry: {
        findOne: async ({ where }) => ({
          id: where.id,
          novel_id: where.novel_id,
          entry_type: 'world_rule',
          title: '待删除',
          content: '删除失败回滚',
          metadata: JSON.stringify({
            priority: 100,
            labels: [],
          }),
          async destroy() {
            throw new Error('destroy failed');
          },
        }),
      },
      sequelize: { dialect: 'sqlite' },
    },
    './embeddingService': {
      embedText: async () => [0.1, 0.2],
    },
    './vectorStoreService': {
      getStoryBibleEntryVector: async () => [0.6, 0.7],
      deleteStoryBibleEntryVector: async (_sequelize, entryId) => {
        vectorDeletes.push(entryId);
      },
      upsertStoryBibleEntryVector: async (_sequelize, row) => {
        vectorUpserts.push(row);
      },
    },
  });

  await assert.rejects(
    storyBibleService.deleteEntry(5, 101),
    /destroy failed/
  );

  assert.deepEqual(vectorDeletes, [101]);
  assert.deepEqual(vectorUpserts, [
    {
      entryId: 101,
      embedding: [0.6, 0.7],
    },
  ]);
});
