import test from 'node:test';
import assert from 'node:assert/strict';

import { buildUnifiedDiffRows } from '../src/lib/unifiedDiff.js';

test('buildUnifiedDiffRows creates git-style unchanged removed and added rows', () => {
  const rows = buildUnifiedDiffRows('第一段\n\n第二段旧', '第一段\n\n第二段新\n\n第三段');

  assert.deepEqual(
    rows.map((row) => ({ type: row.type, marker: row.marker, text: row.text })),
    [
      { type: 'unchanged', marker: ' ', text: '第一段' },
      { type: 'removed', marker: '-', text: '第二段旧' },
      { type: 'added', marker: '+', text: '第二段新' },
      { type: 'added', marker: '+', text: '第三段' },
    ]
  );
});
