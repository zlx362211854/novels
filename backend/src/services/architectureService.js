const db = require('../config/database');

function create(data) {
  const stmt = db.prepare(`
    INSERT INTO architectures (novel_id, level, parent_id, title, plot_outline, characters, world_setting, emotional_tone, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    data.novelId,
    data.level,
    data.parentId || null,
    data.title,
    data.plotOutline || null,
    data.characters ? JSON.stringify(data.characters) : null,
    data.worldSetting ? JSON.stringify(data.worldSetting) : null,
    data.emotionalTone || null,
    data.metadata ? JSON.stringify(data.metadata) : null
  );
  return findById(result.lastInsertRowid);
}

function findByNovelId(novelId) {
  const stmt = db.prepare('SELECT * FROM architectures WHERE novel_id = ? ORDER BY id');
  const rows = stmt.all(novelId);
  return rows.map(row => parseJsonFields(row));
}

function findByParentId(parentId) {
  const stmt = db.prepare('SELECT * FROM architectures WHERE parent_id = ? ORDER BY id');
  const rows = stmt.all(parentId);
  return rows.map(row => parseJsonFields(row));
}

function findById(id) {
  const stmt = db.prepare('SELECT * FROM architectures WHERE id = ?');
  const row = stmt.get(id);
  return row ? parseJsonFields(row) : null;
}

function update(id, data) {
  const architecture = findById(id);
  if (!architecture) return null;

  const stmt = db.prepare(`
    UPDATE architectures 
    SET title = COALESCE(?, title),
        plot_outline = COALESCE(?, plot_outline),
        characters = COALESCE(?, characters),
        world_setting = COALESCE(?, world_setting),
        emotional_tone = COALESCE(?, emotional_tone),
        metadata = COALESCE(?, metadata),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  stmt.run(
    data.title,
    data.plotOutline,
    data.characters ? JSON.stringify(data.characters) : null,
    data.worldSetting ? JSON.stringify(data.worldSetting) : null,
    data.emotionalTone,
    data.metadata ? JSON.stringify(data.metadata) : null,
    id
  );
  return findById(id);
}

function deleteArchitecture(id) {
  const architecture = findById(id);
  if (!architecture) return false;

  const stmt = db.prepare('DELETE FROM architectures WHERE id = ?');
  stmt.run(id);
  return true;
}

function parseJsonFields(row) {
  return {
    ...row,
    characters: row.characters ? JSON.parse(row.characters) : null,
    worldSetting: row.world_setting ? JSON.parse(row.world_setting) : null,
    metadata: row.metadata ? JSON.parse(row.metadata) : null
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
