const { Chapter, ChapterVersion, Novel, Architecture } = require('../models/sequelize');
const aiService = require('./aiService');
const reviewAgent = require('../agents/reviewAgent');
const chapterRevisionAgent = require('../agents/chapterRevisionAgent');
const chapterMemoryService = require('./chapterMemoryService');
const reviewContextService = require('./reviewContextService');
const aiStatus = require('./aiStatusService');

async function ensureChapterNumber(chapter) {
  if (!chapter.architecture_id) return chapter;

  const arch = await Architecture.findByPk(chapter.architecture_id);
  if (!arch || !arch.parent_id) return chapter;

  const siblings = await Architecture.findAll({
    where: { parent_id: arch.parent_id, level: 'chapter' },
    order: [['id', 'ASC']]
  });
  const index = siblings.findIndex(s => s.id === arch.id);
  const correctNumber = index >= 0 ? index + 1 : chapter.chapter_number;

  if (chapter.chapter_number !== correctNumber) {
    console.log(`[chapter] 修正章节编号: ${chapter.chapter_number} -> ${correctNumber} (chapterId=${chapter.id})`);
    const record = typeof chapter.save === 'function' ? chapter : await Chapter.findByPk(chapter.id);
    record.chapter_number = correctNumber;
    await record.save();
    if (typeof chapter.save !== 'function') {
      chapter.chapter_number = correctNumber;
    }
  }

  return chapter;
}

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
  const taskId = `generate-${chapterId}-${Date.now()}`;
  const steps = ['生成章节内容', '提取记忆卡', '逻辑审阅'];

  let chapter = await Chapter.findByPk(chapterId);
  if (!chapter) throw new Error('章节不存在');
  chapter = await ensureChapterNumber(chapter);

  const novel = await Novel.findByPk(chapter.novel_id);
  const architecture = chapter.architecture_id ? await Architecture.findByPk(chapter.architecture_id) : null;

  try {
    aiStatus.start(taskId, `生成「${chapter.title || '章节'}」`, steps);

    const generatedContent = await aiService.generateChapter({
      novel,
      chapter,
      architecture,
      templateId
    }, signal);

    aiStatus.step(taskId, 1, steps[1]);

    const updatedChapter = await update(chapterId, {
      content: generatedContent,
      status: 'generated'
    });

    let reviewResult = null;
    let reviewWarning = null;
    try {
      aiStatus.step(taskId, 2, steps[2]);
      reviewResult = await reviewChapter(chapterId, signal, {
        chapter: updatedChapter,
        novel,
        architecture
      });
    } catch (error) {
      reviewWarning = `自动审阅已跳过：${error.message}`;
      console.error(`[chapter-generate] 自动审阅失败，已跳过。chapterId=${chapterId}`, error);
    }

    aiStatus.finish(taskId);

    return {
      chapter: updatedChapter,
      review: reviewResult,
      reviewWarning
    };
  } catch (err) {
    aiStatus.error(taskId, err.message);
    throw err;
  }
}

async function reviewChapter(chapterId, signal, preloaded = {}) {
  const isStandalone = !aiStatus.getCurrent();
  const taskId = isStandalone ? `review-${chapterId}-${Date.now()}` : null;

  if (!preloaded.chapter) {
    const chapter = await Chapter.findByPk(chapterId);
    if (!chapter) throw new Error('章节不存在');
    preloaded.chapter = chapter;
  }
  preloaded.chapter = await ensureChapterNumber(preloaded.chapter);

  if (!preloaded.novel) {
    const novel = await Novel.findByPk(preloaded.chapter.novel_id);
    if (!novel) throw new Error('小说不存在');
    preloaded.novel = novel;
  }

  try {
    if (taskId) {
      aiStatus.start(taskId, `审阅「${preloaded.chapter.title || '章节'}」`, ['提取记忆卡', '逻辑审阅']);
    }

    let currentMemory = null;
    if (preloaded.chapter.content) {
      currentMemory = await chapterMemoryService.upsertForChapter(chapterId, signal);
    }

    if (taskId) aiStatus.step(taskId, 1, '逻辑审阅');

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

    if (taskId) aiStatus.finish(taskId);
    return reviewResult;
  } catch (err) {
    if (taskId) aiStatus.error(taskId, err.message);
    throw err;
  }
}

async function reviseChapter(chapterId, reviewResult, signal) {
  const taskId = `revise-${chapterId}-${Date.now()}`;
  const steps = ['构建上下文', '修订章节', '保存结果'];

  if (!reviewResult?.issues?.length) {
    throw new Error('没有可用于修订的问题');
  }

  let chapter = await Chapter.findByPk(chapterId);
  if (!chapter) throw new Error('章节不存在');
  if (!chapter.content || !chapter.content.trim()) {
    throw new Error('章节正文为空，无法生成修订建议稿');
  }
  chapter = await ensureChapterNumber(chapter);

  const novel = await Novel.findByPk(chapter.novel_id);
  if (!novel) throw new Error('小说不存在');

  try {
    aiStatus.start(taskId, `修订「${chapter.title || '章节'}」`, steps);

    const reviewContext = await reviewContextService.buildReviewContext(chapterId, signal);

    aiStatus.step(taskId, 1, steps[1]);

    const revisionResult = await chapterRevisionAgent.revise({
      chapter,
      novel,
      architecture: reviewContext.architecture,
      reviewResult,
      currentMemory: reviewContext.currentMemory,
      relevantMemories: reviewContext.relevantMemories,
      sourceExcerpts: reviewContext.sourceExcerpts
    }, signal);

    aiStatus.step(taskId, 2, steps[2]);

    const updatedChapter = await update(chapterId, {
      content: revisionResult.revisedContent,
      status: chapter.status || 'generated'
    });

    aiStatus.finish(taskId);

    return {
      chapter: updatedChapter,
      review: null,
      revision: {
        summary: revisionResult.summary,
        appliedIssues: revisionResult.appliedIssues
      }
    };
  } catch (err) {
    aiStatus.error(taskId, err.message);
    throw err;
  }
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
