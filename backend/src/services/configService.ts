import { SystemConfig } from '../models/sequelize';

interface ConfigValue {
  key: string;
  value: any;
  description: string | null;
}

async function findAll(): Promise<Record<string, any>> {
  const configs = await SystemConfig.findAll();
  const result: Record<string, any> = {};
  configs.forEach((c: any) => {
    try {
      result[c.config_key] = JSON.parse(c.config_value);
    } catch {
      result[c.config_key] = c.config_value;
    }
  });
  return result;
}

async function findByKey(key: string): Promise<ConfigValue | null> {
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

async function upsert(key: string, value: any, description?: string): Promise<ConfigValue | null> {
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

async function getAll(): Promise<Record<string, any>> {
  return findAll();
}

async function get(key: string): Promise<ConfigValue | null> {
  return findByKey(key);
}

async function set(key: string, value: any, description?: string): Promise<ConfigValue | null> {
  return upsert(key, value, description);
}

async function remove(key: string): Promise<boolean> {
  const config = await SystemConfig.findOne({ where: { config_key: key } });
  if (!config) return false;
  await config.destroy();
  return true;
}

export {
  findAll,
  findByKey,
  upsert,
  getAll,
  get,
  set,
  remove
};