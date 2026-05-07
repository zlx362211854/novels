import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRevisionPrompt } from '../src/ai/graphs/chapterRevisionGraph';

test('buildRevisionPrompt includes user prompt when provided', () => {
  const prompt = buildRevisionPrompt(
    { chapter_number: 27, title: '第二十七章', content: '章节正文' },
    { title: '测试小说', genre: '玄幻' },
    { level: 'chapter', title: '章节架构', plot_outline: '架构摘要' },
    {
      issues: [
        {
          type: 'timeline_conflict',
          description: '时间线有冲突',
          suggestion: '调整先后顺序',
        },
      ],
    },
    '保留这一章的压抑氛围，不要大改前半段。'
  );

  assert.match(prompt, /用户补充要求/);
  assert.match(prompt, /保留这一章的压抑氛围，不要大改前半段。/);
});

test('buildRevisionPrompt includes story bible and retrieved chunk evidence when available', () => {
  const prompt = buildRevisionPrompt(
    { chapter_number: 27, title: '第二十七章', content: '章节正文' },
    { title: '测试小说', genre: '玄幻' },
    { level: 'chapter', title: '章节架构', plot_outline: '架构摘要' },
    { issues: [] },
    '',
    {
      storyBibleEntries: [
        { title: '玄铁佩限制', content: '玄铁佩不可被写成直接战力外挂。' },
      ],
      retrievedChunks: [
        { chapterNumber: 12, text: '林秋将玄铁佩收入怀中。' },
      ],
    }
  );

  assert.match(prompt, /故事圣经约束/);
  assert.match(prompt, /玄铁佩不可被写成直接战力外挂/);
  assert.match(prompt, /历史正文片段/);
  assert.match(prompt, /林秋将玄铁佩收入怀中/);
});
