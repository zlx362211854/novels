const test = require('node:test');
const assert = require('node:assert/strict');

require('ts-node').register({
  project: require('node:path').join(__dirname, '..', 'tsconfig.json'),
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    moduleResolution: 'node',
    ignoreDeprecations: '6.0',
  },
});

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
  assert.ok(!prompt.includes('## 金庸武侠写作风格指南（核心，贯穿全文）'));
  assert.match(prompt, /诗词非必须/);
  assert.match(prompt, /不得新增本章架构未授权的主要人物/);
  assert.match(prompt, /## 执行优先级/);
  assert.match(prompt, /## 风格与字数/);
});

test('buildChapterPrompt includes RAG evidence blocks when retrieval context is present', () => {
  const prompt = buildChapterPrompt(
    novel,
    chapterArch,
    volumeArch,
    fullArch,
    null,
    [chapterArch],
    '强调密室压迫感',
    {
      storyBibleEntries: [
        {
          type: 'world_rule',
          title: '玄铁令门规',
          content: '玄铁令不可离身，否则视为叛门。',
          score: 0.95,
        },
      ],
      retrievedChunks: [
        {
          chapterNumber: 2,
          text: '沈夜将玄铁令收入袖底，未曾离身半步。',
          score: 0.91,
        },
      ],
      relevantMemories: [
        {
          chapter_number: 2,
          facts: [{ subject: '沈夜', predicate: '持有', object: '玄铁令' }],
          open_threads: [{ thread: '叛门疑云未解' }],
        },
      ],
    }
  );

  assert.match(prompt, /故事圣经硬约束/);
  assert.match(prompt, /玄铁令不可离身/);
  assert.match(prompt, /历史相关记忆/);
  assert.match(prompt, /沈夜 持有 玄铁令/);
  assert.match(prompt, /历史原文证据/);
  assert.match(prompt, /沈夜将玄铁令收入袖底/);
  assert.match(prompt, /1\. 先严格遵守/);
});

test('buildChapterPrompt compresses far-context into summaries instead of large repeated blocks', () => {
  const prompt = buildChapterPrompt(
    novel,
    chapterArch,
    {
      title: '风雪卷',
      plot_outline: '林秋追查青铜钥匙，逐步接近旧案真相。',
      characters: JSON.stringify([{ name: '林秋' }, { name: '沈夜' }]),
      world_setting: JSON.stringify({ region: '北地', rule: '帮派林立' }),
      emotional_tone: '压抑中带决绝',
    },
    fullArch,
    null,
    [
      chapterArch,
      { id: 13, title: '夜雪归途', plot_outline: '林秋回城验线索。' },
    ]
  );

  assert.match(prompt, /全本远场规划/);
  assert.match(prompt, /本卷远场规划/);
  assert.match(prompt, /本卷章节顺序提示/);
  assert.ok(!prompt.includes('### 人物设定\n['));
  assert.ok(!prompt.includes('### 世界观\n{'));
});

test('buildChapterPrompt skips RAG blocks when retrieval context is empty', () => {
  const prompt = buildChapterPrompt(
    novel,
    chapterArch,
    volumeArch,
    fullArch,
    null,
    [chapterArch],
    '',
    {
      storyBibleEntries: [],
      retrievedChunks: [],
      relevantMemories: [],
    }
  );

  assert.ok(!prompt.includes('## 故事圣经硬约束'));
  assert.ok(!prompt.includes('## 历史原文证据'));
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
