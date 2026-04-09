const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || './data/novels.db';
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: dbPath,
  logging: false
});

const Novel = sequelize.define('Novel', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT
  },
  genre: {
    type: DataTypes.STRING
  }
}, {
  tableName: 'novels',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

const Architecture = sequelize.define('Architecture', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  novel_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'novels',
      key: 'id'
    }
  },
  level: {
    type: DataTypes.STRING,
    allowNull: false
  },
  parent_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'architectures',
      key: 'id'
    }
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  plot_outline: {
    type: DataTypes.TEXT
  },
  characters: {
    type: DataTypes.TEXT
  },
  world_setting: {
    type: DataTypes.TEXT
  },
  emotional_tone: {
    type: DataTypes.STRING
  },
  metadata: {
    type: DataTypes.TEXT
  }
}, {
  tableName: 'architectures',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

const Chapter = sequelize.define('Chapter', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  novel_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'novels',
      key: 'id'
    }
  },
  architecture_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'architectures',
      key: 'id'
    }
  },
  chapter_number: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  title: {
    type: DataTypes.STRING
  },
  content: {
    type: DataTypes.TEXT
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'draft'
  }
}, {
  tableName: 'chapters',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

const ChapterVersion = sequelize.define('ChapterVersion', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  chapter_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'chapters',
      key: 'id'
    }
  },
  version_number: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  }
}, {
  tableName: 'chapter_versions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

const ScheduledTask = sequelize.define('ScheduledTask', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  novel_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'novels',
      key: 'id'
    }
  },
  chapter_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'chapters',
      key: 'id'
    }
  },
  task_type: {
    type: DataTypes.STRING,
    allowNull: false
  },
  scheduled_time: {
    type: DataTypes.DATE,
    allowNull: false
  },
  status: {
    type: DataTypes.STRING,
    defaultValue: 'pending'
  },
  retry_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'scheduled_tasks',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false
});

const SystemConfig = sequelize.define('SystemConfig', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  config_key: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  config_value: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT
  }
}, {
  tableName: 'system_configs',
  timestamps: true,
  createdAt: false,
  updatedAt: 'updated_at'
});

const PromptTemplate = sequelize.define('PromptTemplate', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  template: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT
  },
  is_default: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'prompt_templates',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

Novel.hasMany(Architecture, { foreignKey: 'novel_id', as: 'architectures', onDelete: 'CASCADE' });
Architecture.belongsTo(Novel, { foreignKey: 'novel_id', as: 'novel' });

Architecture.hasMany(Architecture, { foreignKey: 'parent_id', as: 'children', onDelete: 'CASCADE' });
Architecture.belongsTo(Architecture, { foreignKey: 'parent_id', as: 'parent' });

Novel.hasMany(Chapter, { foreignKey: 'novel_id', as: 'chapters', onDelete: 'CASCADE' });
Chapter.belongsTo(Novel, { foreignKey: 'novel_id', as: 'novel' });

Chapter.hasMany(ChapterVersion, { foreignKey: 'chapter_id', as: 'versions', onDelete: 'CASCADE' });
ChapterVersion.belongsTo(Chapter, { foreignKey: 'chapter_id', as: 'chapter' });

Chapter.belongsTo(Architecture, { foreignKey: 'architecture_id', as: 'architecture' });
Architecture.hasMany(Chapter, { foreignKey: 'architecture_id', as: 'chapters' });

Novel.hasMany(ScheduledTask, { foreignKey: 'novel_id', as: 'tasks', onDelete: 'CASCADE' });
ScheduledTask.belongsTo(Novel, { foreignKey: 'novel_id', as: 'novel' });

ScheduledTask.belongsTo(Chapter, { foreignKey: 'chapter_id', as: 'chapter' });
Chapter.hasMany(ScheduledTask, { foreignKey: 'chapter_id', as: 'tasks' });

async function initDatabase() {
  await sequelize.sync({ force: false, hooks: false });

  const defaultTemplate = await PromptTemplate.findOne({ where: { is_default: 1 } });
  if (!defaultTemplate) {
    await PromptTemplate.create({
      name: '默认章节生成模板',
      template: `你是一位专业的网络小说作家。请根据以下信息生成章节内容：

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
      description: '系统默认的章节生成提示词模板',
      is_default: 1
    });
  }

  console.log('数据库初始化完成 (Sequelize)');
}

module.exports = {
  sequelize,
  Novel,
  Architecture,
  Chapter,
  ChapterVersion,
  ScheduledTask,
  SystemConfig,
  PromptTemplate,
  initDatabase
};
