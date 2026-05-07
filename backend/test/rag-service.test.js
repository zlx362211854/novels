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

test('buildQueryText combines chapter focus, facts and user prompt', () => {
  const ragService = loadModuleWithMocks('../src/services/ragService', {
    './reviewContextService': {},
    './embeddingService': {},
    './chapterChunkService': {},
    './storyBibleService': {},
  });

  const text = ragService.buildQueryText({
    chapter: { title: '夜渡寒江' },
    architecture: { plot_outline: '潜入敌营' },
    currentMemory: {
      facts: [
        { subject: '沈青衫', predicate: '受伤', object: '左臂' },
      ],
    },
    userPrompt: '强调潜行压迫感',
  });

  assert.match(text, /夜渡寒江/);
  assert.match(text, /潜入敌营/);
  assert.match(text, /沈青衫/);
  assert.match(text, /强调潜行压迫感/);
});

test('buildRetrievalContext merges review context with chunk and story bible retrieval', async () => {
  const ragService = loadModuleWithMocks('../src/services/ragService', {
    './reviewContextService': {
      buildReviewContext: async () => ({
        currentChapter: { id: 8, novel_id: 3, title: '夜探密室' },
        currentMemory: {
          facts: [
            { subject: '沈青衫', predicate: '持有', object: '玄铁令' },
          ],
        },
        relevantMemories: [{ chapter_id: 2 }],
        sourceExcerpts: [{ chapterId: 2, excerpt: '旧案卷宗里提到玄铁令。' }],
        architecture: { plot_outline: '夜探密室' },
        novel: { id: 3, title: '玄门夜雨' },
      }),
    },
    './embeddingService': {
      embedText: async (text) => {
        assert.match(text, /夜探密室/);
        return [0.1, 0.2, 0.3];
      },
    },
    './chapterChunkService': {
      findRelevantChunks: async (novelId, queryEmbedding, options) => {
        assert.equal(novelId, 3);
        assert.deepEqual(queryEmbedding, [0.1, 0.2, 0.3]);
        assert.equal(options.excludeChapterId, 8);
        return [{ chapterId: 2, chapterNumber: 2, text: '玄铁令一直藏在袖中。', score: 0.91 }];
      },
    },
    './storyBibleService': {
      findRelevantEntries: async (novelId, queryEmbedding) => {
        assert.equal(novelId, 3);
        assert.deepEqual(queryEmbedding, [0.1, 0.2, 0.3]);
        return [{ id: 5, type: 'world_rule', title: '门规', content: '玄铁令不可离身', score: 0.95 }];
      },
    },
  });

  const context = await ragService.buildRetrievalContext(8, {
    userPrompt: '保留压迫感',
  });

  assert.deepEqual(context.relevantMemories, [{ chapter_id: 2 }]);
  assert.deepEqual(context.retrievedChunks, [
    { chapterId: 2, chapterNumber: 2, text: '玄铁令一直藏在袖中。', score: 0.91 },
  ]);
  assert.deepEqual(context.storyBibleEntries, [
    { id: 5, type: 'world_rule', title: '门规', content: '玄铁令不可离身', score: 0.95 },
  ]);
  assert.match(context.queryText, /保留压迫感/);
});
