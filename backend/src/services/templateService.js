const db = require('../config/database');

function findAll() {
  const stmt = db.prepare('SELECT * FROM prompt_templates ORDER BY is_default DESC, created_at DESC');
  return stmt.all();
}

function findById(id) {
  const stmt = db.prepare('SELECT * FROM prompt_templates WHERE id = ?');
  return stmt.get(id);
}

function create(data) {
  const stmt = db.prepare(`
    INSERT INTO prompt_templates (name, template, description, is_default)
    VALUES (?, ?, ?, 0)
  `);
  const result = stmt.run(data.name, data.template, data.description || null);
  return findById(result.lastInsertRowid);
}

function update(id, data) {
  const template = findById(id);
  if (!template) return null;

  const stmt = db.prepare(`
    UPDATE prompt_templates 
    SET name = COALESCE(?, name),
        template = COALESCE(?, template),
        description = COALESCE(?, description),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(data.name, data.template, data.description, id);
  return findById(id);
}

function deleteTemplate(id) {
  const template = findById(id);
  if (!template) return false;

  const stmt = db.prepare('DELETE FROM prompt_templates WHERE id = ?');
  stmt.run(id);
  return true;
}

function setDefault(id) {
  const template = findById(id);
  if (!template) return null;

  db.prepare('UPDATE prompt_templates SET is_default = 0').run();

  const stmt = db.prepare('UPDATE prompt_templates SET is_default = 1 WHERE id = ?');
  stmt.run(id);

  return findById(id);
}

module.exports = {
  findAll,
  findById,
  create,
  update,
  delete: deleteTemplate,
  setDefault
};
