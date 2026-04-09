const test = require('node:test');
const assert = require('node:assert/strict');

const models = require('../src/models/sequelize');

test('exports ChapterMemory model with chapter and novel associations', () => {
  assert.ok(models.ChapterMemory, 'expected ChapterMemory model export');
  assert.equal(models.ChapterMemory.tableName, 'chapter_memories');
  assert.ok(models.Chapter.rawAttributes.review_result, 'expected Chapter.review_result column');

  assert.ok(models.Novel.associations.chapterMemories, 'expected Novel.chapterMemories association');
  assert.ok(models.Chapter.associations.memory, 'expected Chapter.memory association');
  assert.ok(models.ChapterMemory.associations.novel, 'expected ChapterMemory.novel association');
  assert.ok(models.ChapterMemory.associations.chapter, 'expected ChapterMemory.chapter association');
});
