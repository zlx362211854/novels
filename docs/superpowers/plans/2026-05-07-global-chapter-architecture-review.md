# 全书级章架构审阅与一键修补 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为架构工作台新增“全书级章架构审阅 -> 修补方案生成 -> 一键应用修补”闭环，只处理架构层，不改正文。

**Architecture:** 复用现有 `architectureReviewService` 与 `ArchitectureManager` 的审阅/优化交互，但新增一套更聚焦“按章顺序拉通全书”的 review/repair/apply 三段式接口。后端负责结构化 JSON 审阅与修补、落库更新和新增章插入；前端负责结果展示与一键应用。

**Tech Stack:** Node.js, Express, Sequelize, React, axios, LangChain messages, DeepSeek provider, node:test, ts-node

---

## File Map

**Backend**

- Modify: `backend/src/services/architectureReviewService.ts`
  - 新增全书级章架构审阅、修补、应用三个 service 能力
- Modify: `backend/src/routes/novels.ts`
  - 新增 review/repair/apply 三个路由
- Modify: `backend/src/services/architectureService.ts`
  - 如现有工具不够，补充“按卷顺序插入新章架构”辅助函数
- Test: `backend/test/architecture-review-service.test.js`
  - 新增 service 层 prompt / apply 行为测试
- Test: `backend/test/novels-routes-architecture-review.test.js`
  - 新增路由级最小验证

**Frontend**

- Modify: `frontend/src/services/api.js`
  - 新增 chapter architecture review/repair/apply API
- Modify: `frontend/src/pages/ArchitectureManager.jsx`
  - 审阅入口切到新接口，展示问题列表、修补摘要和一键应用

## Task 1: 定义后端审阅/修补 JSON 结构与 prompt 组装

**Files:**
- Modify: `backend/src/services/architectureReviewService.ts`
- Test: `backend/test/architecture-review-service.test.js`

- [ ] **Step 1: 写失败测试，锁定审阅 prompt 必须包含全本/卷/按章顺序的信息**

```js
require('ts-node').register({
  project: require('node:path').join(__dirname, '..', 'tsconfig.json'),
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    moduleResolution: 'node',
    ignoreDeprecations: '6.0',
  },
});

const test = require('node:test');
const assert = require('node:assert/strict');

const service = require('../src/services/architectureReviewService');

test('buildChapterArchitectureReviewPrompt serializes full, volume and ordered chapter architectures', () => {
  const prompt = service.buildChapterArchitectureReviewPrompt(
    { title: '寒刃凌霄', genre: '武侠' },
    { id: 1, title: '全书', plot_outline: '总纲' },
    [{ id: 2, title: '第一卷', plot_outline: '卷纲' }],
    [
      { id: 10, title: '第一章', plot_outline: '章一', parent_id: 2 },
      { id: 11, title: '第二章', plot_outline: '章二', parent_id: 2 },
    ],
  );

  assert.match(prompt, /寒刃凌霄/);
  assert.match(prompt, /第一卷/);
  assert.match(prompt, /第1章/);
  assert.match(prompt, /第2章/);
  assert.match(prompt, /完整性/);
  assert.match(prompt, /missing_transition/);
});
```

- [ ] **Step 2: 跑测试确认当前失败**

Run: `node --test test/architecture-review-service.test.js`
Expected: FAIL with `buildChapterArchitectureReviewPrompt is not a function` or equivalent export error

- [ ] **Step 3: 在 service 中补齐审阅 prompt 组装函数和修补 prompt 组装函数**

```ts
function formatChapterArchitectureBlock(chapters: any[], volumes: Map<number, any>): string {
  return chapters.map((chapter, index) => {
    const volume = volumes.get(chapter.parent_id);
    return [
      `## 第${index + 1}章：${chapter.title}`,
      volume ? `所属卷：${volume.title}` : '所属卷：未指定',
      `情节概括：${chapter.plot_outline || ''}`,
      `人物：${chapter.characters || ''}`,
      `世界设定：${chapter.world_setting || ''}`,
      `情感基调：${chapter.emotional_tone || ''}`,
    ].join('\n');
  }).join('\n\n');
}

function buildChapterArchitectureReviewPrompt(novel: any, fullArch: any, volumes: any[], chapters: any[]): string {
  const volumeMap = new Map(volumes.map((volume: any) => [volume.id, volume]));
  return `你是一位长篇小说总策划。请按连续阅读全书的视角，审阅《${novel.title}》的章架构。

## 小说信息
类型：${novel.genre || '未指定'}

## 全本架构
标题：${fullArch?.title || '未提供'}
内容：${fullArch?.plot_outline || ''}

## 卷架构
${volumes.map((volume: any, index: number) => `### 第${index + 1}卷：${volume.title}\n${volume.plot_outline || ''}`).join('\n\n')}

## 章架构
${formatChapterArchitectureBlock(chapters, volumeMap)}

## 审阅要求
必须检查完整性、流畅性、逻辑 bug、是否需要新增情节。
问题 category 只能使用：plot_hole, missing_transition, character_motivation, pacing, foreshadow_gap, world_rule_conflict。
只输出 JSON。
${strictJsonOutputRules()}`;
}

function buildChapterArchitectureRepairPrompt(
  novel: any,
  fullArch: any,
  volumes: any[],
  chapters: any[],
  reviewResult: any,
  userPrompt: string,
): string {
  const volumeMap = new Map(volumes.map((volume: any) => [volume.id, volume]));
  return `你是一位长篇小说架构修补师。请根据审阅结果，只修补受影响章架构。

## 小说信息
标题：${novel.title}

## 全本架构
${fullArch?.plot_outline || ''}

## 卷架构
${volumes.map((volume: any, index: number) => `### 第${index + 1}卷：${volume.title}\n${volume.plot_outline || ''}`).join('\n\n')}

## 当前章架构
${formatChapterArchitectureBlock(chapters, volumeMap)}

## 审阅结果
${JSON.stringify(reviewResult, null, 2)}

## 用户补充要求
${userPrompt || '请只修改受影响章架构，必要时新增章架构，不要删除章节。'}

## 输出要求
输出 updatedChapters 和 newChapters 两个字段的 JSON。
${strictJsonOutputRules()}`;
}
```

- [ ] **Step 4: 跑测试确认 prompt 函数通过**

Run: `node --test test/architecture-review-service.test.js`
Expected: PASS on the prompt-shape test

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/architectureReviewService.ts backend/test/architecture-review-service.test.js
git commit -m "feat: add chapter architecture review prompts"
```

## Task 2: 实现全书级章架构审阅 service

**Files:**
- Modify: `backend/src/services/architectureReviewService.ts`
- Test: `backend/test/architecture-review-service.test.js`

- [ ] **Step 1: 写失败测试，锁定审阅 service 会读取 full/volume/chapter 并返回修复后的 JSON**

```js
test('reviewChapterArchitectures loads ordered architecture context and parses review json', async () => {
  const Module = require('node:module');
  const originalLoad = Module._load;

  const novel = { id: 2, title: '寒刃凌霄', genre: '武侠' };
  const architectures = [
    { id: 1, novel_id: 2, level: 'full', title: '全书', plot_outline: '总纲' },
    { id: 2, novel_id: 2, level: 'volume', title: '第一卷', plot_outline: '卷纲' },
    { id: 10, novel_id: 2, level: 'chapter', parent_id: 2, title: '第一章', plot_outline: '章一' },
  ];

  Module._load = function patched(request, parent, isMain) {
    if (request === '../models/sequelize') {
      return {
        Novel: { findByPk: async () => novel },
        Architecture: { findAll: async () => architectures },
      };
    }
    if (request === '../ai/llmFactory') {
      return { createLLM: async () => ({}) };
    }
    if (request === '../ai/streaming') {
      return { invokeWithStreaming: async () => '{"summary":{"overallAssessment":"ok","integrityScore":80,"flowScore":81,"bugScore":82},"issues":[]}' };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[require.resolve('../src/services/architectureReviewService')];
  const mockedService = require('../src/services/architectureReviewService');
  const result = await mockedService.reviewChapterArchitectures(2);

  Module._load = originalLoad;

  assert.equal(result.summary.overallAssessment, 'ok');
  assert.deepEqual(result.issues, []);
});
```

- [ ] **Step 2: 跑测试确认当前失败**

Run: `node --test test/architecture-review-service.test.js`
Expected: FAIL with `reviewChapterArchitectures is not a function`

- [ ] **Step 3: 实现 reviewChapterArchitectures**

```ts
async function loadArchitectureContext(novelId: number): Promise<any> {
  const novel = await Novel.findByPk(novelId);
  if (!novel) throw new Error('小说不存在');

  const architectures = await Architecture.findAll({
    where: { novel_id: novelId },
    order: [['id', 'ASC']],
  });

  const fullArch = architectures.find((arch: any) => arch.level === 'full');
  const volumes = architectures.filter((arch: any) => arch.level === 'volume');
  const chapters = architectures.filter((arch: any) => arch.level === 'chapter');

  if (!fullArch) throw new Error('缺少全本架构，无法发起全书级章架构审阅');
  if (chapters.length === 0) throw new Error('缺少章架构，无法发起全书级章架构审阅');

  return { novel, fullArch, volumes, chapters };
}

async function reviewChapterArchitectures(novelId: number, signal?: AbortSignal): Promise<any> {
  const { novel, fullArch, volumes, chapters } = await loadArchitectureContext(novelId);
  const prompt = buildChapterArchitectureReviewPrompt(novel, fullArch, volumes, chapters);
  const llm = await createLLM({ temperature: 0.4, provider: 'deepseek' });
  const content = await invokeWithStreaming(llm, [new HumanMessage(prompt)], { signal, resetStream: true });
  return parseJsonWithRepair(content, llm, buildRepairPrompt);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/architecture-review-service.test.js`
Expected: PASS on review service test

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/architectureReviewService.ts backend/test/architecture-review-service.test.js
git commit -m "feat: add global chapter architecture review service"
```

## Task 3: 实现修补方案生成 service

**Files:**
- Modify: `backend/src/services/architectureReviewService.ts`
- Test: `backend/test/architecture-review-service.test.js`

- [ ] **Step 1: 写失败测试，锁定 repair service 只返回 updatedChapters/newChapters**

```js
test('repairChapterArchitectures returns structured updated and new chapters only', async () => {
  const Module = require('node:module');
  const originalLoad = Module._load;

  Module._load = function patched(request, parent, isMain) {
    if (request === '../models/sequelize') {
      return {
        Novel: { findByPk: async () => ({ id: 2, title: '寒刃凌霄', genre: '武侠' }) },
        Architecture: {
          findAll: async () => [
            { id: 1, novel_id: 2, level: 'full', title: '全书', plot_outline: '总纲' },
            { id: 2, novel_id: 2, level: 'volume', title: '第一卷', plot_outline: '卷纲' },
            { id: 10, novel_id: 2, level: 'chapter', parent_id: 2, title: '第一章', plot_outline: '章一' },
          ],
        },
      };
    }
    if (request === '../ai/llmFactory') {
      return { createLLM: async () => ({}) };
    }
    if (request === '../ai/streaming') {
      return {
        invokeWithStreaming: async () => JSON.stringify({
          updatedChapters: [{ chapterId: 10, title: '第一章', plotOutline: '修补后', characters: ['林霄'], worldSetting: '临安', emotionalTone: '压抑' }],
          newChapters: [],
        }),
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[require.resolve('../src/services/architectureReviewService')];
  const mockedService = require('../src/services/architectureReviewService');
  const result = await mockedService.repairChapterArchitectures(2, { summary: {}, issues: [] }, '');
  Module._load = originalLoad;

  assert.equal(result.updatedChapters.length, 1);
  assert.deepEqual(result.newChapters, []);
});
```

- [ ] **Step 2: 跑测试确认当前失败**

Run: `node --test test/architecture-review-service.test.js`
Expected: FAIL with `repairChapterArchitectures is not a function`

- [ ] **Step 3: 实现 repairChapterArchitectures**

```ts
async function repairChapterArchitectures(
  novelId: number,
  reviewResult: any,
  userPrompt: string,
  signal?: AbortSignal,
): Promise<any> {
  const { novel, fullArch, volumes, chapters } = await loadArchitectureContext(novelId);
  const prompt = buildChapterArchitectureRepairPrompt(
    novel,
    fullArch,
    volumes,
    chapters,
    reviewResult,
    userPrompt,
  );
  const llm = await createLLM({ temperature: 0.4, provider: 'deepseek' });
  const content = await invokeWithStreaming(llm, [new HumanMessage(prompt)], { signal, resetStream: true });
  return parseJsonWithRepair(content, llm, buildRepairPrompt);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/architecture-review-service.test.js`
Expected: PASS on repair service test

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/architectureReviewService.ts backend/test/architecture-review-service.test.js
git commit -m "feat: add chapter architecture repair service"
```

## Task 4: 实现一键应用修补 service

**Files:**
- Modify: `backend/src/services/architectureReviewService.ts`
- Modify: `backend/src/services/architectureService.ts`
- Test: `backend/test/architecture-review-service.test.js`

- [ ] **Step 1: 写失败测试，锁定 apply 能更新已有章架构**

```js
test('applyChapterArchitectureRepair updates affected chapter architectures', async () => {
  const updates = [];
  const chapterRow = {
    id: 10,
    novel_id: 2,
    level: 'chapter',
    parent_id: 2,
    async update(payload) {
      updates.push(payload);
    },
  };

  const Module = require('node:module');
  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (request === '../models/sequelize') {
      return {
        Novel: {},
        Architecture: {
          findByPk: async (id) => {
            assert.equal(id, 10);
            return chapterRow;
          },
          findAll: async () => [],
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[require.resolve('../src/services/architectureReviewService')];
  const mockedService = require('../src/services/architectureReviewService');
  await mockedService.applyChapterArchitectureRepair(2, {
    updatedChapters: [
      {
        chapterId: 10,
        title: '第一章',
        plotOutline: '修补后',
        characters: ['林霄'],
        worldSetting: '临安',
        emotionalTone: '压抑',
      },
    ],
    newChapters: [],
  });

  Module._load = originalLoad;

  assert.equal(updates.length, 1);
  assert.equal(updates[0].title, '第一章');
});
```

- [ ] **Step 2: 写失败测试，锁定 apply 能插入新章并落到对应卷下**

```js
test('applyChapterArchitectureRepair inserts new chapter after target chapter parent volume', async () => {
  const createdPayloads = [];
  const afterChapter = {
    id: 10,
    novel_id: 2,
    level: 'chapter',
    parent_id: 2,
  };

  const Module = require('node:module');
  const originalLoad = Module._load;
  Module._load = function patched(request, parent, isMain) {
    if (request === '../models/sequelize') {
      return {
        Novel: {},
        Architecture: {
          findByPk: async (id) => {
            assert.equal(id, 10);
            return afterChapter;
          },
          create: async (payload) => {
            createdPayloads.push(payload);
            return payload;
          },
          findAll: async () => [],
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[require.resolve('../src/services/architectureReviewService')];
  const mockedService = require('../src/services/architectureReviewService');
  await mockedService.applyChapterArchitectureRepair(2, {
    updatedChapters: [],
    newChapters: [
      {
        insertAfterChapterId: 10,
        title: '新增桥段章',
        plotOutline: '补桥',
        characters: ['林霄'],
        worldSetting: '边地',
        emotionalTone: '压抑',
      },
    ],
  });

  Module._load = originalLoad;

  assert.equal(createdPayloads.length, 1);
  assert.equal(createdPayloads[0].parentId, 2);
});
```

- [ ] **Step 3: 跑测试确认当前失败**

Run: `node --test test/architecture-review-service.test.js`
Expected: FAIL with `applyChapterArchitectureRepair is not a function`

- [ ] **Step 4: 实现最小 apply 逻辑**

```ts
async function applyChapterArchitectureRepair(novelId: number, repairResult: any): Promise<any> {
  const updatedChapters = Array.isArray(repairResult.updatedChapters) ? repairResult.updatedChapters : [];
  const newChapters = Array.isArray(repairResult.newChapters) ? repairResult.newChapters : [];

  let updated = 0;
  let created = 0;

  for (const chapter of updatedChapters) {
    const row = await Architecture.findByPk(chapter.chapterId);
    if (!row || row.novel_id !== novelId || row.level !== 'chapter') {
      throw new Error(`章架构不存在或不属于当前小说: ${chapter.chapterId}`);
    }

    await row.update({
      title: chapter.title,
      plot_outline: chapter.plotOutline,
      characters: JSON.stringify(chapter.characters || []),
      world_setting: chapter.worldSetting,
      emotional_tone: chapter.emotionalTone,
    });
    updated += 1;
  }

  for (const chapter of newChapters) {
    const afterRow = await Architecture.findByPk(chapter.insertAfterChapterId);
    if (!afterRow || afterRow.novel_id !== novelId || afterRow.level !== 'chapter') {
      throw new Error(`新增章插入位置不存在或不属于当前小说: ${chapter.insertAfterChapterId}`);
    }

    await Architecture.create({
      novelId,
      level: 'chapter',
      parentId: afterRow.parent_id,
      title: chapter.title,
      plotOutline: chapter.plotOutline,
      characters: JSON.stringify(chapter.characters || []),
      worldSetting: chapter.worldSetting,
      emotionalTone: chapter.emotionalTone,
    });
    created += 1;
  }

  return { updated, created };
}
```

- [ ] **Step 5: 如果 `architectureService` 已有重排方法不足，补一个最小顺序重整入口**

```ts
async function reorderVolumeChapterArchitectures(novelId: number, volumeId: number): Promise<void> {
  const rows = await Architecture.findAll({
    where: { novel_id: novelId, level: 'chapter', parent_id: volumeId },
    order: [['id', 'ASC']],
  });
  await replaceChapterArchitectures(
    novelId,
    volumeId,
    rows.map((row: any) => ({
      title: row.title,
      plotOutline: row.plot_outline || '',
      characters: typeof row.characters === 'string' ? row.characters : JSON.stringify(row.characters || []),
      worldSetting: typeof row.world_setting === 'string' ? row.world_setting : JSON.stringify(row.world_setting || ''),
      emotionalTone: row.emotional_tone || '',
    })),
  );
}
```

- [ ] **Step 6: 在 apply 完成新增后调用卷级重排**

```ts
const touchedVolumeIds = new Set<number>();

for (const chapter of newChapters) {
  // create logic...
  touchedVolumeIds.add(afterRow.parent_id);
}

for (const volumeId of touchedVolumeIds) {
  await architectureService.reorderVolumeChapterArchitectures(novelId, volumeId);
}
```

- [ ] **Step 7: 跑测试确认通过**

Run: `node --test test/architecture-review-service.test.js`
Expected: PASS on update and insert tests

- [ ] **Step 8: Commit**

```bash
git add backend/src/services/architectureReviewService.ts backend/src/services/architectureService.ts backend/test/architecture-review-service.test.js
git commit -m "feat: apply chapter architecture repairs"
```

## Task 5: 暴露后端路由

**Files:**
- Modify: `backend/src/routes/novels.ts`
- Test: `backend/test/novels-routes-architecture-review.test.js`

- [ ] **Step 1: 写失败测试，锁定三个新路由的 service 调用**

```js
require('ts-node').register({
  project: require('node:path').join(__dirname, '..', 'tsconfig.json'),
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    moduleResolution: 'node',
    ignoreDeprecations: '6.0',
  },
});

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');
const Module = require('node:module');

test('novels routes expose chapter architecture review endpoints', async () => {
  const calls = [];
  const originalLoad = Module._load;

  Module._load = function patched(requestName, parent, isMain) {
    if (requestName === '../services/architectureReviewService') {
      return {
        reviewChapterArchitectures: async (novelId) => {
          calls.push(['review', novelId]);
          return { ok: true };
        },
        repairChapterArchitectures: async (novelId) => {
          calls.push(['repair', novelId]);
          return { updatedChapters: [], newChapters: [] };
        },
        applyChapterArchitectureRepair: async (novelId) => {
          calls.push(['apply', novelId]);
          return { updated: 1, created: 0 };
        },
      };
    }
    if (requestName.startsWith('../services/') || requestName === '../ai/graphs/chapterGenerationGraph' || requestName === '../models/sequelize') {
      return {};
    }
    return originalLoad.call(this, requestName, parent, isMain);
  };

  delete require.cache[require.resolve('../src/routes/novels')];
  const router = require('../src/routes/novels').default;
  Module._load = originalLoad;

  const app = express();
  app.use(express.json());
  app.use('/novels', router);

  await request(app).post('/novels/2/review-chapter-architectures').send({}).expect(200);
  await request(app).post('/novels/2/repair-chapter-architectures').send({ reviewResult: { issues: [] }, userPrompt: '' }).expect(200);
  await request(app).post('/novels/2/apply-chapter-architecture-repair').send({ updatedChapters: [], newChapters: [] }).expect(200);

  assert.deepEqual(calls, [['review', 2], ['repair', 2], ['apply', 2]]);
});
```

- [ ] **Step 2: 跑测试确认当前失败**

Run: `node --test test/novels-routes-architecture-review.test.js`
Expected: FAIL with 404s on missing endpoints

- [ ] **Step 3: 在 novels 路由中新增三个接口**

```ts
router.post('/:id/review-chapter-architectures', async (req: Request, res: Response) => {
  try {
    const result = await architectureReviewService.reviewChapterArchitectures(Number(req.params.id), req.signal);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/:id/repair-chapter-architectures', async (req: Request, res: Response) => {
  try {
    const { reviewResult, userPrompt } = req.body;
    const result = await architectureReviewService.repairChapterArchitectures(
      Number(req.params.id),
      reviewResult,
      userPrompt || '',
      req.signal,
    );
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/:id/apply-chapter-architecture-repair', async (req: Request, res: Response) => {
  try {
    const result = await architectureReviewService.applyChapterArchitectureRepair(Number(req.params.id), req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/novels-routes-architecture-review.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/novels.ts backend/test/novels-routes-architecture-review.test.js
git commit -m "feat: expose chapter architecture review routes"
```

## Task 6: 前端接入 API

**Files:**
- Modify: `frontend/src/services/api.js`

- [ ] **Step 1: 写最小 API 接口代码**

```js
export const architectureApi = {
  // existing methods...
  reviewChapterArchitectures: (novelId) =>
    api.post(`/novels/${novelId}/review-chapter-architectures`),
  repairChapterArchitectures: (novelId, reviewResult, userPrompt = '') =>
    api.post(`/novels/${novelId}/repair-chapter-architectures`, { reviewResult, userPrompt }),
  applyChapterArchitectureRepair: (novelId, repairResult) =>
    api.post(`/novels/${novelId}/apply-chapter-architecture-repair`, repairResult),
};
```

- [ ] **Step 2: 验证前端构建前没有语法错误**

Run: `npm run build`
Workdir: `frontend`
Expected: build continues past `src/services/api.js` without syntax errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/api.js
git commit -m "feat: add chapter architecture review frontend api"
```

## Task 7: 前端审阅结果与修补结果接入

**Files:**
- Modify: `frontend/src/pages/ArchitectureManager.jsx`

- [ ] **Step 1: 增加新状态字段**

```jsx
const [chapterReviewResult, setChapterReviewResult] = useState(() => {
  const saved = localStorage.getItem(`chapter-architecture-review-${id}`);
  return saved ? JSON.parse(saved) : null;
});
const [chapterRepairResult, setChapterRepairResult] = useState(() => {
  const saved = localStorage.getItem(`chapter-architecture-repair-${id}`);
  return saved ? JSON.parse(saved) : null;
});
const [repairLoading, setRepairLoading] = useState(false);
const [applyingRepair, setApplyingRepair] = useState(false);
```

- [ ] **Step 2: 把“开始架构审阅”切到新接口**

```jsx
const handleStartChapterArchitectureReview = async () => {
  setReviewLoading(true);
  try {
    const res = await architectureApi.reviewChapterArchitectures(id);
    setChapterReviewResult(res.data);
    localStorage.setItem(`chapter-architecture-review-${id}`, JSON.stringify(res.data));
    setShowReviewConfirmDialog(false);
    setShowReviewDialog(true);
    feedback.success('全书级章架构审阅完成。');
  } catch (error) {
    console.error('全书级章架构审阅失败:', error);
    feedback.error(error.response?.data?.error || '全书级章架构审阅失败，请稍后再试。');
  } finally {
    setReviewLoading(false);
  }
};
```

- [ ] **Step 3: 增加“生成修补方案”处理函数**

```jsx
const handleRepairChapterArchitectures = async () => {
  if (!chapterReviewResult) {
    feedback.warning('请先完成全书级章架构审阅。');
    return;
  }
  setRepairLoading(true);
  try {
    const res = await architectureApi.repairChapterArchitectures(id, chapterReviewResult, rewritePrompt);
    setChapterRepairResult(res.data);
    localStorage.setItem(`chapter-architecture-repair-${id}`, JSON.stringify(res.data));
    setShowRewriteDialog(true);
    feedback.success('修补方案已生成。');
  } catch (error) {
    console.error('生成修补方案失败:', error);
    feedback.error(error.response?.data?.error || '生成修补方案失败，请稍后再试。');
  } finally {
    setRepairLoading(false);
  }
};
```

- [ ] **Step 4: 增加“一键应用修补”处理函数**

```jsx
const handleApplyChapterArchitectureRepair = async () => {
  if (!chapterRepairResult) {
    feedback.warning('请先生成修补方案。');
    return;
  }
  setApplyingRepair(true);
  try {
    const res = await architectureApi.applyChapterArchitectureRepair(id, chapterRepairResult);
    localStorage.removeItem(`chapter-architecture-repair-${id}`);
    setChapterRepairResult(null);
    setShowRewriteDialog(false);
    await loadData();
    feedback.success(`应用完成：更新 ${res.data.updated || 0} 章，新增 ${res.data.created || 0} 章。`);
  } catch (error) {
    console.error('应用修补失败:', error);
    feedback.error(error.response?.data?.error || '应用修补失败，请稍后再试。');
  } finally {
    setApplyingRepair(false);
  }
};
```

- [ ] **Step 5: 在审阅结果弹窗里展示 summary/issues**

```jsx
{chapterReviewResult?.summary && (
  <div className="space-y-3 rounded-lg border bg-slate-50/70 p-4">
    <div>
      <h4 className="font-semibold">总体评价</h4>
      <p className="text-sm text-slate-600">{chapterReviewResult.summary.overallAssessment}</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <Card><CardContent className="p-4 text-sm">完整性：{chapterReviewResult.summary.integrityScore}</CardContent></Card>
      <Card><CardContent className="p-4 text-sm">流畅性：{chapterReviewResult.summary.flowScore}</CardContent></Card>
      <Card><CardContent className="p-4 text-sm">Bug 风险：{chapterReviewResult.summary.bugScore}</CardContent></Card>
    </div>
  </div>
)}

{chapterReviewResult?.issues?.map((issue) => (
  <div key={issue.id} className="rounded-lg border bg-white p-4">
    <div className="flex items-center gap-2">
      <Badge variant={issue.severity === 'high' ? 'destructive' : 'secondary'}>{issue.severity}</Badge>
      <span className="font-medium">{issue.title}</span>
    </div>
    <p className="mt-2 text-sm text-slate-600">{issue.description}</p>
    <p className="mt-2 text-xs text-slate-500">涉及章节：{issue.affectedChapterIds?.join('、')}</p>
    <p className="mt-1 text-xs text-slate-500">建议：{issue.suggestion}</p>
  </div>
))}
```

- [ ] **Step 6: 在修补弹窗里展示更新/新增摘要并接上应用按钮**

```jsx
{chapterRepairResult && (
  <ScrollArea className="max-h-[400px] rounded-lg border bg-slate-50/50 p-4">
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card><CardContent className="p-4 text-sm">将更新 {chapterRepairResult.updatedChapters?.length || 0} 章</CardContent></Card>
        <Card><CardContent className="p-4 text-sm">将新增 {chapterRepairResult.newChapters?.length || 0} 章</CardContent></Card>
      </div>
      {(chapterRepairResult.updatedChapters || []).map((chapter) => (
        <div key={`update-${chapter.chapterId}`} className="rounded border bg-white p-3">
          <p className="text-sm font-medium">更新章节 #{chapter.chapterId}：{chapter.title}</p>
          <p className="text-xs text-slate-500">{chapter.plotOutline}</p>
        </div>
      ))}
      {(chapterRepairResult.newChapters || []).map((chapter, index) => (
        <div key={`new-${index}`} className="rounded border bg-white p-3">
          <p className="text-sm font-medium">新增章节：{chapter.title}</p>
          <p className="text-xs text-slate-500">插入到章节 #{chapter.insertAfterChapterId} 之后</p>
        </div>
      ))}
    </div>
  </ScrollArea>
)}
```

- [ ] **Step 7: 前端构建验证**

Run: `npm run build`
Workdir: `frontend`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/ArchitectureManager.jsx
git commit -m "feat: add global chapter architecture review workflow ui"
```

## Task 8: 全量回归验证

**Files:**
- Modify: none
- Test: existing tests and builds

- [ ] **Step 1: 跑后端 service 测试**

Run: `node --test test/architecture-review-service.test.js`
Workdir: `backend`
Expected: PASS

- [ ] **Step 2: 跑后端路由测试**

Run: `node --test test/novels-routes-architecture-review.test.js`
Workdir: `backend`
Expected: PASS

- [ ] **Step 3: 跑已有架构服务回归**

Run: `node --test test/architecture-service.test.js`
Workdir: `backend`
Expected: PASS

- [ ] **Step 4: 跑前端构建**

Run: `npm run build`
Workdir: `frontend`
Expected: PASS

- [ ] **Step 5: 检查 patch 健康度**

Run: `git diff --check`
Workdir: repo root
Expected: no output

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "test: verify global chapter architecture review workflow"
```

## Self-Review

### Spec coverage

已覆盖 spec 中的以下要求：

1. 全书级章架构审阅：Task 1-2
2. 结构化问题列表输出：Task 1-2
3. 基于问题的章架构定向修补：Task 3
4. 支持新增章架构：Task 4
5. 一键应用修补结果：Task 4-7
6. 前端展示总体评价/评分/问题列表/修补摘要：Task 7

未纳入的 spec 外功能没有加入计划：

1. 删除章架构
2. 正文联动修订
3. diff 视图
4. 局部应用

### Placeholder scan

已检查并避免：

1. `TODO / TBD`
2. “写测试”但不给测试代码
3. “加错误处理”但不给具体逻辑
4. 引用未定义方法且未在前文声明

### Type consistency

计划中统一使用以下名称：

1. `reviewChapterArchitectures`
2. `repairChapterArchitectures`
3. `applyChapterArchitectureRepair`
4. `updatedChapters`
5. `newChapters`
6. `affectedChapterIds`

这些名称在后端 service、route、前端 API、前端状态中保持一致。
