# 全书级章架构审阅与一键修补设计

日期：2026-05-07

## 目标

新增一套面向“全本书章架构”的审阅与修补能力。

用户只需要：

1. 发起全书级章架构审阅
2. 查看审阅结果
3. 点击一次“应用修补”

系统负责：

1. 读取全本架构、卷架构、全部章架构
2. 拉通判断全书情节完整性、流畅性、逻辑问题和缺失桥段
3. 输出结构化审阅意见
4. 基于审阅意见生成受影响章架构的修补方案
5. 一次性把修补方案落到架构数据中

本功能只处理架构，不处理正文。

## 范围

本期纳入：

1. 全书级章架构审阅
2. 结构化问题列表输出
3. 基于问题的章架构定向修补
4. 支持新增章架构
5. 一键应用修补结果

本期不纳入：

1. 删除章架构
2. 正文自动联动修订
3. 审阅结果的 diff 视图
4. 按卷局部应用
5. 多版本架构历史回滚

## 用户流程

### 审阅流程

1. 用户在架构工作台点击“架构审阅”
2. 后端读取：
   - 全本架构
   - 卷架构
   - 全部章架构
3. AI 输出全书级章架构审阅结果
4. 前端展示：
   - 总体评价
   - 完整性 / 流畅性 / bug 风险评分
   - 问题列表
   - 每个问题影响到的章节
   - 是否建议新增情节

### 修补流程

1. 用户在审阅结果中点击“生成修补方案”
2. 后端基于审阅结果和当前架构生成修补方案
3. 前端展示修补摘要：
   - 将更新哪些章架构
   - 将新增哪些章架构

### 应用流程

1. 用户点击“应用修补”
2. 后端直接更新受影响章架构
3. 如需新增章架构，则按指定位置插入
4. 自动重排后续章节编号
5. 返回应用结果摘要

## 功能定义

### 审阅维度

AI 审阅时必须检查以下问题：

1. 情节完整性
   - 是否存在明显缺桥
   - 是否存在重要转折无铺垫
   - 是否存在主线断裂

2. 情节流畅性
   - 卷与卷之间是否承接自然
   - 章与章之间是否推进顺滑
   - 是否存在节奏突兀跳变

3. 逻辑 bug
   - 人物动机跳变
   - 事件因果不成立
   - 世界规则前后冲突
   - 设定使用不一致

4. 情节增补需求
   - 是否缺少承上启下章节
   - 是否缺少关键伏笔
   - 是否缺少角色关系转折支撑

### 修补规则

修补阶段只允许两类改动：

1. 更新已有章架构
2. 新增章架构

不允许：

1. 删除已有章架构
2. 重写整本全部章架构
3. 修改未被问题影响的章节

## 数据结构

### 审阅结果 JSON

```json
{
  "summary": {
    "overallAssessment": "整体主线清晰，但中段承接不足，后段情感回收略快。",
    "integrityScore": 78,
    "flowScore": 74,
    "bugScore": 82
  },
  "issues": [
    {
      "id": "issue_1",
      "severity": "high",
      "category": "missing_transition",
      "title": "第三卷到第四卷的立场转变承接不足",
      "description": "主角从个人求生转向主动联结各方抗金的决心变化过快，缺少中间推动事件。",
      "affectedChapterIds": [21, 22, 23],
      "suggestion": "在第22章与第23章之间补一段亲历底层伤亡的事件，强化价值转折。",
      "needsNewChapter": true
    }
  ]
}
```

字段说明：

1. `summary`
   - `overallAssessment`：总体评价
   - `integrityScore`：完整性评分，0-100
   - `flowScore`：流畅性评分，0-100
   - `bugScore`：逻辑稳定性评分，0-100

2. `issues`
   - `severity`：`high | medium | low`
   - `category`：问题类别
   - `affectedChapterIds`：受影响章架构 id 列表
   - `needsNewChapter`：是否建议新增章

支持的问题类别：

1. `plot_hole`
2. `missing_transition`
3. `character_motivation`
4. `pacing`
5. `foreshadow_gap`
6. `world_rule_conflict`

### 修补结果 JSON

```json
{
  "updatedChapters": [
    {
      "chapterId": 22,
      "title": "旧巷残灯",
      "plotOutline": "补强主角见证流民伤亡后的心理变化，并埋入后续联结各方的动机。",
      "characters": ["林霄", "宋诗淇"],
      "worldSetting": "战后边城，流民聚集",
      "emotionalTone": "压抑、沉痛、转折前夜"
    }
  ],
  "newChapters": [
    {
      "insertAfterChapterId": 22,
      "title": "荒村夜哭",
      "plotOutline": "主角在转移途中亲历百姓惨状，第一次明确意识到仅靠自保已不足以活下去。",
      "characters": ["林霄", "俞凝"],
      "worldSetting": "边地荒村",
      "emotionalTone": "沉郁、刺痛、觉醒"
    }
  ]
}
```

字段说明：

1. `updatedChapters`
   - 仅包含需要修改的章架构
   - `chapterId` 对应现有 `Architecture.id`

2. `newChapters`
   - 表示新增章架构
   - `insertAfterChapterId` 表示插入到哪一章之后

## 后端设计

### 服务拆分

新增或扩展 `architectureReviewService`，拆成三类能力：

1. `reviewChapterArchitectures(novelId, signal?)`
   - 负责全书级章架构审阅
   - 返回“审阅结果 JSON”

2. `repairChapterArchitectures(novelId, reviewResult, userPrompt, signal?)`
   - 负责基于审阅结果生成修补方案
   - 返回“修补结果 JSON”

3. `applyChapterArchitectureRepair(novelId, repairResult)`
   - 负责把修补结果真正写入数据库
   - 支持更新已有章架构和新增章架构

### Prompt 设计

#### 审阅 Prompt

输入包括：

1. 小说标题和类型
2. 全本架构摘要
3. 卷架构列表
4. 按章节顺序排列的章架构列表

强调要求：

1. 站在“全书连续阅读”的角度审阅
2. 优先发现：
   - 缺桥
   - 因果断裂
   - 动机跳变
   - 节奏断层
3. 不要泛泛表扬
4. 必须输出结构化 JSON

#### 修补 Prompt

输入包括：

1. 当前全书架构数据
2. 审阅结果 JSON
3. 用户补充要求

强调要求：

1. 只修补受影响章节
2. 如必须新增情节，可新增章架构
3. 不要删除章
4. 不要重写无关章节
5. 必须输出结构化 JSON

### 路由设计

新增两个接口，保留现有接口兼容：

1. `POST /novels/:id/review-chapter-architectures`
   - 返回全书级章架构审阅结果

2. `POST /novels/:id/repair-chapter-architectures`
   - 入参：
     - `reviewResult`
     - `userPrompt`
   - 返回修补结果

3. `POST /novels/:id/apply-chapter-architecture-repair`
   - 入参：修补结果 JSON
   - 直接落库

现有 `review-architectures / rewrite-architectures / apply-rewrite` 暂时保留，不在本期移除。

### 应用落库规则

#### 更新已有章架构

对 `updatedChapters` 中每一项：

1. 读取对应 `Architecture`
2. 更新：
   - `title`
   - `plot_outline`
   - `characters`
   - `world_setting`
   - `emotional_tone`

#### 新增章架构

对 `newChapters` 中每一项：

1. 找到 `insertAfterChapterId` 对应章
2. 继承其所在卷 `parent_id`
3. 创建新的 `Architecture(level='chapter')`
4. 插入后调用现有章节重排逻辑，保证显示顺序正确

说明：

当前数据库里的章架构并没有显式的 `chapter_number` 字段，因此应用逻辑需要基于现有顺序重建该卷的章顺序。若当前实现依赖 `id` 顺序展示，则新增章在首版允许“追加创建后再整体替换本卷章架构顺序”来确保插入位置正确。

## 前端设计

### 入口

继续放在 `ArchitectureManager` 页面中。

新增或调整三个动作：

1. `全书级章架构审阅`
2. `生成修补方案`
3. `应用修补`

### 结果展示

审阅结果弹窗显示：

1. 总体评价
2. 三项评分
3. 问题列表
4. 每个问题的：
   - 严重级别
   - 分类
   - 涉及章节
   - 修改建议
   - 是否建议新增情节

修补结果弹窗显示：

1. 将更新多少章
2. 将新增多少章
3. 受影响章节标题列表

本期不做复杂 diff 视图。

## 错误处理

1. 如果小说没有全本架构
   - 审阅接口直接报错

2. 如果没有章架构
   - 审阅接口直接报错

3. 如果修补结果中的 `chapterId` 不存在
   - 应用接口直接报错并终止

4. 如果新增章的插入位置无效
   - 应用接口直接报错并终止

5. 如果 AI 输出 JSON 不合法
   - 继续使用现有 `parseJsonWithRepair` 修复链

## 测试策略

后端至少补以下测试：

1. 审阅 prompt 包含全本/卷/章顺序信息
2. 修补 prompt 只允许修改受影响章节
3. 应用修补时能正确更新已有章架构
4. 应用修补时能正确插入新章架构
5. 非法插入位置会报错

前端至少补以下验证：

1. 审阅结果能正常展示问题列表
2. 修补结果能展示更新/新增摘要
3. 点击“应用修补”后能刷新架构列表

## 兼容性与约束

1. 本功能只作用于架构层，不直接生成正文
2. 本功能不替代现有“单条架构编辑”
3. 本功能首版默认一次全量应用，不支持部分勾选应用
4. 本功能首版不处理删除章架构，避免误伤

## 实现优先级

建议按以下顺序实现：

1. 后端全书级章架构审阅接口
2. 后端修补方案接口
3. 后端一键应用接口
4. 前端审阅结果展示
5. 前端修补结果展示与一键应用

## 成功标准

完成后，用户可以在不手动逐章修改的前提下：

1. 让系统拉通全书章架构找问题
2. 让系统生成受影响章节的修补方案
3. 一次点击把章架构修补结果直接落库

用户不需要手动挑章节，也不需要自己逐章复制修改建议。
