const test = require('node:test');
const assert = require('node:assert/strict');

const { buildReviewPrompt, parseReviewResult } = require('../src/agents/reviewAgent');

test('buildReviewPrompt includes正文优先 rule and historical evidence sections', () => {
  const prompt = buildReviewPrompt(
    { chapter_number: 8, title: '第八章', content: '正文内容' },
    { title: '测试小说', genre: '玄幻' },
    { title: '章节架构', level: 'chapter', plot_outline: '大纲摘要' },
    {
      reviewStrictness: 'strict'
    },
    {
      currentMemory: { summary: '当前章摘要', facts: [] },
      relevantMemories: [{ chapter_number: 3, summary: '第三章摘要', facts: [] }],
      sourceExcerpts: [{ chapterNumber: 3, excerpt: '第三章证据' }]
    }
  );

  assert.match(prompt, /若架构与历史正文冲突，以历史正文为准/);
  assert.match(prompt, /历史相关记忆/);
  assert.match(prompt, /历史原文证据/);
  assert.match(prompt, /historicalChapterNumber/);
});

test('parseReviewResult preserves source-backed issue fields', () => {
  const result = parseReviewResult(`{
    "score": 88,
    "issues": [
      {
        "type": "knowledge_conflict",
        "severity": "high",
        "description": "冲突",
        "currentEvidence": "当前证据",
        "historicalEvidence": "历史证据",
        "historicalChapterNumber": 12,
        "suggestion": "修改"
      }
    ],
    "notes": []
  }`);

  assert.equal(result.issues[0].historicalChapterNumber, 12);
  assert.equal(result.issues[0].currentEvidence, '当前证据');
  assert.equal(result.issues[0].historicalEvidence, '历史证据');
});

test('parseReviewResult tolerates chinese smart quotes in model output', () => {
  const result = parseReviewResult(`{
    "score": 72,
    "issues": [
      {
        "type": "world_rule_conflict",
        "severity": "medium",
        "description": “故事发生的时代背景描述存在冲突”,
        "currentEvidence": “当前章证据”,
        "historicalEvidence": “历史章证据”,
        "historicalChapterNumber": null,
        "suggestion": “统一背景表述”
      }
    ],
    "notes": []
  }`);

  assert.equal(result.issues[0].description, '故事发生的时代背景描述存在冲突');
  assert.equal(result.issues[0].currentEvidence, '当前章证据');
});

test('parseReviewResult falls back to parse repaired JSON text', () => {
  const result = parseReviewResult(`{
    "score": 72,
    "issues": [
      {
        "type": "world_rule_conflict",
        "severity": "medium",
        "description": "故事发生的时代背景描述存在冲突"
      }
    ]
    "notes": []
  }`, `{
    "score": 72,
    "issues": [
      {
        "type": "world_rule_conflict",
        "severity": "medium",
        "description": "故事发生的时代背景描述存在冲突",
        "currentEvidence": "",
        "historicalEvidence": "",
        "historicalChapterNumber": null,
        "suggestion": ""
      }
    ],
    "notes": []
  }`);

  assert.equal(result.score, 72);
  assert.equal(result.issues[0].type, 'world_rule_conflict');
});
