# Chapter Revision Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe chapter revision workflow that turns review findings into a previewable revised draft without automatically overwriting the saved chapter.

**Architecture:** Keep the current review pipeline and add a second AI stage for revision proposals. Move AI prompt modules into `backend/src/agents/`, add a `reviseChapter()` orchestration path in the chapter service, expose `POST /api/chapters/:id/revise`, and let the chapter detail page preview and apply a transient revised draft into the editor buffer.

**Tech Stack:** Node.js, Express, Sequelize, SQLite, existing AI clients, React, Vite, node:test

---

## File Structure

- `backend/src/agents/reviewAgent.js`
  Existing review AI module moved out of `services/`.
- `backend/src/agents/chapterMemoryAgent.js`
  Existing chapter memory AI module moved out of `services/`.
- `backend/src/agents/chapterRevisionAgent.js`
  New AI module that generates a conservative revision proposal from review findings.
- `backend/src/services/chapterMemoryService.js`
  Update imports to use the moved memory agent.
- `backend/src/services/chapterService.js`
  Add `reviseChapter()` orchestration and use agents from the new location.
- `backend/src/routes/chapters.js`
  Add `POST /:id/revise`.
- `frontend/src/services/api.js`
  Add chapter revision API call.
- `frontend/src/pages/ChapterDetail.jsx`
  Show revision proposal UI, regenerate/discard/apply actions, and editor-buffer application.
- `backend/test/agent-module-paths.test.js`
  Verify services resolve agents from `backend/src/agents/`.
- `backend/test/chapter-revision-agent.test.js`
  Verify prompt and parser behavior for revision output.
- `backend/test/chapter-service-revision.test.js`
  Verify chapter revision orchestration and safety checks.
- `docs/superpowers/specs/2026-04-09-chapter-revision-agent-design.md`
  Reference spec for this work.

---

### Task 1: Move AI Modules Into `backend/src/agents`

**Files:**
- Create: `backend/src/agents/reviewAgent.js`
- Create: `backend/src/agents/chapterMemoryAgent.js`
- Modify: `backend/src/services/chapterService.js`
- Modify: `backend/src/services/chapterMemoryService.js`
- Test: `backend/test/agent-module-paths.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/test/agent-module-paths.test.js` with:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

test('services resolve agents from backend/src/agents', async () => {
  const reviewAgent = require('../src/agents/reviewAgent');
  const chapterMemoryAgent = require('../src/agents/chapterMemoryAgent');
  const chapterService = require('../src/services/chapterService');
  const chapterMemoryService = require('../src/services/chapterMemoryService');

  assert.equal(typeof reviewAgent.review, 'function');
  assert.equal(typeof chapterMemoryAgent.extractMemoryCard, 'function');
  assert.ok(chapterService);
  assert.ok(chapterMemoryService);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test test/agent-module-paths.test.js
```

Expected:
- FAIL with `Cannot find module '../src/agents/reviewAgent'` or `Cannot find module '../src/agents/chapterMemoryAgent'`

- [ ] **Step 3: Move the AI modules and update imports**

Create `backend/src/agents/reviewAgent.js` by moving the current implementation from `backend/src/services/reviewAgent.js`.

Create `backend/src/agents/chapterMemoryAgent.js` by moving the current implementation from `backend/src/services/chapterMemoryAgent.js`.

Update:

```js
// backend/src/services/chapterService.js
const reviewAgent = require('../agents/reviewAgent');
```

```js
// backend/src/services/chapterMemoryService.js
const chapterMemoryAgent = require('../agents/chapterMemoryAgent');
```

Delete the old agent files from `backend/src/services/` after the new imports are in place.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
node --test test/agent-module-paths.test.js test/review-agent.test.js test/chapter-memory-service.test.js
```

Expected:
- PASS
- existing review and memory tests still pass

- [ ] **Step 5: Commit**

```bash
git add backend/src/agents/reviewAgent.js backend/src/agents/chapterMemoryAgent.js backend/src/services/chapterService.js backend/src/services/chapterMemoryService.js backend/test/agent-module-paths.test.js
git commit -m "refactor: move ai modules into agents"
```

### Task 2: Add The Chapter Revision Agent

**Files:**
- Create: `backend/src/agents/chapterRevisionAgent.js`
- Test: `backend/test/chapter-revision-agent.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/test/chapter-revision-agent.test.js` with:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRevisionPrompt,
  parseRevisionResult
} = require('../src/agents/chapterRevisionAgent');

test('buildRevisionPrompt includes conservative rewrite constraints', () => {
  const prompt = buildRevisionPrompt(
    { chapter_number: 8, title: '第八章', content: '原始正文' },
    { title: '测试小说', genre: '玄幻' },
    { title: '章节架构', level: 'chapter' },
    {
      issues: [
        {
          type: 'knowledge_conflict',
          description: '角色过早知道秘密',
          currentEvidence: '他已经知道门后的名字',
          historicalEvidence: '前文明确写他还不知道',
          historicalChapterNumber: 3,
          suggestion: '删去提前知晓的描述'
        }
      ]
    },
    {
      currentMemory: { summary: '当前章摘要' },
      relevantMemories: [],
      sourceExcerpts: []
    }
  );

  assert.match(prompt, /只修复 issues 里列出的问题/);
  assert.match(prompt, /不要新增新人物、新设定、新事件/);
  assert.match(prompt, /revisedContent/);
});

test('parseRevisionResult returns structured revised content', () => {
  const parsed = parseRevisionResult(`{
    "summary": "修复了提前知晓问题",
    "appliedIssues": [
      { "type": "knowledge_conflict", "description": "角色过早知道秘密" }
    ],
    "revisedContent": "修订后的完整正文"
  }`);

  assert.equal(parsed.summary, '修复了提前知晓问题');
  assert.equal(parsed.appliedIssues.length, 1);
  assert.equal(parsed.revisedContent, '修订后的完整正文');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test test/chapter-revision-agent.test.js
```

Expected:
- FAIL with `Cannot find module '../src/agents/chapterRevisionAgent'`

- [ ] **Step 3: Implement the agent**

Create `backend/src/agents/chapterRevisionAgent.js` with exports:

```js
async function revise(params, signal) { ... }
function buildRevisionPrompt(chapter, novel, architecture, reviewResult, reviewContext) { ... }
function parseRevisionResult(result) { ... }
```

Prompt requirements:
- require a complete revised chapter draft
- preserve unaffected scenes
- only fix `reviewResult.issues`
- do not introduce new events, characters, or rules
- treat architecture as secondary to historical正文

Fallback parser behavior:

```js
return {
  summary: '无法解析修订建议稿',
  appliedIssues: [],
  revisedContent: ''
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test test/chapter-revision-agent.test.js
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/agents/chapterRevisionAgent.js backend/test/chapter-revision-agent.test.js
git commit -m "feat: add chapter revision agent"
```

### Task 3: Add Chapter Revision Orchestration And Endpoint

**Files:**
- Modify: `backend/src/services/chapterService.js`
- Modify: `backend/src/routes/chapters.js`
- Test: `backend/test/chapter-service-revision.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/test/chapter-service-revision.test.js` with:

```js
const test = require('node:test');
const assert = require('node:assert/strict');

const chapterService = require('../src/services/chapterService');

test('reviseChapter rejects when review issues are empty', async () => {
  await assert.rejects(
    () => chapterService.reviseChapter(1, { issues: [] }),
    /没有可用于修订的问题/
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test test/chapter-service-revision.test.js
```

Expected:
- FAIL because `reviseChapter` does not exist yet

- [ ] **Step 3: Implement `reviseChapter()`**

Add to `backend/src/services/chapterService.js`:

```js
async function reviseChapter(chapterId, reviewResult, signal) {
  if (!reviewResult?.issues?.length) {
    throw new Error('没有可用于修订的问题');
  }

  const chapter = await Chapter.findByPk(chapterId);
  if (!chapter) throw new Error('章节不存在');
  if (!chapter.content?.trim()) throw new Error('章节正文为空，无法生成修订建议稿');

  const novel = await Novel.findByPk(chapter.novel_id);
  if (!novel) throw new Error('小说不存在');

  const reviewContext = await reviewContextService.buildReviewContext(chapterId, signal);

  return chapterRevisionAgent.revise({
    chapter,
    novel,
    architecture: reviewContext.architecture,
    reviewResult,
    currentMemory: reviewContext.currentMemory,
    relevantMemories: reviewContext.relevantMemories,
    sourceExcerpts: reviewContext.sourceExcerpts
  }, signal);
}
```

Add route in `backend/src/routes/chapters.js`:

```js
router.post('/:id/revise', async (req, res) => {
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) ac.abort();
  });
  try {
    const { reviewResult } = req.body;
    const result = await chapterService.reviseChapter(req.params.id, reviewResult, ac.signal);
    res.json(result);
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: error.message });
  }
});
```

- [ ] **Step 4: Run tests to verify the orchestration passes**

Run:

```bash
node --test test/chapter-service-revision.test.js test/bootstrap.test.js test/review-context-service.test.js
```

Expected:
- PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/chapterService.js backend/src/routes/chapters.js backend/test/chapter-service-revision.test.js
git commit -m "feat: add chapter revision orchestration"
```

### Task 4: Expose Revision API And Proposal UI

**Files:**
- Modify: `frontend/src/services/api.js`
- Modify: `frontend/src/pages/ChapterDetail.jsx`

- [ ] **Step 1: Write the failing test proxy**

Use UI behavior as the failing test.

Expected before work:
- there is no `生成修订建议稿` action after review
- there is no transient revision proposal panel

- [ ] **Step 2: Verify baseline behavior**

Open a reviewed chapter detail page and confirm:
- review findings are visible
- no revision proposal UI is present

- [ ] **Step 3: Implement frontend revision flow**

Add API call in `frontend/src/services/api.js`:

```js
revise: (id, reviewResult) => api.post(`/chapters/${id}/revise`, { reviewResult }),
```

Update `frontend/src/pages/ChapterDetail.jsx` state:

```js
const [revisionDraft, setRevisionDraft] = useState(null);
const [revising, setRevising] = useState(false);
```

Add handlers:

```js
async function handleRevise() { ... }
function handleApplyRevisionDraft() { ... }
function handleDiscardRevisionDraft() { ... }
```

UI requirements:
- show `生成修订建议稿` only when `review?.issues?.length > 0`
- show a proposal panel with `summary`, `appliedIssues`, and `revisedContent`
- `应用到编辑区` sets `editContent` and switches to edit mode
- do not auto-save

- [ ] **Step 4: Run frontend build to verify it compiles**

Run:

```bash
npm run build
```

Expected:
- PASS
- no JSX syntax errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/api.js frontend/src/pages/ChapterDetail.jsx
git commit -m "feat: add chapter revision proposal ui"
```

### Task 5: Verify End-To-End Revision Safety

**Files:**
- Modify: `docs/superpowers/plans/2026-04-09-chapter-revision-agent-implementation.md`

- [ ] **Step 1: Run backend test suite used by this feature**

Run:

```bash
node --test test/bootstrap.test.js test/agent-module-paths.test.js test/chapter-memory-model.test.js test/chapter-memory-service.test.js test/review-context-service.test.js test/review-agent.test.js test/chapter-revision-agent.test.js test/chapter-service-revision.test.js
```

Expected:
- PASS

- [ ] **Step 2: Run frontend build**

Run:

```bash
npm run build
```

Expected:
- PASS

- [ ] **Step 3: Manual smoke test**

Verify in the app:
- review a chapter with issues
- click `生成修订建议稿`
- proposal appears without replacing editor content
- click `应用到编辑区`
- editor content changes
- chapter is not persisted until `保存章节`
- after saving, the existing version history flow still works

- [ ] **Step 4: Mark completed checkboxes in this plan**

Update this file to check off finished steps as you go.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-04-09-chapter-revision-agent-implementation.md
git commit -m "docs: finalize chapter revision implementation checklist"
```
