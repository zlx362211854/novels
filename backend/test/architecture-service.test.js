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

const architectureService = require('../src/services/architectureService');

test('replaceChapterArchitectures is exported', () => {
  assert.equal(typeof architectureService.replaceChapterArchitectures, 'function');
});
