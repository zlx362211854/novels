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

function makeNoopScheduleMock() {
  return {
    scheduleJob: () => ({
      cancel: () => {},
      nextInvocation: () => ({ toISOString: () => '2099-01-01T00:00:00.000Z', toDate: () => new Date('2099-01-01') }),
    }),
  };
}

test('findPendingChapterArchitectures skips chapters that already have generated content', async () => {
  const novelId = 7;
  const volumes = [
    { id: 100, novel_id: novelId, level: 'volume', parent_id: null },
    { id: 101, novel_id: novelId, level: 'volume', parent_id: null },
  ];
  const chapterArchs = [
    { id: 1001, novel_id: novelId, level: 'chapter', parent_id: 100, title: 'A' },
    { id: 1002, novel_id: novelId, level: 'chapter', parent_id: 100, title: 'B' },
    { id: 1003, novel_id: novelId, level: 'chapter', parent_id: 101, title: 'C' },
    { id: 1004, novel_id: novelId, level: 'chapter', parent_id: 101, title: 'D' },
  ];
  // 1001: already generated. 1002: empty content. 1003: status draft. 1004: no chapter row.
  const chapters = [
    { architecture_id: 1001, content: 'something written', status: 'generated' },
    { architecture_id: 1002, content: '', status: 'generated' },
    { architecture_id: 1003, content: 'unfinished', status: 'draft' },
  ];

  const service = loadModuleWithMocks('../src/services/recurringTaskService', {
    '../models/sequelize': {
      ScheduledTask: {},
      Novel: {},
      Architecture: {
        findAll: async ({ where }) => {
          if (where.level === 'volume') return volumes;
          if (where.level === 'chapter') return chapterArchs;
          return [];
        },
      },
      Chapter: {
        findAll: async () => chapters,
      },
    },
    'node-schedule': makeNoopScheduleMock(),
    './chapterService': { generate: async () => ({}) },
  });

  const pending = await service.findPendingChapterArchitectures(novelId, 5);
  const ids = pending.map((p) => p.architecture.id);
  // 1001 is final and not pending; the rest qualify.
  assert.deepEqual(ids, [1002, 1003, 1004]);
});

test('findPendingChapterArchitectures honors limit and book order', async () => {
  const novelId = 8;
  const volumes = [
    { id: 200, novel_id: novelId, level: 'volume' },
    { id: 201, novel_id: novelId, level: 'volume' },
  ];
  const chapterArchs = [
    { id: 2002, novel_id: novelId, level: 'chapter', parent_id: 201 },
    { id: 2001, novel_id: novelId, level: 'chapter', parent_id: 200 }, // earlier volume
    { id: 2003, novel_id: novelId, level: 'chapter', parent_id: 200 },
  ];

  const service = loadModuleWithMocks('../src/services/recurringTaskService', {
    '../models/sequelize': {
      ScheduledTask: {},
      Novel: {},
      Architecture: {
        findAll: async ({ where }) => {
          if (where.level === 'volume') return volumes;
          if (where.level === 'chapter') return chapterArchs;
          return [];
        },
      },
      Chapter: { findAll: async () => [] },
    },
    'node-schedule': makeNoopScheduleMock(),
    './chapterService': { generate: async () => ({}) },
  });

  const pending = await service.findPendingChapterArchitectures(novelId, 2);
  const ids = pending.map((p) => p.architecture.id);
  // Volume 200 comes first; within it, 2001 and 2003 by id.
  assert.deepEqual(ids, [2001, 2003]);
});

test('upsert refuses to mutate a recurring task that is currently running', async () => {
  const existing = {
    id: 9,
    novel_id: 1,
    cron_expression: '0 8 * * *',
    enabled: true,
    chapters_per_run: 1,
    last_run_status: 'running',
    save: async () => {},
  };

  const service = loadModuleWithMocks('../src/services/recurringTaskService', {
    '../models/sequelize': {
      ScheduledTask: {
        findOne: async () => existing,
        create: async () => ({ ...existing, id: 99 }),
      },
      Novel: { findByPk: async () => ({ id: 1 }) },
      Architecture: {},
      Chapter: {},
    },
    'node-schedule': makeNoopScheduleMock(),
    './chapterService': {},
  });

  await assert.rejects(
    () => service.upsert(1, { cronExpression: '0 9 * * *', enabled: true, chaptersPerRun: 2 }),
    /正在运行/
  );
});

test('runNow refuses when a run is already in flight', async () => {
  const service = loadModuleWithMocks('../src/services/recurringTaskService', {
    '../models/sequelize': {
      ScheduledTask: {
        findOne: async () => ({ id: 5, novel_id: 1, last_run_status: 'running' }),
      },
      Novel: {},
      Architecture: {},
      Chapter: {},
    },
    'node-schedule': makeNoopScheduleMock(),
    './chapterService': { generate: async () => ({}) },
  });

  await assert.rejects(() => service.runNow(1), /已在运行/);
});

test('executeRun delegates the full run to recurringTaskGraph', async () => {
  let graphInvokedWith = null;
  const fakeTask = {
    id: 42,
    novel_id: 1,
    cron_expression: '0 8 * * *',
    enabled: true,
    chapters_per_run: 2,
    last_run_status: null,
    save: async () => {},
  };

  const service = loadModuleWithMocks('../src/services/recurringTaskService', {
    '../models/sequelize': {
      ScheduledTask: {
        findByPk: async () => fakeTask,
        findOne: async () => fakeTask,
      },
      Novel: {},
      Architecture: {},
      Chapter: {},
    },
    'node-schedule': makeNoopScheduleMock(),
    '../ai/graphs/recurringTaskGraph': {
      recurringTaskGraph: {
        invoke: async (state) => {
          graphInvokedWith = state;
          return { summary: { attempted: 2, generated: [101, 102], failed: [] } };
        },
      },
    },
  });

  const summary = await service.executeRun(42);
  assert.equal(graphInvokedWith.recurringTaskId, 42);
  assert.equal(summary.attempted, 2);
  assert.deepEqual(summary.generated, [101, 102]);
});
