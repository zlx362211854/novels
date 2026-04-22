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

