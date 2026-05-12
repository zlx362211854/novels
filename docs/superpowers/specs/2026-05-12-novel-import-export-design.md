# 小说导出导入设计

## 1. 目标

为现有项目增加“单本小说导出 / 导入”能力，用于把本地创作数据迁移到其他环境，例如服务器上的 Docker 部署实例。

首版目标是：

- 支持将一部小说导出为单个 JSON 文件
- 支持从 JSON 文件导入为一部新的小说副本
- 保留小说创作所需的核心结构与历史数据
- 不依赖直接替换 SQLite 数据库文件

## 2. 本期范围

首版导出和导入的对象包括：

- `novels`
  - 标题
  - 简介
  - 题材
  - 发布配置
  - AI 配置
- `architectures`
  - 全本架构
  - 卷架构
  - 章架构
- `chapters`
  - 章节标题
  - 正文
  - 审阅结果
  - 发布结果
  - 状态
- `chapter_versions`
  - 历史版本内容
- `chapter_memories`
  - 章节记忆卡
- `story_bible_entries`
  - 故事圣经条目

## 3. 非目标

本期不包含以下内容：

- 导入或导出 `scheduled_tasks`
- 导入或导出 `sqlite-vec` 向量数据
- 覆盖已有小说
- 合并到已有小说
- 整库导入导出
- Markdown 导入
- 单元测试编写

说明：

- 用户已确认首版不导入定时任务
- 首版只做“导入为新小说副本”
- 向量数据在不同环境下可重建，首版不直接迁移

## 4. 用户体验

### 4.1 导出入口

在小说详情页增加一个新的导出动作：

- `导出 JSON`

点击后直接下载一个 JSON 文件。

现有 Markdown 导出保留，不替换。

### 4.2 导入入口

在小说列表页增加一个新的入口：

- `导入小说`

点击后弹出一个简洁对话框，支持：

- 选择本地 JSON 文件
- 开始导入
- 显示导入中状态
- 导入成功后跳转到新小说详情页

### 4.3 用户预期

导入成功后，用户应看到一部新的小说项目，内容与导出源一致，但数据库主键为全新生成。

为了避免和现有项目混淆，导入后的标题建议自动追加后缀，例如：

- `原书名（导入）`

如果同名已存在，可继续追加数字后缀，例如：

- `原书名（导入 2）`

## 5. 导出包格式

首版使用单文件 JSON，不引入 ZIP。

建议格式如下：

```json
{
  "version": 1,
  "exportedAt": "2026-05-12T12:00:00.000Z",
  "source": {
    "app": "NovelForge"
  },
  "novel": {},
  "architectures": [],
  "chapters": [],
  "chapterVersions": [],
  "chapterMemories": [],
  "storyBibleEntries": []
}
```

要求：

- 所有导出实体都保留原始 `id`，仅作为导入时建立映射的依据
- 包内字段命名尽量贴近当前接口输出，减少额外转换层
- `version` 必须保留，为后续格式升级留口子

## 6. 后端设计

### 6.1 新增服务

建议新增：

- `backend/src/services/novelTransferService.ts`

职责：

- 构建导出 bundle
- 校验导入 bundle
- 执行导入并重建关联

不要把这部分逻辑塞进现有 `exportService.ts`。

原因：

- 现有 `exportService.ts` 面向 Markdown 文本导出
- JSON 导出导入属于另一类职责
- 导入逻辑需要处理大量实体映射与事务

### 6.2 导出逻辑

`exportNovelBundle(novelId)` 建议按以下顺序读取数据：

1. `novel`
2. `architectures`
3. `chapters`
4. `chapterVersions`
5. `chapterMemories`
6. `storyBibleEntries`

排序要求：

- `architectures` 按 `id ASC`
- `chapters` 按 `chapter_number ASC, id ASC`
- `chapterVersions` 按 `chapter_id ASC, version_number ASC`
- `storyBibleEntries` 按 `id ASC`

导出时不做语义加工，不生成新字段，只做结构化打包。

### 6.3 导入逻辑

`importNovelBundle(bundle)` 必须在单个数据库事务内执行。

导入步骤建议如下：

1. 校验 bundle 基本结构
2. 创建新的 `novel`
3. 重建 `architectures`
4. 重建 `chapters`
5. 重建 `chapterVersions`
6. 重建 `chapterMemories`
7. 重建 `storyBibleEntries`
8. 提交事务

### 6.4 ID 映射策略

导入时不能复用原始主键，需要维护至少以下映射：

- `oldNovelId -> newNovelId`
- `oldArchitectureId -> newArchitectureId`
- `oldChapterId -> newChapterId`

核心关联恢复规则：

- `architectures.novel_id` 统一替换为新小说 ID
- `architectures.parent_id` 通过 `architectureIdMap` 重建
- `chapters.novel_id` 统一替换为新小说 ID
- `chapters.architecture_id` 通过 `architectureIdMap` 重建
- `chapter_versions.chapter_id` 通过 `chapterIdMap` 重建
- `chapter_memories.chapter_id` 通过 `chapterIdMap` 重建
- `story_bible_entries.novel_id` 统一替换为新小说 ID

### 6.5 向量数据处理

本期不导入以下数据：

- `story_bible_entry_vectors`
- `chapter_chunk_vectors`
- 任何 `sqlite-vec` 相关表

原因：

- 向量可由正文和故事圣经内容重新生成
- 不同环境下直接迁移底层向量数据收益低、风险高
- 首版目标是恢复小说内容，不是恢复检索性能

导入完成后不强制立即重建向量。后续可单独补“重建向量”能力。

### 6.6 错误处理

必须明确区分以下错误：

- JSON 解析失败
- bundle 结构非法
- bundle 版本不支持
- 导入事务失败

首版错误返回应包含清晰原因，例如：

- `导入文件不是合法 JSON`
- `导入文件缺少 novel 字段`
- `导入文件版本不受支持`

## 7. 路由设计

建议在现有小说路由中新增：

- `GET /api/novels/:id/export-json`
- `POST /api/novels/import-json`

### 7.1 导出接口

行为：

- 根据 `novelId` 生成 bundle
- 返回 `application/json`
- 响应头带下载文件名

建议文件名：

- `novel-<id>-export.json`

### 7.2 导入接口

首版建议直接接收 JSON body，而不是 multipart 文件上传。

原因：

- 前端可以读取用户选择的文件内容，再把 JSON body 发送给后端
- 能避免首版引入文件上传中间件
- 逻辑更简单

请求体建议为：

```json
{
  "bundle": { "...": "..." }
}
```

返回建议为：

```json
{
  "novelId": 12,
  "title": "原书名（导入）"
}
```

## 8. 前端设计

### 8.1 小说详情页

文件：

- `frontend/src/pages/NovelDetail.jsx`

新增一个与现有 Markdown 导出并列的按钮：

- `导出 JSON`

行为：

- 调用新的导出 API
- 下载 JSON 文件
- 成功后提示 `已导出 JSON 文件`

### 8.2 小说列表页

文件：

- `frontend/src/pages/NovelList.jsx`

在顶部操作区新增：

- `导入小说`

点击后打开一个轻量导入弹窗，包含：

- 文件选择控件
- 导入按钮
- 取消按钮
- 导入中 loading 状态

不需要复杂预览，不需要 diff 对比。

### 8.3 前端 API

文件：

- `frontend/src/services/api.js`

新增：

- `exportApi.exportNovelJson(id)`
- `novelApi.importJson(bundle)`

前端读取本地文件时，使用浏览器 `File.text()` 后 `JSON.parse()`，再提交给后端。

这样如果文件不是 JSON，前端就能先拦一层。

## 9. 数据兼容性

首版只保证当前数据模型兼容。

为了未来升级，bundle 中必须带 `version`。后续如果数据结构变化，可按 `version` 分支解析。

首版兼容策略：

- 仅支持 `version === 1`
- 其他版本直接拒绝导入

## 10. 安全与边界

首版不做复杂权限系统扩展，但需要注意：

- 导入文件仅作为数据源，不执行任何代码
- 后端只按白名单字段写入数据库
- 不信任 bundle 中的目标主键、时间戳和外键

建议：

- 导入时忽略原始 `created_at` / `updated_at`
- 统一使用当前环境新创建记录的时间戳

## 11. 兼容现有功能

该功能不应影响：

- 现有 Markdown 导出
- 小说详情页现有编辑功能
- 架构工作台
- 章节生成与审阅
- 故事圣经页面

导入完成后的新小说，应与手工创建的小说一样正常工作。

## 12. 实现建议

首版建议分两步落地：

1. 先完成后端导出导入服务与接口
2. 再补前端按钮和弹窗

这样即使前端尚未接完，也能先通过接口验证“本地导出 -> 服务器导入”主流程。

## 13. 成功标准

满足以下条件即可视为首版完成：

- 用户可从任意一部现有小说导出 JSON 文件
- 用户可在另一环境导入该 JSON 文件
- 导入后生成一部新的小说副本
- 全本/卷/章架构、章节正文、章节版本、章节记忆卡、故事圣经均可正常访问
- 不要求导入定时任务
- 不要求导入向量数据
