import { Sequelize, DataTypes, Model, Optional } from 'sequelize';
import * as path from 'path';
import * as fs from 'fs';

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

interface NovelAttributes {
  id?: number;
  title: string;
  description: string | null;
  genre: string | null;
  created_at?: Date;
  updated_at?: Date;
}

interface NovelCreationAttributes extends Optional<NovelAttributes, 'id'> { }

class Novel extends Model<NovelAttributes, NovelCreationAttributes> implements NovelAttributes {
  declare id: number;
  declare title: string;
  declare description: string | null;
  declare genre: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

Novel.init({
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
  updatedAt: 'updated_at',
  sequelize
});

interface ArchitectureAttributes {
  id?: number;
  novel_id: number;
  level: string;
  parent_id: number | null;
  title: string;
  plot_outline: string | null;
  characters: string | null;
  world_setting: string | null;
  emotional_tone: string | null;
  metadata: string | null;
  created_at?: Date;
  updated_at?: Date;
}

interface ArchitectureCreationAttributes extends Optional<ArchitectureAttributes, 'id'> { }

class Architecture extends Model<ArchitectureAttributes, ArchitectureCreationAttributes> implements ArchitectureAttributes {
  declare id: number;
  declare novel_id: number;
  declare level: string;
  declare parent_id: number | null;
  declare title: string;
  declare plot_outline: string | null;
  declare characters: string | null;
  declare world_setting: string | null;
  declare emotional_tone: string | null;
  declare metadata: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

Architecture.init({
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
  updatedAt: 'updated_at',
  sequelize
});

interface ChapterAttributes {
  id?: number;
  novel_id: number;
  architecture_id: number | null;
  chapter_number: number;
  title: string | null;
  content: string | null;
  review_result: string | null;
  publish_result: string | null;
  status: string;
  created_at?: Date;
  updated_at?: Date;
}

interface ChapterCreationAttributes extends Optional<ChapterAttributes, 'id'> { }

class Chapter extends Model<ChapterAttributes, ChapterCreationAttributes> implements ChapterAttributes {
  declare id: number;
  declare novel_id: number;
  declare architecture_id: number | null;
  declare chapter_number: number;
  declare title: string | null;
  declare content: string | null;
  declare review_result: string | null;
  declare publish_result: string | null;
  declare status: string;
  declare created_at: Date;
  declare updated_at: Date;
}

Chapter.init({
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
  review_result: {
    type: DataTypes.TEXT
  },
  publish_result: {
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
  updatedAt: 'updated_at',
  sequelize
});

interface ChapterMemoryAttributes {
  id?: number;
  novel_id: number;
  chapter_id: number;
  chapter_number: number;
  summary: string | null;
  entities: string | null;
  facts: string | null;
  state_changes: string | null;
  open_threads: string | null;
  source_excerpt_map: string | null;
  key_events: string | null;
  content_hash: string;
  created_at?: Date;
  updated_at?: Date;
}

interface ChapterMemoryCreationAttributes extends Optional<ChapterMemoryAttributes, 'id'> { }

class ChapterMemory extends Model<ChapterMemoryAttributes, ChapterMemoryCreationAttributes> implements ChapterMemoryAttributes {
  declare id: number;
  declare novel_id: number;
  declare chapter_id: number;
  declare chapter_number: number;
  declare summary: string | null;
  declare entities: string | null;
  declare facts: string | null;
  declare state_changes: string | null;
  declare open_threads: string | null;
  declare source_excerpt_map: string | null;
  declare key_events: string | null;
  declare content_hash: string;
  declare created_at: Date;
  declare updated_at: Date;
}

ChapterMemory.init({
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
    allowNull: false,
    unique: true,
    references: {
      model: 'chapters',
      key: 'id'
    }
  },
  chapter_number: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  summary: {
    type: DataTypes.TEXT
  },
  entities: {
    type: DataTypes.TEXT
  },
  facts: {
    type: DataTypes.TEXT
  },
  state_changes: {
    type: DataTypes.TEXT
  },
  open_threads: {
    type: DataTypes.TEXT
  },
  source_excerpt_map: {
    type: DataTypes.TEXT
  },
  key_events: {
    type: DataTypes.TEXT
  },
  content_hash: {
    type: DataTypes.STRING,
    allowNull: false
  }
}, {
  tableName: 'chapter_memories',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  sequelize
});

interface ChapterVersionAttributes {
  id?: number;
  chapter_id: number;
  version_number: number;
  content: string;
  created_at?: Date;
}

interface ChapterVersionCreationAttributes extends Optional<ChapterVersionAttributes, 'id'> { }

class ChapterVersion extends Model<ChapterVersionAttributes, ChapterVersionCreationAttributes> implements ChapterVersionAttributes {
  declare id: number;
  declare chapter_id: number;
  declare version_number: number;
  declare content: string;
  declare created_at: Date;
}

ChapterVersion.init({
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
  updatedAt: false,
  sequelize
});

interface ScheduledTaskAttributes {
  id?: number;
  novel_id: number;
  chapter_id: number | null;
  task_type: string;
  scheduled_time: Date;
  status: string;
  retry_count: number;
  created_at?: Date;
}

interface ScheduledTaskCreationAttributes extends Optional<ScheduledTaskAttributes, 'id'> { }

class ScheduledTask extends Model<ScheduledTaskAttributes, ScheduledTaskCreationAttributes> implements ScheduledTaskAttributes {
  declare id: number;
  declare novel_id: number;
  declare chapter_id: number | null;
  declare task_type: string;
  declare scheduled_time: Date;
  declare status: string;
  declare retry_count: number;
  declare created_at: Date;
}

ScheduledTask.init({
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
  updatedAt: false,
  sequelize
});

interface SystemConfigAttributes {
  id?: number;
  config_key: string;
  config_value: string;
  description: string | null;
  updated_at?: Date;
}

interface SystemConfigCreationAttributes extends Optional<SystemConfigAttributes, 'id'> { }

class SystemConfig extends Model<SystemConfigAttributes, SystemConfigCreationAttributes> implements SystemConfigAttributes {
  declare id: number;
  declare config_key: string;
  declare config_value: string;
  declare description: string | null;
  declare updated_at: Date;
}

SystemConfig.init({
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
  updatedAt: 'updated_at',
  sequelize
});

interface MultiChapterReviewAttributes {
  id?: string;
  novel_id: number;
  chapter_ids: string;
  review_data: string | null;
  fix_data: string | null;
  status: string;
  created_at?: Date;
  updated_at?: Date;
}

interface MultiChapterReviewCreationAttributes extends Optional<MultiChapterReviewAttributes, 'id'> { }

class MultiChapterReview extends Model<MultiChapterReviewAttributes, MultiChapterReviewCreationAttributes> implements MultiChapterReviewAttributes {
  declare id: string;
  declare novel_id: number;
  declare chapter_ids: string;
  declare review_data: string | null;
  declare fix_data: string | null;
  declare status: string;
  declare created_at: Date;
  declare updated_at: Date;
}

MultiChapterReview.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  novel_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'novels',
      key: 'id'
    }
  },
  chapter_ids: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  review_data: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  fix_data: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'reviewing',
  },
}, {
  tableName: 'multi_chapter_reviews',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  sequelize
});

Novel.hasMany(Architecture, { foreignKey: 'novel_id', as: 'architectures', onDelete: 'CASCADE' });
Architecture.belongsTo(Novel, { foreignKey: 'novel_id', as: 'novel' });

Architecture.hasMany(Architecture, { foreignKey: 'parent_id', as: 'children', onDelete: 'CASCADE' });
Architecture.belongsTo(Architecture, { foreignKey: 'parent_id', as: 'parent' });

Novel.hasMany(Chapter, { foreignKey: 'novel_id', as: 'chapters', onDelete: 'CASCADE' });
Chapter.belongsTo(Novel, { foreignKey: 'novel_id', as: 'novel' });

Novel.hasMany(ChapterMemory, { foreignKey: 'novel_id', as: 'chapterMemories', onDelete: 'CASCADE' });
ChapterMemory.belongsTo(Novel, { foreignKey: 'novel_id', as: 'novel' });

Chapter.hasOne(ChapterMemory, { foreignKey: 'chapter_id', as: 'memory', onDelete: 'CASCADE' });
ChapterMemory.belongsTo(Chapter, { foreignKey: 'chapter_id', as: 'chapter' });

Chapter.hasMany(ChapterVersion, { foreignKey: 'chapter_id', as: 'versions', onDelete: 'CASCADE' });
ChapterVersion.belongsTo(Chapter, { foreignKey: 'chapter_id', as: 'chapter' });

Chapter.belongsTo(Architecture, { foreignKey: 'architecture_id', as: 'architecture' });
Architecture.hasMany(Chapter, { foreignKey: 'architecture_id', as: 'chapters' });

Novel.hasMany(ScheduledTask, { foreignKey: 'novel_id', as: 'tasks', onDelete: 'CASCADE' });
ScheduledTask.belongsTo(Novel, { foreignKey: 'novel_id', as: 'novel' });

ScheduledTask.belongsTo(Chapter, { foreignKey: 'chapter_id', as: 'chapter' });
Chapter.hasMany(ScheduledTask, { foreignKey: 'chapter_id', as: 'tasks' });

async function initDatabase(): Promise<void> {
  await sequelize.sync({ force: false, hooks: false });
  await ensureLegacySchema();
  console.log('数据库初始化完成 (Sequelize)');
}

async function ensureLegacySchema(): Promise<void> {
  const queryInterface = sequelize.getQueryInterface();
  const chapterColumns = await queryInterface.describeTable('chapters');

  if (!chapterColumns.review_result) {
    await queryInterface.addColumn('chapters', 'review_result', {
      type: DataTypes.TEXT,
      allowNull: true
    });
  }

  if (!chapterColumns.publish_result) {
    await queryInterface.addColumn('chapters', 'publish_result', {
      type: DataTypes.TEXT,
      allowNull: true
    });
  }

  const chapterMemoryColumns = await queryInterface.describeTable('chapter_memories').catch(() => null as any);
  if (chapterMemoryColumns && !chapterMemoryColumns.key_events) {
    await queryInterface.addColumn('chapter_memories', 'key_events', {
      type: DataTypes.TEXT,
      allowNull: true
    });
  }

  const allTables = await queryInterface.showAllTables();
  if (!allTables.includes('multi_chapter_reviews')) {
    await MultiChapterReview.sync({ force: false });
  }
}

export {
  sequelize,
  Novel,
  Architecture,
  Chapter,
  ChapterMemory,
  ChapterVersion,
  ScheduledTask,
  SystemConfig,
  MultiChapterReview,
  initDatabase
};
