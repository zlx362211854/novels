import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTunePrompt, validateTuneResult } from '../src/ai/graphs/chapterTuneGraph';

test('buildTunePrompt focuses on user tune prompt without requiring review issues', () => {
  const prompt = buildTunePrompt(
    { chapter_number: 9, title: '第九章', content: '原章节正文' },
    { title: '测试小说', genre: '武侠' },
    { level: 'chapter', title: '章纲', plot_outline: '林秋在雪夜发现线索。' },
    '加强结尾悬念，减少现代口语，不要改变主线事件。',
    {
      relevantMemories: [
        {
          chapter_number: 8,
          summary: '林秋取得青铜钥匙',
          facts: [{ subject: '林秋', predicate: '持有', object: '青铜钥匙' }],
        },
      ],
      sourceExcerpts: [
        { chapterNumber: 8, excerpt: '林秋将青铜钥匙收入怀中。' },
      ],
      previousChapterContent: '上一章结尾段落',
    }
  );

  assert.match(prompt, /用户微调要求/);
  assert.match(prompt, /加强结尾悬念/);
  assert.match(prompt, /相关历史证据/);
  assert.match(prompt, /林秋将青铜钥匙收入怀中/);
  assert.match(prompt, /不要新增主线人物、世界规则、关键物品或大段新剧情/);
  assert.doesNotMatch(prompt, /审阅意见/);
});

test('validateTuneResult rejects suspiciously truncated tuned content', () => {
  assert.throws(
    () => validateTuneResult(
      {
        summary: 'summary',
        changedAreas: [],
        revisedContent: '太短了',
      },
      '这里是一个明显更长的原章节正文，用来模拟完整章节内容，长度应当远大于微调结果。这里继续补充一些文字，用来确保长度超过保护阈值。为了让测试更稳，我们继续添加更多内容，描述人物动作、环境变化、对话节奏、心理活动和场景转换。这样就能模拟真实小说章节中常见的篇幅，并验证明显过短的微调结果会被当作截断处理，而不会直接覆盖原正文。'.repeat(8)
    ),
    /微调结果疑似被截断/
  );
});
