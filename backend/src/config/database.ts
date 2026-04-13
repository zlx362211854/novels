import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

const dbPath = process.env.DB_PATH || './data/novels.db';
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

export default db;