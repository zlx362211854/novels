import { sequelize, Novel, Chapter, Architecture, ChapterMemory, ChapterVersion, ScheduledTask, MultiChapterReview } from '../models/sequelize';

interface CreateNovelData {
  title: string;
  description?: string;
  genre?: string;
  publishConfig?: any;
}

async function create(data: CreateNovelData): Promise<Novel> {
  const novel = await Novel.create({
    title: data.title,
    description: data.description || null,
    genre: data.genre || null,
    publish_config: data.publishConfig ? JSON.stringify(data.publishConfig) : null
  });
  return novel;
}

async function findAll(): Promise<Novel[]> {
  const novels = await Novel.findAll({
    order: [['updated_at', 'DESC']]
  });
  return novels;
}

async function findById(id: string | number): Promise<Novel | null> {
  const novel = await Novel.findByPk(id);
  return novel;
}

async function update(id: string | number, data: Partial<CreateNovelData>): Promise<Novel | null> {
  const novel = await Novel.findByPk(id);
  if (!novel) return null;

  if (data.title !== undefined) novel.title = data.title;
  if (data.description !== undefined) novel.description = data.description;
  if (data.genre !== undefined) novel.genre = data.genre;
  if (data.publishConfig !== undefined) novel.publish_config = JSON.stringify(data.publishConfig || {});

  await novel.save();
  return novel;
}

async function deleteNovel(id: string | number): Promise<boolean> {
  const novel = await Novel.findByPk(id);
  if (!novel) return false;

  await sequelize.transaction(async (t) => {
    const chapters = await Chapter.findAll({ where: { novel_id: id }, attributes: ['id'], transaction: t });
    const chapterIds = chapters.map((c: any) => c.id);

    if (chapterIds.length > 0) {
      await ChapterVersion.destroy({ where: { chapter_id: chapterIds }, transaction: t });
      await ChapterMemory.destroy({ where: { chapter_id: chapterIds }, transaction: t });
    }

    await ScheduledTask.destroy({ where: { novel_id: id }, transaction: t });
    await MultiChapterReview.destroy({ where: { novel_id: id }, transaction: t });
    await Chapter.destroy({ where: { novel_id: id }, transaction: t });
    await Architecture.destroy({ where: { novel_id: id }, transaction: t });
    await novel.destroy({ transaction: t });
  });

  return true;
}

export { create, findAll, findById, update, deleteNovel };
