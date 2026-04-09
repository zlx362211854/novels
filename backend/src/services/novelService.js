const { Novel } = require('../models/sequelize');

async function create(data) {
  const novel = await Novel.create({
    title: data.title,
    description: data.description || null,
    genre: data.genre || null
  });
  return novel;
}

async function findAll() {
  const novels = await Novel.findAll({
    order: [['updated_at', 'DESC']]
  });
  return novels;
}

async function findById(id) {
  const novel = await Novel.findByPk(id);
  return novel;
}

async function update(id, data) {
  const novel = await Novel.findByPk(id);
  if (!novel) return null;

  if (data.title !== undefined) novel.title = data.title;
  if (data.description !== undefined) novel.description = data.description;
  if (data.genre !== undefined) novel.genre = data.genre;

  await novel.save();
  return novel;
}

async function deleteNovel(id) {
  const novel = await Novel.findByPk(id);
  if (!novel) return false;

  await novel.destroy();
  return true;
}

module.exports = {
  create,
  findAll,
  findById,
  update,
  delete: deleteNovel
};
