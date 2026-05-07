require('ts-node/register/transpile-only');

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function withMockedSequelize(run, configs = []) {
  const originalLoad = Module._load;
  const llmFactoryModulePath = require.resolve('../src/ai/llmFactory');

  delete require.cache[llmFactoryModulePath];
  delete require.cache[require.resolve('../src/services/embeddingService')];

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '../models/sequelize' && parent?.filename === llmFactoryModulePath) {
      return {
        SystemConfig: {
          async findAll() {
            return configs;
          }
        }
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  return Promise.resolve()
    .then(run)
    .finally(() => {
      Module._load = originalLoad;
      delete require.cache[llmFactoryModulePath];
      delete require.cache[require.resolve('../src/services/embeddingService')];
    });
}

test('embedding service exports embed helpers', () => {
  return withMockedSequelize(() => {
    const embeddingService = require('../src/services/embeddingService');

    assert.equal(typeof embeddingService.embedText, 'function');
    assert.equal(typeof embeddingService.embedTexts, 'function');
  });
});

test('getAIConfig exposes zhipu embedding defaults', async () => {
  const originalApiUrl = process.env.ZHIPU_API_URL;
  const originalEmbeddingModel = process.env.ZHIPU_EMBEDDING_MODEL;

  delete process.env.ZHIPU_API_URL;
  delete process.env.ZHIPU_EMBEDDING_MODEL;

  try {
    await withMockedSequelize(async () => {
      const { getAIConfig } = require('../src/ai/llmFactory');
      const config = await getAIConfig();

      assert.equal(config.zhipuApiUrl, 'https://open.bigmodel.cn/api/paas/v4');
      assert.equal(config.zhipuEmbeddingModel, 'embedding-3');
    });
  } finally {
    if (originalApiUrl === undefined) {
      delete process.env.ZHIPU_API_URL;
    } else {
      process.env.ZHIPU_API_URL = originalApiUrl;
    }

    if (originalEmbeddingModel === undefined) {
      delete process.env.ZHIPU_EMBEDDING_MODEL;
    } else {
      process.env.ZHIPU_EMBEDDING_MODEL = originalEmbeddingModel;
    }
  }
});

test('getAIConfig honors persisted zhipuApiUrl override', async () => {
  const originalApiUrl = process.env.ZHIPU_API_URL;
  process.env.ZHIPU_API_URL = 'https://env.example.com/api';

  try {
    await withMockedSequelize(async () => {
      const { getAIConfig } = require('../src/ai/llmFactory');
      const config = await getAIConfig();

      assert.equal(config.zhipuApiUrl, 'https://persisted.example.com/api');
    }, [
      {
        config_key: 'zhipuApiUrl',
        config_value: 'https://persisted.example.com/api'
      }
    ]);
  } finally {
    if (originalApiUrl === undefined) {
      delete process.env.ZHIPU_API_URL;
    } else {
      process.env.ZHIPU_API_URL = originalApiUrl;
    }
  }
});

test('embedTexts sorts embeddings by response index', async () => {
  const originalFetch = global.fetch;
  let fetchCall;

  global.fetch = async (url, options) => {
    fetchCall = { url, options };

    return {
      ok: true,
      async json() {
        return {
          data: [
            { index: 1, embedding: [2, 2] },
            { index: 0, embedding: [1, 1] }
          ]
        };
      }
    };
  };

  try {
    await withMockedSequelize(async () => {
      const llmFactory = require('../src/ai/llmFactory');
      const embeddingService = require('../src/services/embeddingService');
      const originalGetAIConfig = llmFactory.getAIConfig;

      llmFactory.getAIConfig = async () => ({
        zhipuApiKey: 'test-key',
        zhipuApiUrl: 'https://example.com/api',
        zhipuEmbeddingModel: 'embedding-3'
      });

      try {
        const embeddings = await embeddingService.embedTexts(['first', 'second']);

        assert.deepEqual(embeddings, [
          [1, 1],
          [2, 2]
        ]);
        assert.equal(fetchCall.url, 'https://example.com/api/embeddings');
        assert.equal(fetchCall.options.method, 'POST');
        assert.equal(fetchCall.options.headers.Authorization, 'Bearer test-key');
        assert.deepEqual(JSON.parse(fetchCall.options.body), {
          model: 'embedding-3',
          input: ['first', 'second']
        });
      } finally {
        llmFactory.getAIConfig = originalGetAIConfig;
      }
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('embedTexts throws when API key is missing', async () => {
  await withMockedSequelize(async () => {
    const llmFactory = require('../src/ai/llmFactory');
    const embeddingService = require('../src/services/embeddingService');
    const originalGetAIConfig = llmFactory.getAIConfig;

    llmFactory.getAIConfig = async () => ({
      zhipuApiUrl: 'https://example.com/api',
      zhipuEmbeddingModel: 'embedding-3'
    });

    try {
      await assert.rejects(
        embeddingService.embedTexts(['missing-key']),
        /Zhipu API key is not configured/
      );
    } finally {
      llmFactory.getAIConfig = originalGetAIConfig;
    }
  });
});

test('embedTexts throws when response items are malformed', async () => {
  const originalFetch = global.fetch;

  global.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        data: [
          { index: 0, embedding: [1, 1] },
          { index: 1 }
        ]
      };
    }
  });

  try {
    await withMockedSequelize(async () => {
      const llmFactory = require('../src/ai/llmFactory');
      const embeddingService = require('../src/services/embeddingService');
      const originalGetAIConfig = llmFactory.getAIConfig;

      llmFactory.getAIConfig = async () => ({
        zhipuApiKey: 'test-key',
        zhipuApiUrl: 'https://example.com/api',
        zhipuEmbeddingModel: 'embedding-3'
      });

      try {
        await assert.rejects(
          embeddingService.embedTexts(['first', 'second']),
          /missing an embedding array/
        );
      } finally {
        llmFactory.getAIConfig = originalGetAIConfig;
      }
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('embedTexts splits requests into fixed-size batches', async () => {
  const originalFetch = global.fetch;
  const requestBodies = [];

  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    requestBodies.push(body);

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          data: body.input.map((text, index) => ({
            index,
            embedding: [text.length]
          }))
        };
      }
    };
  };

  try {
    await withMockedSequelize(async () => {
      const llmFactory = require('../src/ai/llmFactory');
      const embeddingService = require('../src/services/embeddingService');
      const originalGetAIConfig = llmFactory.getAIConfig;
      const texts = Array.from({ length: 17 }, (_, index) => `text-${index}`);

      llmFactory.getAIConfig = async () => ({
        zhipuApiKey: 'test-key',
        zhipuApiUrl: 'https://example.com/api',
        zhipuEmbeddingModel: 'embedding-3'
      });

      try {
        const embeddings = await embeddingService.embedTexts(texts);

        assert.equal(requestBodies.length, 2);
        assert.equal(requestBodies[0].input.length, 16);
        assert.equal(requestBodies[1].input.length, 1);
        assert.deepEqual(embeddings, texts.map((text) => [text.length]));
      } finally {
        llmFactory.getAIConfig = originalGetAIConfig;
      }
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('embedText rejects malformed single-item responses instead of returning undefined', async () => {
  const originalFetch = global.fetch;

  global.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        data: []
      };
    }
  });

  try {
    await withMockedSequelize(async () => {
      const llmFactory = require('../src/ai/llmFactory');
      const embeddingService = require('../src/services/embeddingService');
      const originalGetAIConfig = llmFactory.getAIConfig;

      llmFactory.getAIConfig = async () => ({
        zhipuApiKey: 'test-key',
        zhipuApiUrl: 'https://example.com/api',
        zhipuEmbeddingModel: 'embedding-3'
      });

      try {
        await assert.rejects(
          embeddingService.embedText('single'),
          /response item count mismatch: expected 1, received 0/
        );
      } finally {
        llmFactory.getAIConfig = originalGetAIConfig;
      }
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('embedTexts wraps fetch failures with request context', async () => {
  const originalFetch = global.fetch;

  global.fetch = async () => {
    throw new Error('network down');
  };

  try {
    await withMockedSequelize(async () => {
      const llmFactory = require('../src/ai/llmFactory');
      const embeddingService = require('../src/services/embeddingService');
      const originalGetAIConfig = llmFactory.getAIConfig;

      llmFactory.getAIConfig = async () => ({
        zhipuApiKey: 'test-key',
        zhipuApiUrl: 'https://example.com/api',
        zhipuEmbeddingModel: 'embedding-3'
      });

      try {
        await assert.rejects(
          embeddingService.embedTexts(['a', 'b']),
          /url=https:\/\/example.com\/api\/embeddings, status=unknown, inputCount=2/
        );
      } finally {
        llmFactory.getAIConfig = originalGetAIConfig;
      }
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('embedText preserves wrapped fetch failure context', async () => {
  const originalFetch = global.fetch;

  global.fetch = async () => {
    throw new Error('network down');
  };

  try {
    await withMockedSequelize(async () => {
      const llmFactory = require('../src/ai/llmFactory');
      const embeddingService = require('../src/services/embeddingService');
      const originalGetAIConfig = llmFactory.getAIConfig;

      llmFactory.getAIConfig = async () => ({
        zhipuApiKey: 'test-key',
        zhipuApiUrl: 'https://example.com/api',
        zhipuEmbeddingModel: 'embedding-3'
      });

      try {
        await assert.rejects(
          embeddingService.embedText('single'),
          /Zhipu embeddings request failed \(request failed: network down\) \[url=https:\/\/example.com\/api\/embeddings, status=unknown, inputCount=1\]/
        );
      } finally {
        llmFactory.getAIConfig = originalGetAIConfig;
      }
    });
  } finally {
    global.fetch = originalFetch;
  }
});
