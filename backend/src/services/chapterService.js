const { Chapter, ChapterVersion, Novel, Architecture } = require('../models/sequelize');
const aiService = require('./aiService');
const reviewAgent = require('./reviewAgent');

async function create(data) {
  const chapter = await Chapter.create({
    novel_id: data.novelId,
    architecture_id: data.architectureId || null,
    chapter_number: data.chapterNumber,
    title: data.title || null,
    content: data.content || null,
    status: data.status || 'draft'
  });
  return chapter;
}

async function findByNovelId(novelId) {
  const chapters = await Chapter.findAll({
    where: { novel_id: novelId },
    order: [['chapter_number', 'ASC']]
  });
  return chapters;
}

async function findById(id) {
  const chapter = await Chapter.findByPk(id);
  return chapter;
}

async function update(id, data) {
  const chapter = await Chapter.findByPk(id);
  if (!chapter) return null;

  if (data.content && data.content !== chapter.content && chapter.content) {
    await createVersion(id, chapter.content);
  }

  if (data.title !== undefined) chapter.title = data.title;
  if (data.content !== undefined) chapter.content = data.content;
  if (data.status !== undefined) chapter.status = data.status;
  if (data.architectureId !== undefined) chapter.architecture_id = data.architectureId;

  await chapter.save();
  return chapter;
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

  const reviewResult = await reviewAgent.review({
    chapter: updatedChapter,
    novel,
    architecture
  }, signal);

  return {
    chapter: updatedChapter,
    review: reviewResult
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
  generate
};
