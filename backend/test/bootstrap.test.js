const test = require('node:test');
const assert = require('node:assert/strict');

const { createBootstrap } = require('../src/index');

test('bootstrap waits for database init before scheduled jobs and listen', async () => {
  const calls = [];
  const app = {
    listen(port, callback) {
      calls.push(`listen:${port}`);
      callback();
    }
  };

  const bootstrap = createBootstrap({
    app,
    port: 3001,
    initDatabase: async () => {
      calls.push('initDatabase:start');
      await Promise.resolve();
      calls.push('initDatabase:end');
    },
    initScheduledJobs: async () => {
      calls.push('initScheduledJobs');
    },
    logger: {
      log() {},
      error() {}
    }
  });

  await bootstrap();

  assert.deepEqual(calls, [
    'initDatabase:start',
    'initDatabase:end',
    'initScheduledJobs',
    'listen:3001'
  ]);
});
