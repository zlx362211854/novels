# Spec: AI长篇小说创作工具

## 1. 背景与目标

### 1.1 背景

网络小说创作是一个复杂的过程，尤其对于新手作者而言，管理长篇小说的多级架构（全本/卷/章）、保持情节一致性、人物性格连贯性、世界观统一性都是巨大的挑战。传统的大纲工具缺乏AI辅助生成能力，而现有的AI写作工具往往缺乏对长篇作品架构的系统管理。

本项目旨在开发一款面向新手作者的AI辅助长篇小说创作工具，通过系统化的多级架构管理和AI自动生成技术，降低写作门槛、提升创作效率，并保证长篇作品的一致性。

### 1.2 业务目标

- 为新手作者提供易用的长篇小说创作工具
- 通过AI辅助生成章节内容，降低创作门槛
- 通过自动一致性审核，保证作品质量
- 支持多AI模型切换，提供灵活的创作选择
- 实现本地部署，保护创作隐私

### 1.3 用户目标

- 创建和管理小说作品及其多级架构（全本/卷/章）
- 定义情节大纲、人物设定、世界观、情感基调等创作要素
- 手动或定时触发AI生成符合架构的章节内容
- 自动审核生成内容与架构的一致性
- 管理章节版本历史
- 导出标准Markdown格式的作品

## 2. 需求类型概览

| 类型         | 适用 | 证据来源                     |
| ------------ | ---- | ---------------------------- |
| 业务需求     | 是   | 项目描述、用户澄清           |
| 用户需求     | 是   | 用户故事、功能描述           |
| 解决方案需求 | 是   | 技术设计、架构分析           |
| 功能需求     | 是   | 任务详情、验收标准           |
| 非功能需求   | 是   | 性能要求、部署环境           |
| 外部接口需求 | 是   | AI服务集成、前端UI           |
| 过渡需求     | 是   | 移除用户认证、数据模型调整   |

## 3. 功能需求

### FR-001: 小说作品管理

- **描述**: 系统必须提供小说作品的创建、读取、更新、删除（CRUD）功能，无需用户认证即可操作。
- **验收标准**:
  - 用户可以创建新小说作品，填写标题、简介、类型等基本信息
  - 用户可以查看所有小说作品列表
  - 用户可以编辑小说作品的基本信息
  - 用户可以删除小说作品及其关联的所有数据
- **优先级**: Must
- **类型映射**: 功能需求
- **来源**: 任务3、任务9

### FR-002: 多级架构管理

- **描述**: 系统必须支持三级架构管理（全本架构/卷架构/章架构），每级架构可定义情节大纲、人物设定、世界观、情感基调等要素。
- **验收标准**:
  - 用户可以创建全本架构，定义整部作品的核心设定
  - 用户可以在全本架构下创建多个卷架构
  - 用户可以在卷架构下创建多个章架构
  - 每级架构支持填写情节大纲、人物设定、世界观、情感基调
  - 架构修改只影响后续未生成的章节，不影响已生成章节
- **优先级**: Must
- **类型映射**: 功能需求
- **来源**: 任务2、任务3、任务10

### FR-003: AI章节生成

- **描述**: 系统必须支持基于架构信息自动生成章节内容，支持手动触发和定时触发两种方式，支持自定义提示词模板。
- **验收标准**:
  - 用户可以手动点击"立即生成"按钮触发章节生成
  - 用户可以设置定时任务，在指定时间自动生成章节
  - 生成时自动读取对应的架构信息（情节、人物、世界观等）
  - 生成失败时自动重试3次，每次间隔1分钟
  - 支持智谱AI和DeepSeek两个AI模型并可切换
  - 用户可以创建、编辑、选择自定义提示词模板
  - 系统提供默认提示词模板
- **优先级**: Must
- **类型映射**: 功能需求
- **来源**: 任务4、任务7、任务12

### FR-004: 自动一致性审核

- **描述**: 系统必须在章节生成后自动触发一致性审核Agent，基于AI和整体故事架构比对生成内容与架构的一致性，并生成审核报告。
- **验收标准**:
  - 章节生成完成后自动触发审核Agent
  - 审核基于AI分析和整体故事架构进行一致性检查
  - 审核报告包含一致性评分和具体偏差点
  - 审核报告一次性展示给前端，不保存到数据库
  - 审核不通过时，用户可手动点击重新生成
  - 定时任务生成章节后，审核不通过可自动重新生成
- **优先级**: Must
- **类型映射**: 功能需求
- **来源**: 任务8、任务13

### FR-005: 章节版本历史管理

- **描述**: 系统必须为每个章节保存版本历史，支持查看和恢复历史版本。
- **验收标准**:
  - 每次保存章节时自动创建新版本
  - 用户可以查看章节的所有历史版本
  - 用户可以恢复到任意历史版本
  - 版本历史永久保留
- **优先级**: Should
- **类型映射**: 功能需求
- **来源**: 用户澄清

### FR-006: Markdown编辑器

- **描述**: 系统必须提供集成的轻量级Markdown编辑器，支持查看、编辑AI生成的章节内容。
- **验收标准**:
  - 编辑器支持Markdown语法高亮
  - 编辑器提供实时预览功能
  - 编辑器提供基本格式工具栏
  - 编辑器轻量级，加载快速
  - 编辑后的内容可以保存
- **优先级**: Must
- **类型映射**: 功能需求
- **来源**: 任务11

### FR-007: Markdown导出

- **描述**: 系统必须支持将小说作品导出为标准Markdown格式。
- **验收标准**:
  - 用户可以导出整部小说或指定卷
  - 导出文件包含小说元数据、多级大纲标题、所有章节内容
  - 导出格式为标准Markdown，不包含图片
  - 支持选择导出范围（单卷/全本）
- **优先级**: Should
- **类型映射**: 功能需求
- **来源**: 任务14

### FR-008: 提示词模板管理

- **描述**: 系统必须提供提示词模板管理功能，支持用户创建、编辑、选择自定义提示词模板。
- **验收标准**:
  - 系统提供默认提示词模板
  - 用户可以创建新的提示词模板
  - 用户可以编辑和删除自定义模板
  - 用户可以在生成章节时选择使用的模板
  - 用户可以设置默认模板
- **优先级**: Should
- **类型映射**: 功能需求
- **来源**: 用户澄清

### FR-009: 系统配置管理

- **描述**: 系统必须提供配置管理功能，支持AI模型选择、API密钥配置等。
- **验收标准**:
  - 用户可以配置智谱AI和DeepSeek的API密钥
  - 用户可以选择当前使用的AI模型（智谱AI或DeepSeek）
  - 用户可以配置审核严格度（严格/宽松模式）
  - 配置修改后立即生效
- **优先级**: Should
- **类型映射**: 功能需求
- **来源**: 任务12

### FR-010: 定时任务管理

- **描述**: 系统必须支持定时生成章节的任务管理，包括创建、查看、删除定时任务。
- **验收标准**:
  - 用户可以创建定时任务，指定生成时间和目标章节
  - 用户可以查看所有定时任务及其状态
  - 用户可以删除未执行的定时任务
  - 定时任务持久化，系统重启后自动恢复
- **优先级**: Should
- **类型映射**: 功能需求
- **来源**: 任务4、任务12

### FR-011: 数据持久化

- **描述**: 系统必须永久保存所有小说作品、架构信息、章节内容、版本历史等数据。
- **验收标准**:
  - 所有数据永久保存在本地数据库
  - 系统重启后数据不丢失
  - 支持数据备份和恢复（可选）
- **优先级**: Must
- **类型映射**: 功能需求
- **来源**: 用户澄清

## 4. 非功能需求

### NFR-001: 部署环境

- **描述**: 系统必须支持本地部署，无需云端服务器。
- **度量**: 通过Docker Compose一键启动完整服务。
- **优先级**: Must
- **来源**: 用户澄清

### NFR-002: 用户认证

- **描述**: 系统无需用户认证，所有功能开放访问。
- **度量**: 系统启动后直接进入主界面，无需登录。
- **优先级**: Must
- **来源**: 用户澄清

### NFR-003: 数据保留

- **描述**: 所有数据必须永久保留，无自动清理机制。
- **度量**: 数据库无TTL设置，无自动删除策略。
- **优先级**: Must
- **来源**: 用户澄清

### NFR-004: 失败重试

- **描述**: AI生成失败时必须自动重试。
- **度量**: 失败后重试3次，每次间隔1分钟。
- **优先级**: Must
- **来源**: 用户澄清

### NFR-005: 性能要求

- **描述**: 系统无特殊性能要求，单用户本地使用。
- **度量**: 无并发要求，无响应时间限制。
- **优先级**: Could
- **来源**: 用户澄清

### NFR-006: 数据容量

- **描述**: 系统无章节数量上限。
- **度量**: 数据库支持存储无限数量的章节。
- **优先级**: Could
- **来源**: 用户澄清

## 5. 外部接口需求

### IF-001: AI服务API

- **类型**: API集成
- **端点**: 智谱AI API、DeepSeek API
- **请求/响应**:
  - 输入: 架构信息（情节、人物、世界观、情感基调）
  - 输出: 生成的章节文本（Markdown格式）
- **错误处理**:
  - API调用失败: 自动重试3次，间隔1分钟
  - 限流: 等待后重试
  - 配额不足: 提示用户检查API密钥
- **模型切换**: 支持在智谱AI和DeepSeek之间切换
- **来源**: 任务7

### IF-002: 前端UI

- **类型**: Web界面
- **入口**: http://localhost:端口
- **设计风格**: 简洁现代风格，使用React + Tailwind CSS实现
- **主要页面**:
  - 作品列表页: 展示所有小说作品
  - 作品详情页: 管理架构和章节
  - 架构编辑页: 编辑多级架构
  - 章节编辑页: Markdown编辑器
  - 配置页: AI模型配置
- **交互**: 响应式设计，支持主流浏览器
- **来源**: 任务5、任务9、任务10、任务11

### IF-003: 一致性审核Agent接口

- **类型**: 内部服务接口
- **输入**: 章节文本、架构数据
- **输出**: 审核报告（JSON格式）
  ```json
  {
    "score": 85,
    "issues": [
      {
        "type": "character_inconsistency",
        "description": "人物性格与设定不符",
        "location": "第3段",
        "suggestion": "调整人物对话语气"
      }
    ]
  }
  ```
- **来源**: 任务8

## 6. 过渡需求

### TR-001: 移除用户认证系统

- **描述**: 从现有系统中移除所有用户认证相关代码和配置。
- **策略**:
  1. 移除数据库中的用户表和权限表
  2. 移除后端认证中间件和JWT配置
  3. 移除前端登录、注册页面
  4. 移除前端路由守卫
  5. 调整数据模型，移除user_id字段
- **回滚计划**: 保留用户认证代码的Git历史记录，需要时可恢复
- **来源**: 任务17、任务18、任务19

### TR-002: 数据模型调整

- **描述**: 调整数据模型以适应无用户认证的环境。
- **策略**:
  1. 移除Novel表的user_id字段
  2. 移除Chapter表的user_id字段
  3. 更新数据库迁移脚本
  4. 更新API，移除用户上下文依赖
- **回滚计划**: 保留迁移脚本的回滚版本
- **来源**: 任务17

## 7. 约束与假设

### 7.1 技术约束

- 后端框架: Node.js + Express
- 前端框架: React + Tailwind CSS
- 数据库: SQLite
- 部署方式: Docker + Docker Compose
- AI服务: 智谱AI、DeepSeek
- Markdown编辑器: 轻量级编辑器
- 定时任务: node-schedule

### 7.2 业务约束

- 目标用户: 新手作者
- 使用场景: 本地单用户使用
- 无商业化需求
- 无合规性要求

### 7.3 假设

- 用户具备基本的计算机操作能力
- 用户已获取AI服务的API密钥
- 本地环境有足够的存储空间
- 网络连接稳定（调用AI API需要）
- 用户熟悉Markdown基本语法

## 8. 优先级与里程碑建议

| ID      | 需求             | 优先级 | 原因                     |
| ------- | ---------------- | ------ | ------------------------ |
| FR-001  | 小说作品管理     | Must   | 核心功能，其他功能基础   |
| FR-002  | 多级架构管理     | Must   | 核心功能，AI生成依赖     |
| FR-003  | AI章节生成       | Must   | 核心功能，主要价值点     |
| FR-004  | 自动一致性审核   | Must   | 核心功能，质量保证       |
| FR-011  | 数据持久化       | Must   | 基础设施，数据安全       |
| FR-006  | Markdown编辑器   | Must   | 核心功能，用户交互入口   |
| FR-005  | 章节版本历史管理 | Should | 增强功能，提升用户体验   |
| FR-007  | Markdown导出     | Should | 增强功能，数据导出       |
| FR-008  | 提示词模板管理   | Should | 增强功能，提升生成质量   |
| FR-009  | 系统配置管理     | Should | 增强功能，灵活性         |
| FR-010  | 定时任务管理     | Should | 增强功能，自动化         |
| NFR-001 | 部署环境         | Must   | 基础设施，运行环境       |
| NFR-002 | 用户认证         | Must   | 架构决策，简化系统       |
| NFR-003 | 数据保留         | Must   | 业务需求，数据安全       |
| NFR-004 | 失败重试         | Must   | 可靠性保证               |

### 建议里程碑

**里程碑1: 核心功能开发（预计4周）**
- 项目初始化与基础架构搭建（Node.js + Express）
- SQLite数据库设计与核心模型定义
- 小说作品管理API
- 多级架构管理API
- 前端基础框架搭建（React + Tailwind CSS）
- 移除用户认证系统

**里程碑2: AI生成与审核（预计3周）**
- 集成AI内容生成服务（智谱AI、DeepSeek）
- 提示词模板管理功能
- 章节生成与管理API
- 一致性审核Agent核心逻辑（基于AI和整体故事架构）
- 前端架构编辑界面
- 前端章节生成界面

**里程碑3: 增强功能与优化（预计2周）**
- 章节版本历史管理
- 轻量级Markdown编辑器集成
- Markdown导出功能
- 系统配置管理
- 提示词模板管理界面
- 定时任务服务（node-schedule）

**里程碑4: 部署与文档（预计1周）**
- Docker部署配置
- 用户使用手册
- API文档
- 系统架构说明

## 9. 变更/设计提案（RFC）

### 9.1 现状分析

- **当前架构**: 原需求包含用户认证系统，数据模型关联用户ID
- **当前问题**:
  - 用户认证增加了系统复杂度
  - 本地单用户场景下认证功能冗余
  - 数据模型包含不必要的用户关联字段
- **相关代码路径**:
  - 后端: 认证中间件、用户模型、权限检查
  - 前端: 登录页面、路由守卫、用户状态管理
  - 数据库: 用户表、权限表、外键约束

### 9.2 目标状态

- **提议架构**: 无用户认证的单用户本地系统
- **关键变更**:
  1. 移除所有用户认证相关代码和配置
  2. 简化数据模型，移除user_id字段
  3. 简化API，移除认证中间件
  4. 简化前端，移除登录流程和权限检查
  5. 实现多AI模型切换机制
  6. 实现自动一致性审核流程
  7. 实现章节版本历史管理

### 9.3 详细设计

#### 9.3.1 模块/组件设计

**后端模块**:
- `novel-service`: 小说作品管理服务
- `architecture-service`: 多级架构管理服务
- `chapter-service`: 章节生成与管理服务
- `ai-service`: AI内容生成服务（支持智谱AI和DeepSeek）
- `review-agent`: 一致性审核Agent（基于AI和整体故事架构）
- `schedule-service`: 定时任务服务（使用node-schedule）
- `config-service`: 系统配置服务
- `template-service`: 提示词模板管理服务

**前端组件**:
- `NovelList`: 作品列表组件
- `NovelEditor`: 作品编辑组件
- `ArchitectureTree`: 架构树形组件
- `ArchitectureEditor`: 架构编辑组件
- `ChapterEditor`: 章节编辑组件（集成轻量级Markdown编辑器）
- `ReviewReport`: 审核报告展示组件
- `ConfigPanel`: 配置管理组件
- `TemplateManager`: 提示词模板管理组件

#### 9.3.2 数据模型

**核心实体**:

```sql
-- 小说作品表
CREATE TABLE novels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  genre TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 架构层级表
CREATE TABLE architectures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  novel_id INTEGER NOT NULL,
  level TEXT NOT NULL, -- 'full', 'volume', 'chapter'
  parent_id INTEGER,
  title TEXT NOT NULL,
  plot_outline TEXT,
  characters TEXT, -- JSON格式存储人物设定
  world_setting TEXT, -- JSON格式存储世界观
  emotional_tone TEXT,
  metadata TEXT, -- JSON格式存储其他元数据
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES architectures(id) ON DELETE CASCADE
);

-- 章节表
CREATE TABLE chapters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  novel_id INTEGER NOT NULL,
  architecture_id INTEGER,
  chapter_number INTEGER NOT NULL,
  title TEXT,
  content TEXT,
  status TEXT DEFAULT 'draft', -- 'draft', 'generated', 'reviewed', 'published'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
  FOREIGN KEY (architecture_id) REFERENCES architectures(id) ON DELETE SET NULL
);

-- 章节版本历史表
CREATE TABLE chapter_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chapter_id INTEGER NOT NULL,
  version_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE CASCADE,
  UNIQUE(chapter_id, version_number)
);

-- 定时任务表
CREATE TABLE scheduled_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  novel_id INTEGER NOT NULL,
  chapter_id INTEGER,
  task_type TEXT NOT NULL, -- 'generate', 'review'
  scheduled_time DATETIME NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'running', 'completed', 'failed'
  retry_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (novel_id) REFERENCES novels(id) ON DELETE CASCADE,
  FOREIGN KEY (chapter_id) REFERENCES chapters(id) ON DELETE SET NULL
);

-- 系统配置表
CREATE TABLE system_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  config_key TEXT UNIQUE NOT NULL,
  config_value TEXT NOT NULL, -- JSON格式存储配置值
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 提示词模板表
CREATE TABLE prompt_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  template TEXT NOT NULL,
  description TEXT,
  is_default INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 9.3.3 API设计

**小说作品API**:
- `POST /api/novels` - 创建小说
- `GET /api/novels` - 获取小说列表
- `GET /api/novels/:id` - 获取小说详情
- `PUT /api/novels/:id` - 更新小说
- `DELETE /api/novels/:id` - 删除小说

**架构管理API**:
- `POST /api/novels/:id/architectures` - 创建架构
- `GET /api/novels/:id/architectures` - 获取架构树
- `GET /api/architectures/:id` - 获取架构详情
- `PUT /api/architectures/:id` - 更新架构
- `DELETE /api/architectures/:id` - 删除架构

**章节管理API**:
- `POST /api/novels/:id/chapters` - 创建章节
- `GET /api/novels/:id/chapters` - 获取章节列表
- `GET /api/chapters/:id` - 获取章节详情
- `PUT /api/chapters/:id` - 更新章节
- `DELETE /api/chapters/:id` - 删除章节
- `POST /api/chapters/:id/generate` - 手动生成章节
- `GET /api/chapters/:id/versions` - 获取版本历史
- `POST /api/chapters/:id/restore/:version` - 恢复历史版本

**定时任务API**:
- `POST /api/schedules` - 创建定时任务
- `GET /api/schedules` - 获取定时任务列表
- `DELETE /api/schedules/:id` - 删除定时任务

**系统配置API**:
- `GET /api/configs` - 获取所有配置
- `PUT /api/configs/:key` - 更新配置

**提示词模板API**:
- `GET /api/templates` - 获取所有模板
- `POST /api/templates` - 创建模板
- `PUT /api/templates/:id` - 更新模板
- `DELETE /api/templates/:id` - 删除模板
- `POST /api/templates/:id/set-default` - 设置为默认模板

**导出API**:
- `GET /api/novels/:id/export?scope=full|volume&volumeId=?` - 导出Markdown

#### 9.3.4 主要流程

**章节生成流程**:
```
用户触发生成
  ↓
读取架构信息（情节、人物、世界观等）
  ↓
选择或使用默认提示词模板
  ↓
构建AI提示词
  ↓
调用AI服务API（智谱AI或DeepSeek）
  ↓
生成成功？
  ├─ 是 → 保存章节内容 → 触发审核Agent
  └─ 否 → 重试计数 < 3？
           ├─ 是 → 等待1分钟 → 重新调用AI服务
           └─ 否 → 标记失败，通知用户
```

**一致性审核流程**:
```
章节生成完成
  ↓
审核Agent接收章节文本和架构数据
  ↓
基于AI和整体故事架构执行一致性检查
  ├─ 情节一致性检查（AI分析）
  ├─ 人物性格一致性检查（AI分析）
  ├─ 世界观一致性检查（AI分析）
  └─ 情感基调一致性检查（AI分析）
  ↓
生成审核报告（评分+偏差列表）
  ↓
返回给前端展示（不保存）
  ↓
用户决定：
  ├─ 接受 → 保存章节
  └─ 拒绝 → 手动重新生成 或 定时任务自动重新生成
```

### 9.4 考虑的替代方案

| 方案         | 优点                   | 缺点                   | 决策     |
| ------------ | ---------------------- | ---------------------- | -------- |
| 保留用户认证 | 支持多用户、数据隔离   | 增加复杂度、本地不需要 | 拒绝     |
| 单一AI模型   | 实现简单               | 灵活性差、依赖单一服务 | 拒绝     |
| 保存审核报告 | 可追溯审核历史         | 占用存储、用户不需要   | 拒绝     |
| 支持图片     | 功能更丰富             | 增加复杂度、用户不需要 | 拒绝     |
| 云端部署     | 可多设备访问、数据备份 | 需要服务器、隐私问题   | 拒绝     |

### 9.5 实施与迁移计划

#### 实施顺序

1. **阶段1: 基础架构（第1-2周）**
   - 项目初始化与基础架构搭建（Node.js + Express）
   - SQLite数据库设计与核心模型定义
   - 移除用户认证系统
   - 前端基础框架搭建（React + Tailwind CSS）

2. **阶段2: 核心功能（第3-5周）**
   - 小说作品管理API
   - 多级架构管理API
   - 集成AI内容生成服务（智谱AI、DeepSeek）
   - 提示词模板管理功能
   - 章节生成与管理API
   - 一致性审核Agent核心逻辑（基于AI和整体故事架构）

3. **阶段3: 前端开发（第6-7周）**
   - 小说作品列表与创建页
   - 多级架构编辑与管理界面
   - 章节生成与轻量级Markdown编辑界面
   - 一致性审核报告展示
   - 提示词模板管理界面

4. **阶段4: 增强功能（第8-9周）**
   - 章节版本历史管理
   - Markdown导出功能
   - 系统配置管理
   - 定时任务服务（node-schedule）

5. **阶段5: 部署与文档（第10周）**
   - Docker部署配置
   - 用户使用手册
   - API文档
   - 系统架构说明

#### 风险缓解

- **风险1**: AI服务API不稳定
  - 缓解: 实现智谱AI和DeepSeek双模型切换，失败时自动切换备用模型
- **风险2**: 生成内容质量不佳
  - 缓解: 优化提示词模板，支持自定义模板，提供审核反馈循环
- **风险3**: 数据丢失
  - 缓解: SQLite数据库定期备份，版本历史管理
- **风险4**: 定时任务失败
  - 缓解: 使用node-schedule持久化任务，系统重启后自动恢复
- **风险5**: 提示词模板效果不佳
  - 缓解: 提供默认模板，支持用户自定义和迭代优化

#### 测试策略

- **单元测试**: 核心业务逻辑函数（架构树操作、提示词生成、一致性比对）
- **集成测试**: 主要API端点的完整请求-响应流程
- **端到端测试**: 从创建小说到导出的完整用户流程
- **手动测试**: AI生成质量评估、审核准确性验证

#### 回滚计划

- 保留Git历史记录，可随时回滚到任意版本
- 数据库迁移脚本包含回滚版本
- Docker镜像版本化管理

## 10. TBD列表

| ID     | 项目               | 缺失信息             | 决策结果                     | 状态   |
| ------ | ------------------ | -------------------- | ---------------------------- | ------ |
| TBD-1  | AI模型具体列表     | 需要支持哪些具体模型 | 智谱AI、DeepSeek             | 已确认 |
| TBD-2  | 提示词模板设计     | 如何构建有效提示词   | 支持自定义提示词模板         | 已确认 |
| TBD-3  | 审核评分算法       | 如何计算一致性评分   | 基于AI和整体故事架构         | 已确认 |
| TBD-4  | 前端UI设计细节     | 具体界面布局和交互   | 简洁现代风格                 | 已确认 |
| TBD-5  | 数据库选型         | PostgreSQL vs MongoDB | SQLite                       | 已确认 |
| TBD-6  | 前端框架选型       | React vs Vue         | React + Tailwind CSS         | 已确认 |
| TBD-7  | Markdown编辑器选型 | 具体使用哪个编辑器库 | 轻量级编辑器                 | 已确认 |
| TBD-8  | 定时任务实现方案   | node-schedule vs 其他 | node-schedule                | 已确认 |

---

**Spec包含10个部分，最后一部分为"TBD列表"，内容完整。所有TBD项已确认。**
