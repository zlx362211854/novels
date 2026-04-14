import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChapterFixPrompt } from '../src/ai/graphs/multiChapterFixGraph';

test('buildChapterFixPrompt includes user suggestions when present', () => {
  const prompt = buildChapterFixPrompt(12, '正文内容', [
    {
      id: 'issue-1',
      type: 'timeline',
      severity: 'high',
      description: '时间线冲突',
      suggestion: '调整事件顺序',
      userSuggestion: '保留第10章结尾，不要改角色关系',
      evidence: [{ chapterNumber: 10, excerpt: '原文证据' }],
    },
  ]);

  assert.match(prompt, /用户修订意图：保留第10章结尾，不要改角色关系/);
});
