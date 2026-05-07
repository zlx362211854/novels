# 混合版 RAG 设计（Zhipu Embedding + 现有结构化记忆）

## 背景

当前项目已经具备一套面向长篇创作的一致性辅助能力：

- 章节生成依赖全书架构、卷架构、本章架构、上一章结尾和上一章记忆卡
- 章节审阅、修订、微调依赖 `reviewContextService` 从历史记忆卡中做规则召回
- 章节保存后会抽取 `ChapterMemory`，沉淀人物、地点、事实、状态变化、悬念等结构化信息

这套能力已经有明显的“检索增强”雏形，但仍存在两个关键缺口：

1. 新章节生成主要依赖上一章承接，缺少跨长距离历史检索
2. 历史证据更多停留在“记忆卡摘要”，缺少高相关原文片段作为事实锚点

因此，本次设计采用“混合版 RAG”方案：

- 保留现有 `ChapterMemory` 规则召回
- 引入 `Zhipu Embedding` 做章节片段和故事圣经条目的向量检索
- 在章节生成、审阅、修订、微调前统一组装检索上下文

目标不是构建一个通用知识库平台，而是为小说长篇创作提供更稳定的“一致性上下文包”。

## 目标

本次设计的目标：

- 在章节生成前召回与当前章节最相关的历史事实和原文证据
- 在章节审阅、修订、微调时复用同一套检索结果，减少事实遗漏
- 为后续“故事圣经 / 时间线 / 伏笔管理”打好底层检索能力
- 在不引入外部向量数据库的前提下，先以 SQLite + Node 内存相似度计算完成首版落地

本次设计不包含：

- 独立向量数据库接入
- 大规模召回排序学习
- 自动从全文生成完整故事圣经
- 前端完整的故事圣经编辑器

## 方案选型

### 方案 A：结构化记忆 + 向量片段混合召回

保留现有 `ChapterMemory` 规则召回能力，并额外增加：

- `ChapterChunk`：章节原文切片 + embedding
- `StoryBibleEntry`：故事圣经条目 + embedding

在生成或修订前，先根据当前章节构造查询文本，然后同时执行：

- 规则召回：基于 `ChapterMemory`
- 向量召回：基于 `ChapterChunk`
- 向量召回：基于 `StoryBibleEntry`

最终输出统一的 `retrievalContext`，供 prompt 组装使用。

### 为什么选这个方案

- 与现有 `reviewContextService` 最兼容
- 不推翻当前记忆卡体系，能复用已有资产
- 小说场景里“结构化事实”和“原文语境”同等重要，单一路径都不够
- SQLite 项目里先做 Node 端相似度计算，复杂度和收益比最合适

## 数据设计

### 1. `chapter_chunks`

用途：存储章节原文切片及其 embedding，用于召回高相关原文证据。

字段：

- `id`
- `novel_id`
- `chapter_id`
- `chapter_number`
- `chunk_index`
- `text`
- `labels`
- `embedding`
- `content_hash`
- `created_at`
- `updated_at`

说明：

- `labels` 存 JSON 字符串，记录从记忆卡中继承的角色、地点、物品等标签
- `embedding` 存 JSON 字符串，内容为 number 数组
- `content_hash` 用于避免章节未变时重复切片和重复 embedding

### 2. `story_bible_entries`

用途：存储故事圣经条目，作为高优先级硬约束检索源。

字段：

- `id`
- `novel_id`
- `type`
- `title`
- `content`
- `labels`
- `embedding`
- `priority`
- `created_at`
- `updated_at`

`type` 建议首版支持：

- `character_rule`
- `world_rule`
- `timeline`
- `foreshadow`
- `taboo`

说明：

- `priority` 用于 prompt 排序，高优先级条目优先进入上下文
- `labels` 同样存 JSON 字符串，便于后续规则辅助召回

## 检索架构

### 1. 查询输入

以当前章节为中心构造查询文本，来源包括：

- 当前章节标题
- 当前章节架构摘要
- 用户附加要求
- 当前章节记忆卡
- 上一章记忆卡

查询文本不直接暴露给用户，只作为 embedding 和规则召回的统一查询源。

### 2. 规则召回

继续使用现有 `reviewContextService` 的逻辑：

- 从当前章节记忆卡中提取角色、地点、物品、组织
- 提取事实、状态变化、关键事件、悬念
- 与历史章节记忆卡打分匹配

这部分保留，因为它对“事实型一致性”非常稳定。

### 3. 向量召回

新增两条向量召回链：

- 从 `chapter_chunks` 中召回最相关历史原文片段
- 从 `story_bible_entries` 中召回最相关故事圣经条目

首版用 cosine similarity 即可，直接在 Node 里算，不引入外部向量库。

### 4. 混合输出

统一输出 `retrievalContext`：

- `currentMemory`
- `previousChapterMemory`
- `relevantMemories`
- `sourceExcerpts`
- `retrievedChunks`
- `storyBibleEntries`
- `previousChapterContent`
- `architecture`
- `novel`

其中：

- `relevantMemories` 代表结构化历史事实
- `retrievedChunks` 代表原文级证据
- `storyBibleEntries` 代表高优先级硬规则

## 服务设计

### 1. `embeddingService`

职责：

- 调用 Zhipu Embedding API
- 支持单条和批量文本 embedding
- 屏蔽模型、接口路径、鉴权细节

接口建议：

- `embedText(text: string): Promise<number[]>`
- `embedTexts(texts: string[]): Promise<number[][]>`

首版采用 Zhipu 官方 embeddings 接口，模型默认 `embedding-3`。

### 2. `chapterChunkService`

职责：

- 按段落和长度阈值切分章节
- 为 chunk 生成 labels
- 为 chunk 生成 embedding
- 章节保存后增量更新 chunk

接口建议：

- `rebuildForChapter(chapterId: number, signal?: AbortSignal): Promise<void>`
- `findRelevantChunks(novelId: number, queryEmbedding: number[], options?: any): Promise<any[]>`

### 3. `storyBibleService`

职责：

- 创建、更新、删除故事圣经条目
- 重建条目 embedding
- 查询相关故事圣经条目

接口建议：

- `createEntry(data: any): Promise<any>`
- `updateEntry(id: number, data: any): Promise<any>`
- `deleteEntry(id: number): Promise<void>`
- `findRelevantEntries(novelId: number, queryEmbedding: number[], options?: any): Promise<any[]>`

### 4. `ragService`

职责：

- 构造统一查询文本
- 生成 query embedding
- 触发规则召回和向量召回
- 去重、截断、排序，输出统一 `retrievalContext`

接口建议：

- `buildRetrievalContext(chapterId: number, options?: any): Promise<any>`

## 流程接入

### 第一阶段

先接入 `chapterGenerationGraph`。

原因：

- 章节生成最依赖前置上下文
- 一致性收益最高
- 用户感知最明显

接入位置：

- 在 `generateContentNode` 中、`buildChapterPrompt()` 之前
- 先调用 `ragService.buildRetrievalContext()`
- 再把返回结果注入 prompt

### 第二阶段

接入：

- `chapterReviewGraph`
- `chapterRevisionGraph`
- `chapterTuneGraph`

原因：

- 这些图已经依赖 `reviewContextService`
- 改造成本较低
- 可以把规则召回和向量召回统一起来

## Prompt 设计

章节生成 prompt 新增四个上下文区块：

### 1. 故事圣经硬约束

内容来源：`storyBibleEntries`

要求模型：

- 优先遵守
- 不得与其冲突
- 不得擅自修改既定事实

### 2. 上一章承接

内容来源：

- 上一章末尾片段
- 上一章记忆卡

要求模型：

- 保持动作、空间、时间、角色状态连续

### 3. 历史相关记忆

内容来源：`relevantMemories`

要求模型：

- 仅作为一致性约束
- 不得提前写出后续章节事件

### 4. 历史原文证据

内容来源：`retrievedChunks`

要求模型：

- 用于确认措辞、状态和事实
- 不得机械复述
- 不得脱离当前章节架构生硬拼接

## 错误处理

### Embedding 失败

- 不中断主流程
- 回退到仅使用现有规则召回和上一章承接
- 在日志中记录失败原因

### Chunk 重建失败

- 不影响章节保存
- 保留旧 chunk
- 下次保存或手动重建时再尝试

### Story Bible 为空

- Prompt 中省略对应区块
- 不视为错误

## 测试策略

单元测试重点：

- 文本切片规则稳定
- cosine similarity 计算正确
- 混合召回结果去重和排序正确
- embedding 失败时能安全降级
- prompt 中各区块插入逻辑正确

集成测试重点：

- 章节保存后能重建 chunk
- 章节生成前能拿到 RAG 上下文
- 微调、修订、审阅链路兼容旧逻辑

## 分阶段实施计划

### Phase 1

- 新增模型：`ChapterChunk`、`StoryBibleEntry`
- 新增 `embeddingService`
- 新增 `chapterChunkService`
- 章节保存后自动重建 chunk

### Phase 2

- 新增 `ragService`
- 接入 `chapterGenerationGraph`
- 修改 `buildChapterPrompt()`，插入检索上下文

### Phase 3

- 接入 `chapterReviewGraph`
- 接入 `chapterRevisionGraph`
- 接入 `chapterTuneGraph`

### Phase 4

- 增加故事圣经基础 CRUD 接口
- 为前端接入故事圣经提供 API

## 风险与取舍

### 1. SQLite 中直接存 embedding

优点：

- 实现快
- 运维简单
- 适合当前单机项目

缺点：

- 数据量继续增长后，召回性能会下降

当前取舍：

- 首版接受，等章节量明显增大后再评估外部向量库

### 2. 记忆卡错误会污染 RAG

这是混合方案的已知风险。

缓解方式：

- 保留原文 chunk 作为第二证据源
- prompt 中区分“硬约束 / 历史事实 / 原文证据”
- 不让模型把所有召回内容都当成同等可信

### 3. 过量上下文导致 prompt 臃肿

缓解方式：

- 限制每类召回条数
- 先召回后摘要
- 对 chunk 做截断和去重

## 结论

本方案以最小必要复杂度，为当前小说创作系统补上“跨长距离检索”能力：

- 结构化记忆负责稳定事实
- 向量片段负责补充原文证据
- 故事圣经负责提供硬约束

它不是通用 RAG 平台，而是一套专门服务于长篇小说一致性的“创作上下文增强层”。
