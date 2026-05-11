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

test('memoryExtractionGraph enriches time_sequence with fine-grained scene order', async () => {
  const responses = [
    JSON.stringify({
      summary: '摘要',
      key_events: [{ event: '山洞歇息', characters: ['林霄', '宋诗淇'], time: '夜里' }],
      entities: {
        characters: ['林霄', '宋诗淇'],
        locations: ['山洞', '乱石堆'],
        items: ['短刀'],
        organizations: [],
      },
      facts: [],
      state_changes: [],
      open_threads: [],
      time_sequence: [
        { day: 2, phase: 'night', label: '第2天晚上', event: '山洞歇息', characters: ['林霄', '宋诗淇'], location: '山洞', evidence: '两人在山洞里歇了一夜。' },
      ],
      source_excerpt_map: [],
    }),
    JSON.stringify({
      time_sequence: [
        { day: 2, phase: 'night', label: '第2天晚上', event: '山洞歇息', characters: ['林霄', '宋诗淇'], location: '山洞', evidence: '两人在山洞里歇了一夜。' },
        { day: 3, phase: 'morning', label: '第3天早上', event: '出洞赶路并在乱石堆拾得短刀', characters: ['林霄', '宋诗淇'], location: '乱石堆', evidence: '第二日天刚蒙蒙亮，他们便继续赶路。' },
        { day: 3, phase: 'night', label: '第3天晚上', event: '再次回到山洞吃干粮', characters: ['林霄', '宋诗淇'], location: '山洞', evidence: '夜色再次降临，月光照进山洞。' },
      ],
    }),
  ];

  const { memoryExtractionGraph } = loadModuleWithMocks('../src/ai/graphs/memoryExtractionGraph', {
    '../llmFactory': {
      createLLM: async () => ({}),
    },
    '../streaming': {
      invokeWithStreaming: async () => responses.shift(),
    },
    '../../services/aiStatusService': {
      step: () => undefined,
      setStream: () => undefined,
      appendStream: () => undefined,
    },
  });

  const result = await memoryExtractionGraph.invoke({
    chapter: {
      title: '测试章',
      chapter_number: 12,
      content: '两人在山洞里歇了一夜。第二日天刚蒙蒙亮，他们便继续赶路。夜色再次降临，月光照进山洞。',
    },
    novel: { title: '寒刃凌霄', genre: '武侠' },
    architecture: null,
    signal: undefined,
    skipRepairOnParseFailure: true,
    taskId: null,
  });

  assert.equal(result.memoryCard.time_sequence.length, 3);
  assert.equal(result.memoryCard.time_sequence[1].location, '乱石堆');
  assert.equal(result.memoryCard.time_sequence[2].location, '山洞');
  assert.match(result.memoryCard.time_sequence[2].event, /再次回到山洞/);
});
