const test = require('node:test');
const assert = require('node:assert/strict');

const architectureService = require('../src/services/architectureService');

test('replaceChapterArchitectures is exported', () => {
  assert.equal(typeof architectureService.replaceChapterArchitectures, 'function');
});
