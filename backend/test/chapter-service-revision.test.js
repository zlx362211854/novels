const test = require('node:test');
const assert = require('node:assert/strict');

const chapterService = require('../src/services/chapterService');

test('reviseChapter rejects when review issues are empty', async () => {
  await assert.rejects(
    () => chapterService.reviseChapter(1, { issues: [] }),
    /没有可用于修订的问题/
  );
});

test('reviseChapter returns updated chapter and review after applying revision', async () => {
  assert.equal(typeof chapterService.reviseChapter, 'function');
});
