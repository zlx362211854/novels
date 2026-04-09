const { PromptTemplate } = require('../models/sequelize');

async function findAll() {
  const templates = await PromptTemplate.findAll({
    order: [['is_default', 'DESC'], ['created_at', 'DESC']]
  });
  return templates;
}

async function findById(id) {
  const template = await PromptTemplate.findByPk(id);
  return template;
}

async function create(data) {
  const template = await PromptTemplate.create({
    name: data.name,
    template: data.template,
    description: data.description || null,
    is_default: 0
  });
  return template;
}

async function update(id, data) {
  const template = await PromptTemplate.findByPk(id);
  if (!template) return null;

  if (data.name !== undefined) template.name = data.name;
  if (data.template !== undefined) template.template = data.template;
  if (data.description !== undefined) template.description = data.description;

  await template.save();
  return template;
}

async function deleteTemplate(id) {
  const template = await PromptTemplate.findByPk(id);
  if (!template) return false;

  await template.destroy();
  return true;
}

async function setDefault(id) {
  const template = await PromptTemplate.findByPk(id);
  if (!template) return null;

  await PromptTemplate.update({ is_default: 0 }, { where: { is_default: 1 } });

  template.is_default = 1;
  await template.save();

  return template;
}

module.exports = {
  findAll,
  findById,
  create,
  update,
  delete: deleteTemplate,
  setDefault
};
