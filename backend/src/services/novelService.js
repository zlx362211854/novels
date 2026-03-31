const db = require('../config/database');

function create(data) {
  const stmt = db.prepare(`
    INSERT INTO novels (title, description, genre)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(data.title, data.description || null, data.genre || null);
  return findById(result.lastInsertRowid);
}

function findAll() {
  const stmt = db.prepare(`
    SELECT * FROM novels ORDER BY updated_at DESC
  `);
  return stmt.all();
}

function findById(id) {
  const stmt = db.prepare('SELECT * FROM novels WHERE id = ?');
  return stmt.get(id);
}

function update(id, data) {
  const novel = findById(id);
  if (!novel) return null;

  const stmt = db.prepare(`
    UPDATE novels 
    SET title = COALESCE(?, title),
        description = COALESCE(?, description),
        genre = COALESCE(?, genre),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(data.title, data.description, data.genre, id);
  return findById(id);
}

function deleteNovel(id) {
  const novel = findById(id);
  if (!novel) return false;

  const stmt = db.prepare('DELETE FROM novels WHERE id = ?');
  stmt.run(id);
  return true;
}

module.exports = {
  create,
  findAll,
  findById,
  update,
  delete: deleteNovel
};
