const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRevisionPrompt,
  parseRevisionResult,
  validateRevisionResult
} = require('../src/agents/chapterRevisionAgent');

test('buildRevisionPrompt includes conservative rewrite constraints', () => {
  const prompt = buildRevisionPrompt(
    { chapter_number: 8, title: '第八章', content: '原始正文' },
    { title: '测试小说', genre: '玄幻' },
    { title: '章节架构', level: 'chapter' },
    {
      issues: [
        {
          type: 'knowledge_conflict',
          description: '角色过早知道秘密',
          currentEvidence: '他已经知道门后的名字',
          historicalEvidence: '前文明确写他还不知道',
          historicalChapterNumber: 3,
          suggestion: '删去提前知晓的描述'
        }
      ]
    },
    {
      currentMemory: { summary: '当前章摘要' },
      relevantMemories: [],
      sourceExcerpts: []
    }
  );

  assert.match(prompt, /只修复 issues 里列出的问题/);
  assert.match(prompt, /不要新增新人物、新设定、新事件/);
  assert.match(prompt, /revisedContent/);
});

test('parseRevisionResult returns structured revised content', () => {
  const parsed = parseRevisionResult(`{
    "summary": "修复了提前知晓问题",
    "appliedIssues": [
      { "type": "knowledge_conflict", "description": "角色过早知道秘密" }
    ],
    "revisedContent": "修订后的完整正文"
  }`);

  assert.equal(parsed.summary, '修复了提前知晓问题');
  assert.equal(parsed.appliedIssues.length, 1);
  assert.equal(parsed.revisedContent, '修订后的完整正文');
});

test('parseRevisionResult supports tagged body content outside JSON', () => {
  const parsed = parseRevisionResult(`{
    "summary": "修复了提前知晓问题",
    "appliedIssues": [
      { "type": "knowledge_conflict", "description": "角色过早知道秘密" }
    ]
  }
<<<REVISED_CONTENT>>>
这里是修订后的完整正文
第二段正文
<<<END_REVISED_CONTENT>>>`);

  assert.match(parsed.revisedContent, /这里是修订后的完整正文/);
  assert.match(parsed.revisedContent, /第二段正文/);
});

test('parseRevisionResult falls back to body text after JSON block', () => {
  const parsed = parseRevisionResult(`{
    "summary": "修复了两个问题",
    "appliedIssues": [
      { "type": "item_state_conflict", "description": "补上金属片" }
    ]
  }

修订正文第一段

修订正文第二段`);

  assert.match(parsed.revisedContent, /修订正文第一段/);
  assert.match(parsed.revisedContent, /修订正文第二段/);
});

test('parseRevisionResult strips dangling revised content marker', () => {
  const parsed = parseRevisionResult(`{
    "summary": "修复了两个问题",
    "appliedIssues": []
  }

<<<REVISED_CONTENT>>>
土腥味钻进鼻腔。
林勇应了一声，走下田埂。`);

  assert.doesNotMatch(parsed.revisedContent, /<<<REVISED_CONTENT>>>/);
  assert.match(parsed.revisedContent, /土腥味钻进鼻腔/);
});

test('validateRevisionResult rejects suspiciously truncated revision content', () => {
  assert.throws(
    () => validateRevisionResult(
      {
        summary: 'summary',
        appliedIssues: [],
        revisedContent: '太短了'
      },
      '这里是一个明显更长的原章节正文，用来模拟完整章节内容，长度应当远大于修订结果。这里继续补充一些文字，用来确保长度超过两百个字符。为了让测试更稳，我们继续添加更多内容，描述人物动作、环境变化、对话节奏、心理活动和场景转换。这样就能模拟真实小说章节中常见的篇幅，并验证明显过短的修订结果会被当作截断处理，而不会直接覆盖原正文。'
    ),
    /修订结果疑似被截断/
  );
});
