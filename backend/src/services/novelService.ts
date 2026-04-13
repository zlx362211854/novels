import { Novel } from '../models/sequelize';

interface CreateNovelData {
  title: string;
  description?: string;
  genre?: string;
}

async function create(data: CreateNovelData): Promise<Novel> {
  const novel = await Novel.create({
    title: data.title,
    description: data.description || null,
    genre: data.genre || null
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

  await novel.save();
  return novel;
}

async function deleteNovel(id: string | number): Promise<boolean> {
  const novel = await Novel.findByPk(id);
  if (!novel) return false;

  await novel.destroy();
  return true;
}

export { create, findAll, findById, update, deleteNovel };