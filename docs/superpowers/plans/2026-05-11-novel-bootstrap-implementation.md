# Novel Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a one-click AI novel bootstrap flow that generates and directly saves a new novel's metadata, story bible, full/volume/chapter architectures, then runs three automated chapter-architecture review/repair rounds before persistence.

**Architecture:** Add a new backend bootstrap pipeline centered on LangGraph graphs and an in-memory draft model. The pipeline generates metadata, story bible entries, architectures, and a three-round chapter review loop using stable draft chapter IDs, then persists the completed draft transactionally. Expose the flow through a dedicated `/novels/bootstrap` API and add a frontend entry page from the novel list.

**Tech Stack:** Express, TypeScript, Sequelize, LangGraph, LangChain, React, Axios

---

### Task 1: Define bootstrap draft types and backend save path

**Files:**
- Create: `backend/src/services/novelBootstrapService.ts`
- Modify: `backend/src/services/novelService.ts`
- Modify: `backend/src/models/sequelize.ts`

- [ ] **Step 1: Add draft-oriented save service**

Implement a focused service that accepts a generated bootstrap draft and saves it transactionally:

```ts
export interface NovelBootstrapDraft {
  prompt: string;
  novel: { title: string; description: string; genre: string };
  cast: {
    maleLead: Record<string, unknown> | null;
    femaleLead: Record<string, unknown> | null;
    supportingCharacters: Record<string, unknown>[];
    relationships: Record<string, unknown>[];
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
  fullArchitecture: DraftArchitecture;
  volumeArchitectures: DraftArchitecture[];
  chapterArchitectures: DraftChapterArchitecture[];
}
```

- [ ] **Step 2: Save novel and architecture records inside one transaction**

In `backend/src/services/novelBootstrapService.ts`, persist:

```ts
const novel = await Novel.create({ ... }, { transaction });
const fullArchitecture = await Architecture.create({ ... }, { transaction });
for (const volume of draft.volumeArchitectures) {
  const createdVolume = await Architecture.create({ ... }, { transaction });
  volumeIdMap.set(volume.draftId, createdVolume.id);
}
for (const chapter of draft.chapterArchitectures) {
  await Architecture.create({
    novel_id: novel.id,
    level: 'chapter',
    parent_id: volumeIdMap.get(chapter.parentDraftVolumeId) ?? null,
    title: chapter.title,
    plot_outline: chapter.plotOutline,
    characters: JSON.stringify(chapter.characters ?? []),
    world_setting: JSON.stringify(chapter.worldSetting ?? {}),
    emotional_tone: chapter.emotionalTone ?? null,
    metadata: JSON.stringify(chapter.metadata ?? {}),
  }, { transaction });
}
```

- [ ] **Step 3: Reuse story bible writes instead of reimplementing vector logic**

Call existing story bible creation logic after the novel row exists:

```ts
for (const entry of draft.storyBibleEntries) {
  await storyBibleService.createEntry({
    novelId: novel.id,
    type: entry.type,
    title: entry.title,
    content: entry.content,
    priority: entry.priority,
    labels: entry.labels,
  });
}
```

If the current story bible service cannot participate in the same transaction, document that save order explicitly in code and fail the whole bootstrap request before returning success.

- [ ] **Step 4: Return a stable serialized payload**

Return:

```ts
return {
  novel: await novelService.findById(novel.id),
  counts: {
    volumes: draft.volumeArchitectures.length,
    chapters: draft.chapterArchitectures.length,
    storyBibleEntries: draft.storyBibleEntries.length,
  },
};
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/novelBootstrapService.ts backend/src/services/novelService.ts backend/src/models/sequelize.ts
git commit -m "feat: add novel bootstrap persistence service"
```

### Task 2: Build metadata, story bible, and architecture graphs

**Files:**
- Create: `backend/src/ai/graphs/novelMetadataBootstrapGraph.ts`
- Create: `backend/src/ai/graphs/storyBibleBootstrapGraph.ts`
- Create: `backend/src/ai/graphs/novelArchitectureBootstrapGraph.ts`
- Modify: `backend/src/ai/graphs/architectureGraph.ts`
- Modify: `backend/src/services/architectureAiService.ts`

- [ ] **Step 1: Add metadata bootstrap graph**

Generate a single JSON object covering title, description, genre, cast, relationships, and story line:

```ts
{
  "novel": { "title": "...", "description": "...", "genre": "..." },
  "cast": {
    "maleLead": { "name": "...", "role": "男主", "description": "...", "goal": "..." },
    "femaleLead": { "name": "...", "role": "女主", "description": "...", "goal": "..." },
    "supportingCharacters": [],
    "relationships": []
  },
  "story": {
    "premise": "...",
    "mainLine": "...",
    "arcs": ["..."],
    "bibleSummary": "..."
  }
}
```

- [ ] **Step 2: Add story bible bootstrap graph**

Transform metadata and story context into structured story bible entries:

```ts
[
  { "type": "character", "title": "女主：沈知微", "content": "...", "priority": 10, "labels": ["主角"] },
  { "type": "relationship", "title": "沈知微 / 裴承璟", "content": "...", "priority": 20, "labels": ["关系"] }
]
```

- [ ] **Step 3: Add architecture bootstrap graph**

Generate:

1. one full architecture draft
2. a list of volume architecture drafts
3. chapter architecture drafts per volume

Use stable draft IDs:

```ts
type DraftId = string;
const volumeDraftId = `vol_${index + 1}`;
const chapterDraftId = `ch_${globalIndex + 1}`;
```

- [ ] **Step 4: Keep rich chapter outline fields in metadata**

When converting batch chapter output, preserve execution fields:

```ts
metadata: {
  chapterGoal: item.chapter_goal,
  plotSummary: item.plot_summary,
  plotBeats: item.plot_beats,
  requiredCharacters: item.required_characters,
  allowedOptionalCharacters: item.allowed_optional_characters,
  sceneLocations: item.scene_locations,
  conflict: item.conflict,
  foreshadowing: item.foreshadowing,
  stateChangesExpected: item.state_changes_expected,
  endingHook: item.ending_hook,
  forbiddenContent: item.forbidden_content,
}
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/graphs/novelMetadataBootstrapGraph.ts backend/src/ai/graphs/storyBibleBootstrapGraph.ts backend/src/ai/graphs/novelArchitectureBootstrapGraph.ts backend/src/ai/graphs/architectureGraph.ts backend/src/services/architectureAiService.ts
git commit -m "feat: add bootstrap generation graphs"
```

### Task 3: Build the three-round draft chapter review loop and orchestration graph

**Files:**
- Create: `backend/src/ai/graphs/chapterArchitectureReviewLoopGraph.ts`
- Create: `backend/src/ai/graphs/novelBootstrapGraph.ts`
- Modify: `backend/src/services/architectureReviewService.ts`
- Modify: `backend/src/services/aiStatusService.ts`

- [ ] **Step 1: Extend review service with draft-based review helpers**

Add draft-mode helpers that do not require DB architecture IDs:

```ts
async function reviewDraftChapterArchitectures(input: DraftReviewInput, signal?: AbortSignal, taskId?: string) {}
async function repairDraftChapterArchitectures(input: DraftRepairInput, reviewResult: any, signal?: AbortSignal, taskId?: string) {}
function applyDraftChapterArchitectureRepair(chapters: DraftChapterArchitecture[], repairResult: any): DraftChapterArchitecture[] {}
```

The prompt must expose `draftChapterId` values as `章架构ID=...`, preserving the current repair protocol.

- [ ] **Step 2: Implement fixed three-round loop graph**

The review loop state should track:

```ts
{
  draft: NovelBootstrapDraft;
  round: number;
  reviewHistory: Array<{ round: number; reviewResult: any; repairResult: any }>;
}
```

Execution rule:

```ts
for (let round = 1; round <= 3; round += 1) {
  const reviewResult = await reviewDraftChapterArchitectures(...);
  const repairResult = await repairDraftChapterArchitectures(...);
  draft.chapterArchitectures = applyDraftChapterArchitectureRepair(draft.chapterArchitectures, repairResult);
}
```

- [ ] **Step 3: Implement top-level bootstrap graph**

Compose:

1. metadata graph
2. story bible graph
3. architecture graph
4. review loop graph
5. save service

Return:

```ts
{
  novelId: saved.novel.id,
  title: saved.novel.title,
  status: "completed",
  counts: saved.counts,
}
```

- [ ] **Step 4: Emit progress states for frontend**

Add explicit progress messages:

```ts
[
  "生成小说基础信息",
  "生成故事圣经",
  "生成全书架构",
  "执行第 1 轮章架构审阅",
  "执行第 2 轮章架构审阅",
  "执行第 3 轮章架构审阅",
  "保存小说数据"
]
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/ai/graphs/chapterArchitectureReviewLoopGraph.ts backend/src/ai/graphs/novelBootstrapGraph.ts backend/src/services/architectureReviewService.ts backend/src/services/aiStatusService.ts
git commit -m "feat: add novel bootstrap orchestration graph"
```

### Task 4: Expose bootstrap API and connect frontend entry flow

**Files:**
- Modify: `backend/src/routes/novels.ts`
- Modify: `frontend/src/services/api.js`
- Create: `frontend/src/pages/NovelBootstrap.jsx`
- Modify: `frontend/src/pages/NovelList.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add backend route**

Expose:

```ts
router.post('/bootstrap', async (req, res) => {
  const { prompt, constraints } = req.body;
  if (!prompt?.trim()) return res.status(400).json({ error: 'prompt 不能为空' });
  const taskId = randomUUID();
  const result = await novelBootstrapGraph.invoke({ prompt, constraints, taskId });
  res.status(201).json({ taskId, ...result });
});
```

- [ ] **Step 2: Add API client method**

```js
bootstrap: (data) => api.post('/novels/bootstrap', data),
```

- [ ] **Step 3: Add dedicated frontend page**

The page needs:

- prompt textarea
- optional constraints inputs
- submit button
- loading state
- success jump to new novel detail page

Use the existing feedback system and page shell components rather than inventing a new design language.

- [ ] **Step 4: Add entry from the novel list**

Add a secondary action beside “创建新项目”:

```jsx
<Button variant="secondary" onClick={() => navigate('/novels/bootstrap')}>
  AI 创建小说
</Button>
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/novels.ts frontend/src/services/api.js frontend/src/pages/NovelBootstrap.jsx frontend/src/pages/NovelList.jsx frontend/src/App.jsx
git commit -m "feat: add novel bootstrap API and UI entry"
```

### Task 5: Verify the end-to-end flow manually

**Files:**
- Modify: `docs/superpowers/plans/2026-05-11-novel-bootstrap-implementation.md`

- [ ] **Step 1: Run backend type-aware verification**

Run:

```bash
npm test -- --runInBand
```

Expected: existing suite may be noisy because the worktree is dirty; at minimum, confirm the bootstrap files compile and the server starts without syntax errors.

- [ ] **Step 2: Start the app and exercise one bootstrap request**

Run the existing dev flow and submit one prompt through the new UI or API. Confirm:

- a novel row is created
- full/volume/chapter architectures are saved
- story bible entries are saved
- three chapter review rounds run

- [ ] **Step 3: Record any verification limits**

If tests are skipped or fail due to unrelated existing changes, note that explicitly in the final report instead of claiming full verification.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-05-11-novel-bootstrap-implementation.md
git commit -m "docs: record bootstrap verification notes"
```
