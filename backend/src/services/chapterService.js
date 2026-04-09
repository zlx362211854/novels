const { Chapter, ChapterVersion, Novel, Architecture } = require('../models/sequelize');
const aiService = require('./aiService');
const reviewAgent = require('../agents/reviewAgent');
const chapterRevisionAgent = require('../agents/chapterRevisionAgent');
const chapterMemoryService = require('./chapterMemoryService');
const reviewContextService = require('./reviewContextService');

async function create(data) {
  const chapter = await Chapter.create({
    novel_id: data.novelId,
    architecture_id: data.architectureId || null,
    chapter_number: data.chapterNumber,
    title: data.title || null,
    content: data.content || null,
    review_result: null,
    status: data.status || 'draft'
  });
  return serializeChapter(chapter);
}

async function findByNovelId(novelId) {
  const chapters = await Chapter.findAll({
    where: { novel_id: novelId },
    order: [['chapter_number', 'ASC']]
  });
  return chapters.map(serializeChapter);
}

async function findById(id) {
  const chapter = await Chapter.findByPk(id);
  return serializeChapter(chapter);
}

async function update(id, data) {
  const chapter = await Chapter.findByPk(id);
  if (!chapter) return null;

  const contentChanged =
    data.content !== undefined &&
    data.content !== chapter.content;

  if (data.content && data.content !== chapter.content && chapter.content) {
    await createVersion(id, chapter.content);
  }

  if (data.title !== undefined) chapter.title = data.title;
  if (data.content !== undefined) chapter.content = data.content;
  if (data.status !== undefined) chapter.status = data.status;
  if (data.architectureId !== undefined) chapter.architecture_id = data.architectureId;
  if (contentChanged) chapter.review_result = null;

  await chapter.save();

  if (contentChanged) {
    try {
      await chapterMemoryService.upsertForChapter(id);
    } catch (memoryError) {
      console.error(`[chapter-update] 记忆卡更新失败，已跳过。chapterId=${id}`, memoryError.message);
    }
  }

  return serializeChapter(chapter);
}

async function deleteChapter(id) {
  const chapter = await Chapter.findByPk(id);
  if (!chapter) return false;

  await chapter.destroy();
  return true;
}

async function createVersion(chapterId, content) {
  const count = await ChapterVersion.count({ where: { chapter_id: chapterId } });

  await ChapterVersion.create({
    chapter_id: chapterId,
    version_number: count + 1,
    content: content
  });
}

async function getVersions(chapterId) {
  const versions = await ChapterVersion.findAll({
    where: { chapter_id: chapterId },
    order: [['version_number', 'DESC']]
  });
  return versions;
}

async function restoreVersion(chapterId, versionNumber) {
  const version = await ChapterVersion.findOne({
    where: { chapter_id: chapterId, version_number: versionNumber }
  });
  if (!version) return null;

  return update(chapterId, { content: version.content });
}

async function generate(chapterId, templateId, signal) {
  const chapter = await Chapter.findByPk(chapterId);
  if (!chapter) throw new Error('章节不存在');

  const novel = await Novel.findByPk(chapter.novel_id);
  const architecture = chapter.architecture_id ? await Architecture.findByPk(chapter.architecture_id) : null;

  const generatedContent = await aiService.generateChapter({
    novel,
    chapter,
    architecture,
    templateId
  }, signal);

  const updatedChapter = await update(chapterId, {
    content: generatedContent,
    status: 'generated'
  });

  let reviewResult = null;
  let reviewWarning = null;
  try {
    reviewResult = await reviewChapter(chapterId, signal, {
      chapter: updatedChapter,
      novel,
      architecture
    });
  } catch (error) {
    reviewWarning = `自动审阅已跳过：${error.message}`;
    console.error(`[chapter-generate] 自动审阅失败，已跳过。chapterId=${chapterId}`, error);
  }

  return {
    chapter: updatedChapter,
    review: reviewResult,
    reviewWarning
  };
}

async function reviewChapter(chapterId, signal, preloaded = {}) {
  if (!preloaded.chapter) {
    const chapter = await Chapter.findByPk(chapterId);
    if (!chapter) throw new Error('章节不存在');
    preloaded.chapter = chapter;
  }

  if (!preloaded.novel) {
    const novel = await Novel.findByPk(preloaded.chapter.novel_id);
    if (!novel) throw new Error('小说不存在');
    preloaded.novel = novel;
  }

  let currentMemory = null;
  if (preloaded.chapter.content) {
    currentMemory = await chapterMemoryService.upsertForChapter(chapterId, signal);
  }

  const reviewContext = await reviewContextService.buildReviewContext(chapterId, signal, {
    chapter: preloaded.chapter,
    novel: preloaded.novel,
    architecture: preloaded.architecture,
    currentMemory
  });

  const reviewResult = await reviewAgent.review({
    chapter: preloaded.chapter,
    novel: preloaded.novel,
    architecture: preloaded.architecture ?? reviewContext.architecture,
    currentMemory: reviewContext.currentMemory,
    relevantMemories: reviewContext.relevantMemories,
    sourceExcerpts: reviewContext.sourceExcerpts
  }, signal);

  const chapterRecord = await Chapter.findByPk(chapterId);
  if (chapterRecord) {
    chapterRecord.review_result = JSON.stringify(reviewResult);
    await chapterRecord.save();
  }

  return reviewResult;
}

async function reviseChapter(chapterId, reviewResult, signal) {
  if (!reviewResult?.issues?.length) {
    throw new Error('没有可用于修订的问题');
  }

  const chapter = await Chapter.findByPk(chapterId);
  if (!chapter) throw new Error('章节不存在');
  if (!chapter.content || !chapter.content.trim()) {
    throw new Error('章节正文为空，无法生成修订建议稿');
  }

  const novel = await Novel.findByPk(chapter.novel_id);
  if (!novel) throw new Error('小说不存在');

  const reviewContext = await reviewContextService.buildReviewContext(chapterId, signal);

  const revisionResult = await chapterRevisionAgent.revise({
    chapter,
    novel,
    architecture: reviewContext.architecture,
    reviewResult,
    currentMemory: reviewContext.currentMemory,
    relevantMemories: reviewContext.relevantMemories,
    sourceExcerpts: reviewContext.sourceExcerpts
  }, signal);

  const updatedChapter = await update(chapterId, {
    content: revisionResult.revisedContent,
    status: chapter.status || 'generated'
  });

  return {
    chapter: updatedChapter,
    review: null,
    revision: {
      summary: revisionResult.summary,
      appliedIssues: revisionResult.appliedIssues
    }
  };
}

module.exports = {
  create,
  findByNovelId,
  findById,
  update,
  delete: deleteChapter,
  getVersions,
  restoreVersion,
  generate,
  reviewChapter,
  reviseChapter
};

function serializeChapter(chapter) {
  if (!chapter) return chapter;

  const plain = typeof chapter.get === 'function' ? chapter.get({ plain: true }) : chapter;
  return {
    ...plain,
    review_result: parseReviewResultField(plain.review_result)
  };
}

function parseReviewResultField(reviewResult) {
  if (!reviewResult) return null;
  try {
    return typeof reviewResult === 'string' ? JSON.parse(reviewResult) : reviewResult;
  } catch {
    return null;
  }
}
