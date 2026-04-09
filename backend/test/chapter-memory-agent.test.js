const test = require('node:test');
const assert = require('node:assert/strict');

const { extractJson } = require('../src/agents/chapterMemoryAgent');

test('extractJson tolerates common malformed json in memory card output', () => {
  const parsed = extractJson(`{
    "summary": "摘要",
    "entities": {
      "characters": ["林霄"]
      "locations": [],
      "items": [],
      "organizations": []
    },
    "facts": [],
    "state_changes": [],
    "open_threads": [],
    "source_excerpt_map": []
  }`);

  assert.equal(parsed.summary, '摘要');
  assert.deepEqual(parsed.entities.characters, ['林霄']);
});
