const db = require('../config/database');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS novels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      genre TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS architectures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      novel_id INTEGER NOT NULL,
      level TEXT NOT NULL,
      parent_id INTEGER,
      title TEXT NOT NULL,
      plot_outline TEXT,
      characters TEXT,
      world_setting TEXT,
      emotional_tone TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES architectures(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      novel_id INTEGER NOT NULL,
      architecture_id INTEGER,
      chapter_number INTEGER NOT NULL,
      title TEXT,
      content TEXT,
      status TEXT DEFAULT 'draft',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
      FOREIGN KEY (architecture_id) REFERENCES architectures(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS chapter_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chapter_id INTEGER NOT NULL,
      version_number INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
      UNIQUE(chapter_id, version_number)
    );

    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      novel_id INTEGER NOT NULL,
      chapter_id INTEGER,
      task_type TEXT NOT NULL,
      scheduled_time DATETIME NOT NULL,
      status TEXT DEFAULT 'pending',
      retry_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
      FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS system_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      config_key TEXT UNIQUE NOT NULL,
      config_value TEXT NOT NULL,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS prompt_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      template TEXT NOT NULL,
      description TEXT,
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const defaultTemplate = db.prepare('SELECT id FROM prompt_templates WHERE is_default = 1').get();
  if (!defaultTemplate) {
    db.prepare(`
      INSERT INTO prompt_templates (name, template, description, is_default)
      VALUES (?, ?, ?, 1)
    `).run(
      '默认章节生成模板',
      `你是一位专业的网络小说作家。请根据以下信息生成章节内容：

## 小说基本信息
标题：{{novel_title}}
类型：{{genre}}

## 架构信息
{{architecture_info}}

## 章节要求
章节标题：{{chapter_title}}
章节序号：{{chapter_number}}

## 创作要求
1. 内容需要符合整体故事架构和情节大纲
2. 保持人物性格与设定一致
3. 遵循世界观设定
4. 情感基调：{{emotional_tone}}
5. 字数要求：2000-5000字
6. 使用Markdown格式输出

请开始创作：`,
      '系统默认的章节生成提示词模板'
    );
  }

  console.log('数据库初始化完成');
}

module.exports = { initDatabase };
