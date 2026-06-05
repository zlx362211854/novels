import { sequelize, Novel, Chapter, Architecture, ChapterMemory, ChapterVersion, ScheduledTask, MultiChapterReview } from '../models/sequelize';
import { parseNovelAiConfig, serializeNovelAiConfig } from '../ai/runtimeConfig';

interface CreateNovelData {
  title: string;
  description?: string;
  genre?: string;
  publishConfig?: any;
  aiConfig?: any;
}

function serializeNovel(novel: any): any {
  if (!novel) return novel;
  const plain = typeof novel.get === 'function' ? novel.get({ plain: true }) : novel;
  return {
    ...plain,
    publish_config: plain.publish_config ? (() => {
      try {
        return JSON.parse(plain.publish_config);
      } catch {
        return plain.publish_config;
      }
    })() : null,
    ai_config: parseNovelAiConfig(plain.ai_config),
  };
}

async function create(data: CreateNovelData, userId: number): Promise<Novel> {
  const novel = await Novel.create({
    user_id: userId,
    title: data.title,
    description: data.description || null,
    genre: data.genre || null,
    publish_config: data.publishConfig ? JSON.stringify(data.publishConfig) : null,
    ai_config: serializeNovelAiConfig(data.aiConfig),
  });
  return serializeNovel(novel);
}

async function findAll(userId: number): Promise<Novel[]> {
  const novels = await Novel.findAll({
    where: { user_id: userId },
    order: [['updated_at', 'DESC']]
  });
  return novels.map(serializeNovel);
}

async function findById(id: string | number, userId: number): Promise<Novel | null> {
  const novel = await Novel.findOne({ where: { id, user_id: userId } });
  return serializeNovel(novel);
}

async function update(id: string | number, userId: number, data: Partial<CreateNovelData>): Promise<Novel | null> {
  const novel = await Novel.findOne({ where: { id, user_id: userId } });
  if (!novel) return null;

  if (data.title !== undefined) novel.title = data.title;
  if (data.description !== undefined) novel.description = data.description;
  if (data.genre !== undefined) novel.genre = data.genre;
  if (data.publishConfig !== undefined) novel.publish_config = JSON.stringify(data.publishConfig || {});
  if (data.aiConfig !== undefined) novel.ai_config = serializeNovelAiConfig(data.aiConfig);

  await novel.save();
  return serializeNovel(novel);
}

async function deleteNovel(id: string | number, userId: number): Promise<boolean> {
  const novel = await Novel.findOne({ where: { id, user_id: userId } });
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
