import test from 'node:test';
import assert from 'node:assert/strict';

import { strictJsonOutputRules } from '../src/ai/jsonUtils';
import { buildReviewPrompt } from '../src/ai/graphs/chapterReviewGraph';

test('strictJsonOutputRules warns against unescaped double quotes inside strings', () => {
  const rules = strictJsonOutputRules();

  assert.match(rules, /禁止直接使用未转义的英文双引号/);
  assert.match(rules, /中文引号/);
});

test('chapter review prompt includes strict JSON quote rules', () => {
  const prompt = buildReviewPrompt(
    { chapter_number: 10, title: '第十章', content: '夜色将尽，晨曦尚远。' },
    { title: '测试小说', genre: '武侠' },
    { level: 'chapter', title: '章纲', plot_outline: '承接上一章黎明。' },
    { reviewStrictness: 'strict' },
    {},
    [],
    []
  );

  assert.match(prompt, /请返回JSON格式/);
  assert.match(prompt, /禁止直接使用未转义的英文双引号/);
});
