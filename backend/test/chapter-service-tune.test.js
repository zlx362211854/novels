const test = require('node:test');
const assert = require('node:assert/strict');

const chapterService = require('../src/services/chapterService');
const { chapterTuneGraph } = require('../src/ai/graphs/chapterTuneGraph');

test('tuneChapter rejects empty user prompt before tuning', async () => {
  await assert.rejects(
    () => chapterService.tuneChapter(1, '   '),
    /微调要求不能为空/
  );
});

test('tuneChapter returns a draft without requiring an updated saved chapter', async () => {
  const originalInvoke = chapterTuneGraph.invoke;
  let receivedState = null;

  chapterTuneGraph.invoke = async (state) => {
    receivedState = state;
    return {
      chapter: {
        id: 9,
        title: '第九章',
        chapter_number: 9,
        content: '原文',
      },
      tuneResult: {
        revisedContent: '微调后正文',
        summary: '加强了结尾悬念',
        changedAreas: ['结尾'],
      },
    };
  };

  try {
    const result = await chapterService.tuneChapter(9, '加强结尾悬念');
    assert.equal(receivedState.userPrompt, '加强结尾悬念');
    assert.equal(result.originalContent, '原文');
    assert.equal(result.revisedContent, '微调后正文');
    assert.equal(result.summary, '加强了结尾悬念');
  } finally {
    chapterTuneGraph.invoke = originalInvoke;
  }
});
