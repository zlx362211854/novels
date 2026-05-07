require('ts-node/register/transpile-only');

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const vectorStoreService = require('../src/services/vectorStoreService');

test('exports sqlite-vec bootstrap helpers', () => {
  assert.equal(typeof vectorStoreService.ensureVectorExtensionLoaded, 'function');
  assert.equal(typeof vectorStoreService.ensureVectorSchema, 'function');
});

test('ensureVectorSchema loads sqlite-vec per concrete connection and creates both vector tables', async () => {
  const originalLoad = Module._load;
  const loadedConnections = [];
  const executedStatements = [];
  const releasedConnections = [];
  const fakeConnections = [
    {
      name: 'first',
      run(statement, callback) {
        executedStatements.push({ connection: 'first', statement });
        callback(null);
      }
    },
    {
      name: 'second',
      run(statement, callback) {
        executedStatements.push({ connection: 'second', statement });
        callback(null);
      }
    }
  ];
  let connectionIndex = 0;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'sqlite-vec') {
      return {
        load(connection) {
          loadedConnections.push(connection);
        }
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const fakeSequelize = {
      connectionManager: {
        async getConnection() {
          return fakeConnections[connectionIndex++];
        },
        async releaseConnection(connection) {
          releasedConnections.push(connection);
        }
      }
    };

    await vectorStoreService.ensureVectorSchema(fakeSequelize);
    await vectorStoreService.ensureVectorSchema(fakeSequelize);
  } finally {
    Module._load = originalLoad;
  }

  assert.deepEqual(loadedConnections, fakeConnections);
  assert.deepEqual(releasedConnections, fakeConnections);
  assert.deepEqual(executedStatements, [
    {
      connection: 'first',
      statement: 'CREATE VIRTUAL TABLE IF NOT EXISTS chapter_chunk_vec USING vec0(chunk_id integer, embedding float[1024])'
    },
    {
      connection: 'first',
      statement: 'CREATE VIRTUAL TABLE IF NOT EXISTS story_bible_vec USING vec0(entry_id integer, embedding float[1024])'
    },
    {
      connection: 'second',
      statement: 'CREATE VIRTUAL TABLE IF NOT EXISTS chapter_chunk_vec USING vec0(chunk_id integer, embedding float[1024])'
    },
    {
      connection: 'second',
      statement: 'CREATE VIRTUAL TABLE IF NOT EXISTS story_bible_vec USING vec0(entry_id integer, embedding float[1024])'
    }
  ]);
});

test('initDatabase warns and degrades when vector bootstrap fails', async () => {
  const originalLoad = Module._load;
  const sequelizeModulePath = require.resolve('../src/models/sequelize');
  const vectorStoreModulePath = require.resolve('../src/services/vectorStoreService');
  const originalDbPath = process.env.DB_PATH;
  const originalEnsureVectorSchema = require(vectorStoreModulePath).ensureVectorSchema;
  const warnings = [];
  const fakeQueryInterface = {
    describeTable: async (tableName) => {
      if (tableName === 'novels') {
        return { publish_config: {} };
      }

      if (tableName === 'chapters') {
        return { review_result: {}, publish_result: {} };
      }

      if (tableName === 'chapter_memories') {
        return { key_events: {} };
      }

      return {};
    },
    showAllTables: async () => ['multi_chapter_reviews', 'chapter_chunks', 'story_bible_entries']
  };
  const fakeSequelizeInstance = {
    query: async () => [],
    sync: async () => fakeSequelizeInstance,
    getQueryInterface: () => fakeQueryInterface,
    close: async () => undefined,
    connectionManager: {
      async getConnection() {
        return {};
      },
      async releaseConnection() {}
    }
  };

  class FakeModel {
    static init(attributes, options) {
      this.rawAttributes = attributes;
      this.tableName = options.tableName;
      this.associations = {};
      return this;
    }

    static hasMany(_target, options) {
      this.associations ||= {};
      this.associations[options.as] = options;
    }

    static hasOne(_target, options) {
      this.associations ||= {};
      this.associations[options.as] = options;
    }

    static belongsTo(_target, options) {
      this.associations ||= {};
      this.associations[options.as] = options;
    }

    static async sync() {
      return this;
    }
  }

  class FakeSequelize {
    constructor() {
      return fakeSequelizeInstance;
    }
  }

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'sequelize') {
      return {
        Sequelize: FakeSequelize,
        DataTypes: {
          INTEGER: 'INTEGER',
          STRING: 'STRING',
          TEXT: 'TEXT',
          DATE: 'DATE',
          UUID: 'UUID',
          UUIDV4: 'UUIDV4'
        },
        Model: FakeModel,
        Optional: class {}
      };
    }

    return originalLoad.call(this, request, parent, isMain);
  };

  process.env.DB_PATH = path.join(process.cwd(), 'data', 'sqlite-vec-bootstrap-test.db');
  require(vectorStoreModulePath).ensureVectorSchema = async () => {
    throw new Error('vector bootstrap failed');
  };
  delete require.cache[sequelizeModulePath];

  try {
    const sequelizeModule = require(sequelizeModulePath);
    const { sequelize, initDatabase } = sequelizeModule;
    const originalWarn = console.warn;

    console.warn = (...args) => {
      warnings.push(args.join(' '));
    };

    try {
      assert.equal(sequelize, fakeSequelizeInstance);
      await assert.doesNotReject(initDatabase());
    } finally {
      console.warn = originalWarn;
      await sequelize.close();
    }
  } finally {
    Module._load = originalLoad;
    require(vectorStoreModulePath).ensureVectorSchema = originalEnsureVectorSchema;
    delete require.cache[sequelizeModulePath];

    if (originalDbPath === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = originalDbPath;
    }
  }

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /\[vector-store\] sqlite-vec bootstrap skipped:/);
  assert.match(warnings[0], /vector bootstrap failed/);
});
