const db = require('../config/database');

function findAll() {
  const stmt = db.prepare('SELECT * FROM system_configs');
  const configs = stmt.all();
  const result = {};
  configs.forEach(c => {
    try {
      result[c.config_key] = JSON.parse(c.config_value);
    } catch {
      result[c.config_key] = c.config_value;
    }
  });
  return result;
}

function findByKey(key) {
  const stmt = db.prepare('SELECT * FROM system_configs WHERE config_key = ?');
  const config = stmt.get(key);
  if (!config) return null;
  try {
    return {
      key: config.config_key,
      value: JSON.parse(config.config_value),
      description: config.description
    };
  } catch {
    return {
      key: config.config_key,
      value: config.config_value,
      description: config.description
    };
  }
}

function upsert(key, value, description) {
  const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);

  const existing = db.prepare('SELECT id FROM system_configs WHERE config_key = ?').get(key);

  if (existing) {
    const stmt = db.prepare(`
      UPDATE system_configs 
      SET config_value = ?, description = COALESCE(?, description), updated_at = CURRENT_TIMESTAMP
      WHERE config_key = ?
    `);
    stmt.run(valueStr, description, key);
  } else {
    const stmt = db.prepare(`
      INSERT INTO system_configs (config_key, config_value, description)
      VALUES (?, ?, ?)
    `);
    stmt.run(key, valueStr, description);
  }

  return findByKey(key);
}

module.exports = {
  findAll,
  findByKey,
  upsert
};
