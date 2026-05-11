# 一键生成新小说全架构设计

## 1. 目标

为现有项目增加一个“根据提示词一键生成新小说全部架构”的自动化工作流。用户输入一个 prompt 后，系统自动生成并直接保存一部新小说所需的全部已有核心字段，并在章架构全部生成完成后，自动复用现有“审阅章架构”能力执行 3 轮“审阅 -> 修补 -> 应用修补”，最终把修正后的最佳章架构保存到数据库。

本期范围限定为：

- 自动生成小说基础信息与现有相关字段
- 自动生成故事圣经
- 自动生成全本 / 卷 / 章三级架构
- 只自动审阅“章架构”
- 自动执行 3 轮既有章架构审阅与修补
- 直接保存，无预览确认步骤
- 允许审阅修补过程中新增章节

## 2. 本期生成范围

系统需要尽量覆盖当前项目中与小说初始化有关的已有字段和实体，至少包括：

- `novel`
  - 标题
  - 简介
  - 类型
- 角色与故事核心信息
  - 男主
  - 女主
  - 主要配角列表
  - 人物关系
  - 故事脉络
  - 世界观与关键规则
- `story_bible_entries`
  - 用于后续正文生成和检索的故事圣经条目
- `architectures`
  - 全本架构
  - 卷架构
  - 章架构

其中，角色、人物关系、故事脉络、世界规则等信息，如果数据库没有对应独立字段，则需要拆分并落入以下承载位置：

- 小说摘要信息进入 `novel.title` / `novel.description` / `novel.genre`
- 结构化角色和设定进入 `architectures.characters` / `architectures.world_setting` / `architectures.metadata`
- 长期设定与可检索知识进入 `story_bible_entries`

## 3. 非目标

本期不包含以下内容：

- 自动生成正文
- 自动生成发布配置
- 新建一套新的“全架构审阅器”
- 审阅全本架构或卷架构
- 审阅失败后的人工确认分支
- 单元测试编写

说明：用户已明确本期不要求编写单元测试，因此实现计划中不包含测试开发任务，但仍需要保留最基本的手工联调与流程验证。

## 4. 用户体验

### 4.1 入口

前端在小说列表页新增“AI 创建小说”入口，进入独立页面或独立对话框工作流，而不是复用现有普通新建小说表单。

### 4.2 用户输入

首版最小输入为：

- 主提示词 `prompt`

建议同时提供少量可选约束，以提升结果稳定性，但不要求用户必须填写：

- 题材偏好
- 目标卷数
- 每卷预估章数
- 风格偏好
- 目标读者

### 4.3 系统行为

用户点击“一键生成”后：

1. 创建一个新的自动化生成任务
2. 后端开始完整 graph 流程
3. 前端展示阶段进度
4. 流程成功后直接落库
5. 跳转到该小说的详情页或架构管理页

失败时：

- 返回明确失败阶段
- 不应留下半成品小说数据

## 5. 总体流程

推荐新增总控 graph：`backend/src/ai/graphs/novelBootstrapGraph.ts`

完整流程如下：

1. 解析用户 prompt 和可选约束
2. 生成小说基础信息
3. 生成角色关系与故事脉络
4. 生成故事圣经草稿
5. 生成全本架构
6. 生成卷架构列表
7. 按卷生成章架构列表
8. 汇总全部章架构
9. 调用现有“审阅章架构”能力
10. 生成章架构修补方案
11. 应用章架构修补
12. 重复步骤 9-11，共 3 轮
13. 事务保存小说、架构、故事圣经
14. 返回保存结果

这里的关键约束是：

- 章架构审阅只允许修改或新增章架构
- 不允许在审阅回路中回写全本架构和卷架构
- 不允许删除章架构

## 6. Graph 设计

根据用户要求，凡是适合进入 `graphs` 编排层的能力，统一封装在 `backend/src/ai/graphs/` 下管理。service 层主要承担数据库读写、事务保存、数据转换，不再承担复杂 AI 编排。

### 6.1 新增 graph

建议新增以下 graph：

- `novelBootstrapGraph.ts`
  - 总控 graph
  - 串联整个初始化流程
- `novelMetadataBootstrapGraph.ts`
  - 负责生成标题、简介、题材、男女主、配角、人物关系、故事脉络等基础信息
- `storyBibleBootstrapGraph.ts`
  - 负责生成故事圣经条目集合
- `novelArchitectureBootstrapGraph.ts`
  - 负责生成全本架构、卷架构以及各卷章架构草稿
- `chapterArchitectureReviewLoopGraph.ts`
  - 负责自动执行 3 轮“审阅 -> 修补 -> 应用修补”

### 6.2 可复用现有能力

现有代码中可直接复用或轻改的能力包括：

- `backend/src/ai/graphs/architectureGraph.ts`
  - 单个全本/卷架构生成
  - 某卷下章架构批量生成
- `backend/src/services/architectureReviewService.ts`
  - 审阅章架构
  - 生成章架构修补方案
  - 应用章架构修补

本期建议把“章架构三轮审阅”的编排逻辑从路由或 service 的手动串联，收敛到新的 `chapterArchitectureReviewLoopGraph.ts`。  
如果现有 `architectureReviewService.ts` 内部还有适合 graph 化的审阅/修补流程，后续可进一步下沉，但本期以最小侵入复用为主。

### 6.3 Graph 间职责边界

`novelBootstrapGraph` 负责：

- 接收用户输入
- 调用子 graph
- 汇总草稿
- 驱动 3 轮章架构审阅
- 调用保存 service

`novelMetadataBootstrapGraph` 负责：

- 生成标题、简介、题材
- 生成男女主、配角列表
- 生成人物关系
- 生成故事主线与故事脉络

`storyBibleBootstrapGraph` 负责：

- 把关键设定拆解为故事圣经条目
- 生成适合后续 RAG 和正文生成复用的结构化内容

`novelArchitectureBootstrapGraph` 负责：

- 生成全本架构
- 生成卷架构
- 逐卷生成章架构
- 将所有章架构收敛为统一草稿结构

`chapterArchitectureReviewLoopGraph` 负责：

- 读取已生成的 full / volume / chapter 草稿
- 驱动审阅 3 轮
- 每轮基于当前章架构草稿调用：
  - 审阅
  - 修补方案生成
  - 修补应用
- 输出最终章架构

## 7. 草稿态与保存策略

本期必须采用“先生成完整 draft，后统一保存”的策略，不能边生成边入库。

原因：

- 用户要求直接保存，但不代表允许保存失败中间态
- 流程较长，涉及多次 LLM 调用和 3 轮章架构修补
- 如果中途失败，边生成边入库会留下脏数据

建议在内存态维护一个统一 `bootstrap draft`：

```ts
interface NovelBootstrapDraft {
  prompt: string;
  novel: {
    title: string;
    description: string;
    genre: string;
  };
  cast: {
    maleLead: any;
    femaleLead: any;
    supportingCharacters: any[];
    relationships: any[];
  };
  story: {
    premise: string;
    mainLine: string;
    arcs: string[];
    bibleSummary: string;
  };
  storyBibleEntries: Array<{
    type: string;
    title: string;
    content: string;
    priority: number;
    labels: string[];
  }>;
  fullArchitecture: any;
  volumeArchitectures: any[];
  chapterArchitectures: any[];
}
```

最终由专门的保存 service 把 draft 映射到数据库实体。

## 8. 数据落库映射

建议新增 `backend/src/services/novelBootstrapService.ts`，只负责“把已审核完成的 draft 保存到数据库”，不负责 LLM 编排。

### 8.1 小说表

创建 `novel` 记录：

- `title`
- `description`
- `genre`

### 8.2 全本架构

创建 `level=full` 架构，承载：

- 全书主线
- 情节纲要
- 主角色设定摘要
- 世界观摘要
- 情感基调
- 可扩展 metadata

建议把“男女主、配角、人物关系、故事脉络”中无法直接落在 `novel` 的结构化部分优先沉到：

- `full.characters`
- `full.world_setting`
- `full.metadata`

### 8.3 卷架构

为每卷创建 `level=volume` 架构，挂在 full 下或按现有模型继续挂在 novel 下的 `parent_id` 体系中。

### 8.4 章架构

为每卷创建 `level=chapter` 架构：

- 标题
- 情节概括
- 人物
- 世界设定
- 情感基调
- 必要时把批量章纲中的额外字段塞入 `metadata`

建议把现有 `chapterBatchGraph` 生成的以下执行型章纲字段保留下来：

- `chapter_goal`
- `plot_summary`
- `plot_beats`
- `required_characters`
- `allowed_optional_characters`
- `scene_locations`
- `conflict`
- `foreshadowing`
- `state_changes_expected`
- `ending_hook`
- `forbidden_content`

这些字段不应在保存时丢失，建议收纳进章架构 `metadata`。

### 8.5 故事圣经

把 draft 中的故事圣经条目逐条写入 `story_bible_entries`。  
条目类型可复用现有 `storyBibleService.ts` 的约定，例如：

- `character`
- `relationship`
- `world_rule`
- `plot_thread`
- `faction`
- `location`

## 9. 章架构审阅回路

本期只审“章架构”。

### 9.1 审阅输入

每轮审阅时输入应包括：

- 小说基础信息
- 全本架构
- 卷架构摘要
- 当前全部章架构

这与现有 `architectureReviewService.ts` 的 `buildChapterArchitectureReviewPrompt` 保持一致。

### 9.2 每轮动作

每轮固定执行：

1. 审阅当前全部章架构
2. 基于审阅结果生成章架构修补方案
3. 应用修补方案到当前章架构草稿

### 9.3 轮次约束

- 固定执行 3 轮
- 即使第 2 轮已明显改善，也继续跑满第 3 轮，以满足用户要求
- 每轮都允许新增章节
- 不允许删除章节
- 不允许修改 full / volume

### 9.4 新增章节规则

修补时允许返回：

- `updatedChapters`
- `newChapters`

新增章需要明确：

- 插入位置 `insertAfterChapterId`
- 标题
- 情节概括
- 人物
- 世界设定
- 情感基调

新增章在内存态应用后，下一轮审阅必须把它视为正式章架构一部分。

### 9.5 ID 策略

这是本期实现的关键点。

现有审阅修补逻辑依赖“章架构 ID”精确引用受影响章节，但本期正式数据库 ID 在保存前并不存在，因此不能继续直接依赖数据库自增 ID。

建议引入“草稿章架构临时 ID”机制：

- 在 draft 中，为每个章架构分配稳定的 `draftChapterId`
- 审阅 prompt 中对外展示的“章架构ID=”使用 `draftChapterId`
- 修补方案中的 `chapterId` / `insertAfterChapterId` 也引用 `draftChapterId`
- 直到最终保存时，再把这些 draft ID 映射为真实数据库 ID

如果不做这层 draft ID，现有审阅修补能力无法在“保存前”稳定运行。

## 10. 接口设计

建议新增独立 API，而不是复用普通创建小说接口。

候选路径：

- `POST /novels/bootstrap`

请求体示例：

```json
{
  "prompt": "生成一部女频古代权谋逆袭长篇小说，女主从没落世家起步，感情线慢热，强调朝堂斗争与家族复兴。",
  "constraints": {
    "genre": "古代言情",
    "volumeCount": 4,
    "chaptersPerVolume": 20,
    "tone": "成长、权谋、克制感情线"
  }
}
```

返回示例：

```json
{
  "novelId": 123,
  "title": "凤归长安",
  "status": "completed"
}
```

失败示例：

```json
{
  "error": "章架构第2轮修补失败",
  "stage": "chapter-review-round-2"
}
```

## 11. 前端页面设计

建议新增页面：

- `frontend/src/pages/NovelBootstrap.jsx`

页面职责：

- 输入 prompt
- 输入可选约束
- 发起 bootstrap 请求
- 监听 AI 状态流或轮询进度
- 成功后跳转到新小说详情页
- 失败时展示失败阶段和错误信息

建议在 `frontend/src/pages/NovelList.jsx` 增加入口按钮。

## 12. 失败处理与事务边界

### 12.1 生成阶段失败

如果任一 graph 失败：

- 整个流程终止
- 返回失败阶段
- 不创建小说数据

### 12.2 保存阶段失败

保存必须包在事务中：

- 创建 novel
- 创建 full architecture
- 创建 volume architectures
- 创建 chapter architectures
- 创建 story bible entries

任一步骤失败则整体回滚。

### 12.3 故事圣经向量写入失败

现有 `storyBibleService.ts` 已处理条目与向量索引的部分一致性问题。  
本期保存 service 应尽量复用现有 story bible 写入接口，避免自己重写向量一致性逻辑。

## 13. 与现有代码的关系

### 13.1 需要复用

- `backend/src/services/novelService.ts`
- `backend/src/services/architectureService.ts`
- `backend/src/services/storyBibleService.ts`
- `backend/src/services/architectureReviewService.ts`
- `backend/src/ai/graphs/architectureGraph.ts`

### 13.2 需要新增

- `backend/src/ai/graphs/novelBootstrapGraph.ts`
- `backend/src/ai/graphs/novelMetadataBootstrapGraph.ts`
- `backend/src/ai/graphs/storyBibleBootstrapGraph.ts`
- `backend/src/ai/graphs/novelArchitectureBootstrapGraph.ts`
- `backend/src/ai/graphs/chapterArchitectureReviewLoopGraph.ts`
- `backend/src/services/novelBootstrapService.ts`
- `frontend/src/pages/NovelBootstrap.jsx`

### 13.3 可能需要小改

- `backend/src/routes/novels.ts`
- `frontend/src/services/api.js`
- `frontend/src/pages/NovelList.jsx`
- `frontend/src/App.jsx`

## 14. 关键实现风险

### 14.1 审阅系统依赖真实架构 ID

这是最大风险。现有章架构审阅/修补流程默认基于数据库架构 ID 运行，而本期又要求“先完成 3 轮审阅再保存”。  
如果不引入 draft ID 机制，当前能力无法直接复用到保存前流程。

### 14.2 单次生成信息量过大

如果把“小说元数据 + 故事圣经 + 全本架构 + 卷架构 + 全部章架构”挤进一次大 prompt，结果极不稳定。  
因此必须拆成多个 graph，分阶段生成。

### 14.3 修补后章节数增长

允许新增章节后，章数量可能超出用户输入预期。  
本期建议允许增长，但可在约束里设置一个软上限，例如“总章节数不超过初始预算的 130%”。

### 14.4 无自动化测试兜底

由于用户明确不写单元测试，本期上线风险主要依赖手工联调。  
实现阶段必须至少做完整流程的端到端验证。

## 15. 后续扩展方向

本期虽然只审“章架构”，但设计上建议预留未来扩展点：

- 未来可增加 `scope=chapter | full_stack`
- 审阅问题模型可增加 `targetLevel`
- 修补模型未来可扩展到：
  - 修改 full
  - 修改 volume
  - 修改 chapter

本期不实现这些扩展，只在 graph 边界和草稿结构上避免把能力写死。

## 16. 实现建议结论

本期采用“独立 AI 初始化工作流”方案，而不是把逻辑塞进普通新建小说接口。

核心落点是：

- 用 `novelBootstrapGraph` 做总控
- 用多个子 graph 分阶段生成
- 用 `chapterArchitectureReviewLoopGraph` 统一封装 3 轮章架构审阅
- 用 `novelBootstrapService` 做事务保存
- 用 draft ID 机制解决“保存前审阅章架构”的 ID 问题

这是当前约束下最稳、后续也最好扩展的实现方式。
