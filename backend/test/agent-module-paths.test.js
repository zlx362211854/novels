const test = require('node:test');
const assert = require('node:assert/strict');

test('services resolve agents from backend/src/agents', async () => {
  const reviewAgent = require('../src/agents/reviewAgent');
  const chapterMemoryAgent = require('../src/agents/chapterMemoryAgent');
  const chapterService = require('../src/services/chapterService');
  const chapterMemoryService = require('../src/services/chapterMemoryService');

  assert.equal(typeof reviewAgent.review, 'function');
  assert.equal(typeof chapterMemoryAgent.extractMemoryCard, 'function');
  assert.ok(chapterService);
  assert.ok(chapterMemoryService);
});
