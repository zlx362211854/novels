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

test('applyDraft waits for chapter memory rebuild before resolving accepted fixes', async () => {
  let resolveMemoryUpdate;
  let memoryUpdateStarted = false;
  let chapterSaved = false;
  let reviewSaved = false;
  let versionCreated = false;

  const record = {
    id: 'review-1',
    fix_data: JSON.stringify([
      {
        chapterId: 11,
        revisedContent: '修复后的正文',
        status: 'pending',
      },
    ]),
    async save() {
      reviewSaved = true;
    },
  };

  const chapter = {
    id: 11,
    content: '原正文',
    async save() {
      chapterSaved = true;
    },
  };

  const service = loadModuleWithMocks('../src/services/multiChapterReviewService', {
    '../models/sequelize': {
      MultiChapterReview: {
        findByPk: async (id) => {
          assert.equal(id, 'review-1');
          return record;
        },
      },
      Chapter: {
        findByPk: async (id) => {
          assert.equal(id, 11);
          return chapter;
        },
      },
      ChapterVersion: {
        count: async () => 2,
        create: async (payload) => {
          versionCreated = true;
          assert.equal(payload.chapter_id, 11);
          assert.equal(payload.version_number, 3);
          assert.equal(payload.content, '原正文');
        },
      },
    },
    '../ai/graphs/crossChapterReviewGraph': {
      crossChapterReviewGraph: {},
    },
    '../ai/graphs/multiChapterFixGraph': {
      multiChapterFixGraph: {},
    },
    './chapterMemoryService': {
      upsertForChapter: async (chapterId) => {
        assert.equal(chapterId, 11);
        memoryUpdateStarted = true;
        await new Promise((resolve) => {
          resolveMemoryUpdate = resolve;
        });
      },
    },
    './aiStatusService': {
      error: () => undefined,
    },
  });

  const applyPromise = service.applyDraft('review-1', 11, true);

  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(chapterSaved, true);
  assert.equal(versionCreated, true);
  assert.equal(memoryUpdateStarted, true);
  assert.equal(reviewSaved, false);

  let settled = false;
  applyPromise.then(() => {
    settled = true;
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);

  resolveMemoryUpdate();

  const draft = await applyPromise;

  assert.equal(reviewSaved, true);
  assert.equal(draft.status, 'accepted');
  assert.equal(chapter.content, '修复后的正文');
});
