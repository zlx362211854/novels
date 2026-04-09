const { SystemConfig } = require('../models/sequelize');

async function findAll() {
  const configs = await SystemConfig.findAll();
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

async function findByKey(key) {
  const config = await SystemConfig.findOne({ where: { config_key: key } });
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

async function upsert(key, value, description) {
  const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);

  const existing = await SystemConfig.findOne({ where: { config_key: key } });

  if (existing) {
    existing.config_value = valueStr;
    if (description !== undefined) existing.description = description;
    await existing.save();
  } else {
    await SystemConfig.create({
      config_key: key,
      config_value: valueStr,
      description: description
    });
  }

  return findByKey(key);
}

module.exports = {
  findAll,
  findByKey,
  upsert
};
