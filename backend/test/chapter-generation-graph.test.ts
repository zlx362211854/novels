import test from 'node:test';
import assert from 'node:assert/strict';
import { hasHighSeverityIssues } from '../src/ai/graphs/chapterGenerationGraph';

test('hasHighSeverityIssues returns true only when a high severity issue exists', () => {
  assert.equal(hasHighSeverityIssues(null), false);
  assert.equal(hasHighSeverityIssues({ issues: [] }), false);
  assert.equal(
    hasHighSeverityIssues({
      issues: [{ severity: 'medium' }, { severity: 'low' }],
    }),
    false
  );
  assert.equal(
    hasHighSeverityIssues({
      issues: [{ severity: 'high' }, { severity: 'medium' }],
    }),
    true
  );
});

