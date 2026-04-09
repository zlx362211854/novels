const { Architecture, Novel } = require('../models/sequelize');

async function create(data) {
  const architecture = await Architecture.create({
    novel_id: data.novelId,
    level: data.level,
    parent_id: data.parentId || null,
    title: data.title,
    plot_outline: data.plotOutline || null,
    characters: data.characters ? JSON.stringify(data.characters) : null,
    world_setting: data.worldSetting ? JSON.stringify(data.worldSetting) : null,
    emotional_tone: data.emotionalTone || null,
    metadata: data.metadata ? JSON.stringify(data.metadata) : null
  });
  return parseJsonFields(architecture);
}

async function findByNovelId(novelId) {
  const architectures = await Architecture.findAll({
    where: { novel_id: novelId },
    order: [['id', 'ASC']]
  });
  return architectures.map(row => parseJsonFields(row));
}

async function findByParentId(parentId) {
  const architectures = await Architecture.findAll({
    where: { parent_id: parentId },
    order: [['id', 'ASC']]
  });
  return architectures.map(row => parseJsonFields(row));
}

async function findById(id) {
  const architecture = await Architecture.findByPk(id);
  return architecture ? parseJsonFields(architecture) : null;
}

async function update(id, data) {
  const architecture = await Architecture.findByPk(id);
  if (!architecture) return null;

  if (data.title !== undefined) architecture.title = data.title;
  if (data.plotOutline !== undefined) architecture.plot_outline = data.plotOutline;
  if (data.characters !== undefined) architecture.characters = JSON.stringify(data.characters);
  if (data.worldSetting !== undefined) architecture.world_setting = JSON.stringify(data.worldSetting);
  if (data.emotionalTone !== undefined) architecture.emotional_tone = data.emotionalTone;
  if (data.metadata !== undefined) architecture.metadata = JSON.stringify(data.metadata);

  await architecture.save();
  return parseJsonFields(architecture);
}

async function deleteArchitecture(id) {
  const architecture = await Architecture.findByPk(id);
  if (!architecture) return false;

  await architecture.destroy();
  return true;
}

function parseJsonFields(row) {
  let plain;
  if (row.toJSON) {
    plain = row.toJSON();
  } else if (row.to) {
    plain = row.to();
  } else {
    plain = row;
  }

  if (plain.dataValues) {
    plain = plain.dataValues;
  }

  return {
    ...plain,
    characters: plain.characters ? JSON.parse(plain.characters) : null,
    worldSetting: plain.world_setting ? JSON.parse(plain.world_setting) : null,
    metadata: plain.metadata ? JSON.parse(plain.metadata) : null
  };
}

module.exports = {
  create,
  findByNovelId,
  findByParentId,
  findById,
  update,
  delete: deleteArchitecture
};
