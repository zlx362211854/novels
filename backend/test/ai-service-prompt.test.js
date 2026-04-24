const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildChapterPrompt,
  formatPreviousChapterMemory,
  selectPreviousChapterArchitecture,
} = require('../src/services/aiService');
const { buildChapterBatchPrompt } = require('../src/ai/graphs/architectureGraph');
const { buildRevisionPrompt } = require('../src/ai/graphs/chapterRevisionGraph');

const novel = { title: '青锋录', genre: '武侠' };
const fullArch = {
  plot_outline: '少年入江湖，查清旧案。',
  characters: JSON.stringify([{ name: '林秋', role: '男主' }]),
  world_setting: JSON.stringify({ era: '架空古代', rules: '内力有经脉限制' }),
  emotional_tone: '沉郁、克制',
};
const volumeArch = {
  title: '风雪卷',
  plot_outline: '林秋追查青铜钥匙。',
};
const chapterArch = {
  id: 12,
  title: '雪夜问剑',
  plot_outline: '林秋在破庙遇见沈夜，两人交换青铜钥匙线索。',
  emotional_tone: '紧张',
};

test('buildChapterPrompt has consistent poetry and character boundary rules', () => {
  const prompt = buildChapterPrompt(novel, chapterArch, volumeArch, fullArch, null, [chapterArch]);

  assert.ok(!prompt.includes('每章须在恰当处插入1-2处诗词'));
  assert.ok(!prompt.includes('架构未提及的人物可出现推动情节'));
  assert.match(prompt, /诗词非必须/);
  assert.match(prompt, /不得新增本章架构未授权的主要人物/);
});

test('formatPreviousChapterMemory exposes saved chapter memory fields for generation context', () => {
  const formatted = formatPreviousChapterMemory({
    facts: JSON.stringify([
      { subject: '林秋', predicate: '持有', object: '青铜钥匙' },
    ]),
    state_changes: JSON.stringify([
      { entity: '林秋', field: '位置', before: '山道', after: '破庙' },
    ]),
    open_threads: JSON.stringify([
      { thread: '青铜钥匙来历未明', status: 'opened' },
    ]),
  });

  assert.match(formatted, /林秋 持有 青铜钥匙/);
  assert.match(formatted, /林秋\.位置：山道 → 破庙/);
  assert.match(formatted, /青铜钥匙来历未明/);
});

test('buildChapterBatchPrompt requests actionable long-form chapter planning fields', () => {
  const prompt = buildChapterBatchPrompt(novel, volumeArch, fullArch);

  assert.match(prompt, /chapter_goal/);
  assert.match(prompt, /plot_beats/);
  assert.match(prompt, /required_characters/);
  assert.match(prompt, /foreshadowing/);
  assert.match(prompt, /state_changes_expected/);
  assert.match(prompt, /forbidden_content/);
});

test('buildRevisionPrompt includes historical evidence and explicit edit scope', () => {
  const prompt = buildRevisionPrompt(
    {
      title: '雪夜问剑',
      chapter_number: 3,
      content: '原正文',
    },
    novel,
    chapterArch,
    {
      issues: [
        {
          type: 'item_state_conflict',
          description: '青铜钥匙重复获得',
          currentEvidence: '林秋接过钥匙',
          historicalEvidence: '林秋早已收好青铜钥匙',
          historicalChapterNumber: 2,
        },
      ],
    },
    '',
    {
      relevantMemories: [
        {
          chapter_number: 2,
          summary: '林秋取得青铜钥匙',
          facts: [{ subject: '林秋', predicate: '持有', object: '青铜钥匙' }],
        },
      ],
      sourceExcerpts: [
        { chapterNumber: 2, excerpt: '林秋将青铜钥匙收入怀中。' },
      ],
      previousChapterContent: '上一章结尾',
    }
  );

  assert.match(prompt, /相关历史证据/);
  assert.match(prompt, /林秋将青铜钥匙收入怀中/);
  assert.match(prompt, /允许修改范围/);
  assert.match(prompt, /禁止修改范围/);
});

test('selectPreviousChapterArchitecture selects the immediate previous sibling by order', () => {
  const siblings = [
    { id: 101, title: '第六章' },
    { id: 108, title: '第七章' },
    { id: 112, title: '第八章' },
    { id: 140, title: '第九章' },
  ];

  assert.deepEqual(selectPreviousChapterArchitecture(siblings, 112), siblings[1]);
  assert.equal(selectPreviousChapterArchitecture(siblings, 101), null);
});
