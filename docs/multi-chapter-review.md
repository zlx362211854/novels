# 多章跨章审阅功能实现文档

## 一、功能概述

用户在章节列表页勾选最多 30 章，触发一次跨章逻辑审阅。AI 基于各章**记忆卡**（非全文）分析跨章不一致，输出问题报告。用户确认要修复哪些问题后，手动触发逐章修订，修订结果以 **diff 视图**展示，用户逐章确认后写入。

---

## 二、整体流程

```
用户勾选章节（≤30章）
        ↓
POST /novels/:id/multi-chapter-review
        ↓
[Phase 1] 跨章审阅（SSE 进度）
  loadChapters → crossChapterReview → buildFixTasks
        ↓
前端展示问题报告（按章分组，可勾选）
        ↓
用户勾选要修复的问题 → 点击"生成修订稿"
        ↓
POST /multi-chapter-reviews/:reviewId/fix
        ↓
[Phase 2] 逐章修订（SSE 进度，串行）
  对每个受影响章节：loadFullChapter → generateFix → saveDraft
        ↓
前端展示 diff 视图（逐章）
        ↓
用户逐章 confirm / skip
        ↓
POST /multi-chapter-reviews/:reviewId/apply { chapterId, accept }
```

---

## 三、数据结构

### 3.1 后端类型定义

```typescript
// 跨章问题
interface CrossChapterIssue {
  id: string;                    // uuid，用于前端勾选
  type: 'timeline' | 'character_state' | 'world_rule' | 'knowledge' | 'item_state';
  severity: 'high' | 'medium' | 'low';
  description: string;           // 问题描述
  affectedChapterIds: number[];  // 涉及的 chapter_id
  evidence: {
    chapterId: number;
    chapterNumber: number;
    title: string;
    excerpt: string;             // 记忆卡中的证据片段
  }[];
  suggestion: string;            // 修改方向建议
}

// 审阅结果
interface CrossChapterReview {
  reviewId: string;              // uuid，供后续修订接口使用
  novelId: number;
  chapterIds: number[];
  issues: CrossChapterIssue[];
  createdAt: string;
}

// 单章修订草稿
interface ChapterRevisionDraft {
  chapterId: number;
  chapterNumber: number;
  title: string;
  originalContent: string;
  revisedContent: string;        // 修订后全文，前端做 diff 展示
  appliedIssueIds: string[];
  summary: string;               // 修改摘要
  status: 'pending' | 'accepted' | 'skipped';
}

// 修订任务结果
interface MultiChapterFixResult {
  reviewId: string;
  drafts: ChapterRevisionDraft[];
}
```

### 3.2 数据库（Sequelize 模型）

```sql
-- multi_chapter_reviews 表
CREATE TABLE multi_chapter_reviews (
  id          VARCHAR(36) PRIMARY KEY,  -- uuid
  novel_id    INTEGER NOT NULL,
  chapter_ids JSON NOT NULL,            -- number[]
  review_data JSON,                     -- CrossChapterReview（issues）
  fix_data    JSON,                     -- ChapterRevisionDraft[]
  status      VARCHAR(20) DEFAULT 'reviewed',
              -- reviewed | fixing | fixed
  created_at  DATETIME,
  updated_at  DATETIME
);
```

---

## 四、LangGraph 节点设计

### 4.1 Phase 1：跨章审阅图

```typescript
// State
const CrossChapterReviewState = Annotation.Root({
  novelId:        Annotation<number>,
  chapterIds:     Annotation<number[]>,
  taskId:         Annotation<string>,
  signal:         Annotation<AbortSignal | undefined>,

  // 加载结果（记忆卡，无全文）
  chapters:       Annotation<ChapterWithMemory[]>,

  // LLM 输出
  issues:         Annotation<CrossChapterIssue[]>,

  // 最终存储
  reviewId:       Annotation<string>,
});

// 节点
START
  → loadChaptersNode        // 加载记忆卡 + 章节元信息（不含全文）
  → crossChapterReviewNode  // 单次 LLM，分析所有记忆卡
  → saveReviewNode          // 写入 multi_chapter_reviews 表
  → finalizeNode
END
```

**步骤与进度标签：**
```typescript
const STEPS_REVIEW = ['加载章节', '跨章分析', '保存结果'];
```

#### loadChaptersNode

- 从 DB 读取 `chapterIds` 对应的章节（title, chapter_number, content 截断前200字）
- 读取每章的 `ChapterMemory`（memory_data）
- 过滤掉没有记忆卡的章节（并在结果中标记 `skippedChapters`）
- 超过 30 章抛出错误

#### crossChapterReviewNode

- 构造 prompt（见第五节 5.1）
- 调用 LLM（zhipu，temperature=0.2，maxTokens=8000）
- 解析 JSON 输出，生成 `CrossChapterIssue[]`
- 每个 issue 生成 uuid

#### saveReviewNode

- 生成 reviewId（uuid）
- 写入 `multi_chapter_reviews` 表
- 返回 reviewId

---

### 4.2 Phase 2：逐章修订图

```typescript
// State
const MultiChapterFixState = Annotation.Root({
  reviewId:     Annotation<string>,
  selectedIssueIds: Annotation<string[]>,
  taskId:       Annotation<string>,
  signal:       Annotation<AbortSignal | undefined>,

  // 从 review 加载
  review:       Annotation<CrossChapterReview>,
  fixTasks:     Annotation<ChapterFixTask[]>,   // 按章分组后的任务

  // 修订结果（串行追加）
  drafts:       Annotation<ChapterRevisionDraft[]>,
});

// 节点
START
  → loadReviewNode          // 读取 review 结果，过滤 selectedIssueIds
  → buildFixTasksNode       // 按章分组问题，确定修订顺序
  → generateFixesNode       // 串行：每章独立调 LLM
  → saveDraftsNode          // 写入 multi_chapter_reviews.fix_data
  → finalizeNode
END
```

**步骤与进度标签：**
```typescript
// 动态：每章一步
const STEPS_FIX = fixTasks.map(t => `修订第${t.chapterNumber}章`);
```

#### buildFixTasksNode

按 chapterId 分组所有被 selectedIssueIds 选中的 issue，按 chapter_number 升序排列（串行修订时从前往后，保证状态一致性）。

#### generateFixesNode（串行核心）

对每个 `ChapterFixTask`：
1. 从 DB 读取该章全文
2. 从 `evidence` 字段提取涉及该章的其他章证据片段（不加载其他章全文）
3. 构造 prompt（见第五节 5.2）
4. 调用 LLM
5. 解析修订后全文 + summary
6. 追加到 `drafts`，更新进度

---

## 五、LLM Prompt 设计

### 5.1 跨章审阅 Prompt

```
你是一位专业的长篇小说逻辑审校编辑。
以下是按章顺序排列的 N 章记忆卡，请找出跨章的逻辑矛盾（时间线、人物状态、世界规则、知识一致性、物品状态）。
只报告有记忆卡证据支撑的问题，不要推测。

===== 章节记忆卡 =====

# 第1章：[标题]
摘要：[memory.summary]
人物：[entities.characters]
地点：[entities.locations]
关键事实：
  - 主角 持有 神器（证据："..."）
  - 主角.状态 重伤（证据："..."）
状态变化：
  - 主角.健康：正常 → 重伤
开放线索：
  - 神器归属 已开启

# 第2章：[标题]
...

===== 审核要求 =====
请检查：时间线矛盾、人物状态矛盾、世界规则违反、知识/信息时序问题、物品状态矛盾。
每个问题必须标注来自哪几章的记忆卡证据。

返回 JSON：
{
  "issues": [
    {
      "type": "timeline|character_state|world_rule|knowledge|item_state",
      "severity": "high|medium|low",
      "description": "问题描述",
      "affectedChapterNumbers": [1, 3],
      "evidence": [
        { "chapterNumber": 1, "excerpt": "记忆卡中的证据" },
        { "chapterNumber": 3, "excerpt": "记忆卡中的证据" }
      ],
      "suggestion": "建议修改方向"
    }
  ]
}
```

### 5.2 单章修订 Prompt

```
你是一位专业的网络小说编辑，请修订第 X 章，修复以下跨章逻辑问题。
只修改必要内容，保留原有风格和字数范围（4500-5500字）。

===== 需要修复的问题 =====
[issue 1] 时间线冲突（高）
  第X章说"头七刚过"，但第Y章记忆卡显示该事件发生在7天之后。
  参考：第Y章片段："..." （证据）
  建议：将"头七刚过"改为与第Y章一致的时间描述

[issue 2] ...

===== 第 X 章全文 =====
[chapter.content]

===== 修订要求 =====
请输出修订后的完整正文（不要标题），以及修改摘要。

返回 JSON：
{
  "revisedContent": "修订后的完整正文...",
  "summary": "修改了第X段的时间描述，将'头七'改为'三日'以与第Y章保持一致",
  "appliedIssues": ["问题1的简述"]
}
```

---

## 六、后端路由

```typescript
// 发起跨章审阅（Phase 1）
POST /api/novels/:id/multi-chapter-review
Body: { chapterIds: number[] }   // max 30
Response: { reviewId: string }   // SSE 通过 aiStatus 推送进度

// 获取审阅结果
GET /api/multi-chapter-reviews/:reviewId
Response: CrossChapterReview

// 发起修订（Phase 2，手动触发）
POST /api/multi-chapter-reviews/:reviewId/fix
Body: { selectedIssueIds: string[] }
Response: 202 Accepted           // SSE 推送进度

// 获取修订草稿
GET /api/multi-chapter-reviews/:reviewId/drafts
Response: ChapterRevisionDraft[]

// 应用或跳过某章修订
POST /api/multi-chapter-reviews/:reviewId/apply
Body: { chapterId: number, accept: boolean }
Response: { chapter: Chapter }
```

---

## 七、前端页面设计

### 7.1 入口：章节列表页

- 在 `NovelDetail` 或 `ChapterManager` 页面章节列表中添加多选框
- 底部浮出操作栏：已选 N 章 | [跨章审阅] 按钮
- 超过 30 章时按钮 disabled，提示"最多选择30章"

### 7.2 审阅结果页（`MultiChapterReview.jsx`）

```
┌─────────────────────────────────────────────────────┐
│ 跨章审阅结果  共发现 5 个问题  [生成修订稿 (已选3)] │
├─────────────────────────────────────────────────────┤
│ ● 高  时间线冲突                         □ 选择修复 │
│   第5章 ↔ 第8章                                     │
│   第5章："头七刚过..."                               │
│   第8章："三日前去世..."                             │
│   建议：统一时间描述                                 │
├─────────────────────────────────────────────────────┤
│ ● 中  人物状态矛盾                       □ 选择修复 │
│   第3章 ↔ 第7章                                     │
│   ...                                               │
└─────────────────────────────────────────────────────┘
```

### 7.3 Diff 视图（`ChapterDiffView.jsx`）

- 使用 `diff-match-patch` 或 `react-diff-viewer` 展示原文 vs 修订稿
- 顶部显示：第 X 章 · 修改摘要
- 底部：[确认修订] [跳过此章]
- 进度指示：第 1/3 章

```
┌──────────────────┬──────────────────────────────────┐
│ 原文（第5章）    │ 修订稿                            │
├──────────────────┼──────────────────────────────────┤
│ 头七刚过，他走   │ 三日过后，他走进了那座庭院。      │
│ 进了那座庭院。   │                                  │
│                  │                                  │
│ [红色删除线]     │ [绿色新增]                       │
└──────────────────┴──────────────────────────────────┘
      [跳过此章]                    [确认修订]
```

---

## 八、SSE 进度步骤

### Phase 1 审阅
| step | label |
|------|-------|
| 0 | 加载章节记忆卡 |
| 1 | AI 跨章分析 |
| 2 | 保存审阅结果 |

### Phase 2 修订（动态生成）
| step | label |
|------|-------|
| 0 | 准备修订任务 |
| 1 | 修订第 X 章（chapter_number） |
| 2 | 修订第 Y 章 |
| ... | ... |
| N | 保存草稿 |

---

## 九、关键约束与边界处理

| 情况 | 处理方式 |
|------|----------|
| 章节无记忆卡 | 跳过该章，在结果中提示"以下章节因无记忆卡被跳过：..." |
| 章节数 > 30 | 请求阶段报错，前端禁用按钮 |
| 记忆卡 token 超限（极少） | 截断 facts 列表至前 15 条 |
| LLM 返回非法 JSON | 走 repair 流程（同现有 parseJsonWithRepair） |
| 修订后字数偏差过大 | 提示但不阻止，用户自行判断 |
| 用户中途关闭页面 | AbortController 取消 LLM 调用，草稿已生成的部分保留 |

---

## 十、文件结构规划

```
backend/src/
├── ai/graphs/
│   ├── crossChapterReviewGraph.ts    # Phase 1 图
│   └── multiChapterFixGraph.ts       # Phase 2 图
├── models/sequelize/
│   └── MultiChapterReview.ts         # 新增模型
├── services/
│   └── multiChapterReviewService.ts  # 业务逻辑层
└── routes/
    └── multiChapterReviews.ts        # 路由

frontend/src/
├── pages/
│   └── MultiChapterReview.jsx        # 审阅结果页
├── components/
│   └── ChapterDiffView.jsx           # Diff 视图组件
└── services/api.js                   # 新增 multiChapterReviewApi
```

---

## 十一、实现优先级

1. **后端 Phase 1**：`crossChapterReviewGraph` + 路由 + 模型（核心功能）
2. **前端审阅结果页**：问题列表 + 勾选 + 触发修订
3. **后端 Phase 2**：`multiChapterFixGraph` + apply 接口
4. **前端 Diff 视图**：`ChapterDiffView` + 逐章确认
5. **章节列表多选**：入口改造
