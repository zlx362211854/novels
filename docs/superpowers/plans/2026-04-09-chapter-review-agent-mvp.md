# Chapter Review Agent MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first-version chapter review agent that catches hard-logic errors by using chapter memory cards, fact indexing, and on-demand raw-text lookup.

**Architecture:** Keep the current chapter generation flow, but insert a structured memory extraction stage after chapter content is generated or edited. During review, resolve the current chapter into indexed entities and fact cues, fetch the most relevant historical memory cards, pull small source excerpts from the matching chapters, then send a compact evidence bundle to the review model with the rule that historical正文 overrides architecture when they conflict.

**Tech Stack:** Node.js, Express, Sequelize, SQLite, existing AI service clients, React

---

## File Structure

- `backend/src/models/sequelize.js`
  Add persistent storage for chapter memory cards and their derived fact index fields.
- `backend/src/services/chapterMemoryService.js`
  Create, update, load, and search chapter memory cards for a novel.
- `backend/src/services/chapterMemoryAgent.js`
  Build prompts that extract structured memory cards from a chapter.
- `backend/src/services/reviewContextService.js`
  Resolve relevant historical memory cards and pull raw source excerpts for the current chapter review.
- `backend/src/services/reviewAgent.js`
  Upgrade the review prompt to consume evidence bundles and return source-backed hard-logic findings.
- `backend/src/services/chapterService.js`
  Trigger memory refresh after chapter generation and chapter edits, and wire review to the new context builder.
- `backend/src/routes/chapters.js`
  Expose manual refresh/review endpoints if needed for Chapter Detail.
- `frontend/src/services/api.js`
  Add API calls for memory refresh or manual review if the backend exposes them.
- `frontend/src/pages/ChapterDetail.jsx`
  Show hard-logic review findings with source chapter references and a manual re-run action.

---

### Task 1: Add Chapter Memory Persistence

**Files:**
- Modify: `backend/src/models/sequelize.js`

- [x] **Step 1: Add a `ChapterMemory` Sequelize model**

Define a new table with one row per chapter memory snapshot:

```js
const ChapterMemory = sequelize.define('ChapterMemory', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  novel_id: { type: DataTypes.INTEGER, allowNull: false },
  chapter_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  chapter_number: { type: DataTypes.INTEGER, allowNull: false },
  summary: { type: DataTypes.TEXT },
  entities: { type: DataTypes.TEXT },
  facts: { type: DataTypes.TEXT },
  state_changes: { type: DataTypes.TEXT },
  open_threads: { type: DataTypes.TEXT },
  source_excerpt_map: { type: DataTypes.TEXT },
  content_hash: { type: DataTypes.STRING, allowNull: false }
}, {
  tableName: 'chapter_memories',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});
```

- [x] **Step 2: Add associations**

Attach the new model to `Novel` and `Chapter`:

```js
Novel.hasMany(ChapterMemory, { foreignKey: 'novel_id', as: 'chapterMemories', onDelete: 'CASCADE' });
Chapter.hasOne(ChapterMemory, { foreignKey: 'chapter_id', as: 'memory', onDelete: 'CASCADE' });
ChapterMemory.belongsTo(Novel, { foreignKey: 'novel_id', as: 'novel' });
ChapterMemory.belongsTo(Chapter, { foreignKey: 'chapter_id', as: 'chapter' });
```

- [x] **Step 3: Export the model**

Add `ChapterMemory` to the module export list so services can consume it.

- [x] **Step 4: Start the backend once to verify SQLite sync creates the table**

Run:

```bash
npm run dev
```

Expected:
- backend starts successfully
- no Sequelize model or association errors

- [ ] **Step 5: Commit**

```bash
git add backend/src/models/sequelize.js
git commit -m "feat: add chapter memory persistence"
```

### Task 2: Extract And Store Memory Cards

**Files:**
- Create: `backend/src/services/chapterMemoryAgent.js`
- Create: `backend/src/services/chapterMemoryService.js`
- Modify: `backend/src/services/chapterService.js`

- [x] **Step 1: Implement the memory card schema**

The extraction prompt should require this JSON shape:

```json
{
  "summary": "string",
  "entities": {
    "characters": ["string"],
    "locations": ["string"],
    "items": ["string"],
    "organizations": ["string"]
  },
  "facts": [
    {
      "type": "character_state|relationship|world_rule|knowledge|timeline|item_state",
      "subject": "string",
      "predicate": "string",
      "object": "string",
      "status": "active|resolved|uncertain",
      "evidence": "string"
    }
  ],
  "state_changes": [
    {
      "entity": "string",
      "field": "string",
      "before": "string",
      "after": "string",
      "evidence": "string"
    }
  ],
  "open_threads": [
    {
      "thread": "string",
      "status": "opened|advanced|resolved",
      "evidence": "string"
    }
  ],
  "source_excerpt_map": [
    {
      "label": "string",
      "excerpt": "string"
    }
  ]
}
```

- [x] **Step 2: Build `chapterMemoryAgent.js`**

Implement:

```js
async function extractMemoryCard({ chapter, novel, architecture }, signal) { ... }
```

Requirements:
- reuse existing AI config loading patterns from `reviewAgent.js`
- keep temperature low
- return parsed JSON with safe fallbacks

- [x] **Step 3: Build `chapterMemoryService.js`**

Implement:

```js
async function upsertForChapter(chapterId, signal) { ... }
async function findByChapterId(chapterId) { ... }
async function findByNovelId(novelId) { ... }
function buildContentHash(content) { ... }
```

Requirements:
- skip regeneration when `content_hash` matches current chapter content
- store JSON fields as serialized text, matching current model style
- reuse chapter/novel/architecture loading through Sequelize

- [x] **Step 4: Refresh memory after chapter writes**

Update `backend/src/services/chapterService.js` so these paths refresh memory:
- after `generate()`
- after `update()` when `content` changes
- after `restoreVersion()`

- [ ] **Step 5: Verify memory cards are created**

Run:

```bash
npm run dev
```

Then generate or edit a chapter and confirm in SQLite that a `chapter_memories` row exists for that chapter.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/chapterMemoryAgent.js backend/src/services/chapterMemoryService.js backend/src/services/chapterService.js
git commit -m "feat: extract and persist chapter memory cards"
```

### Task 3: Build Historical Fact Retrieval And Source Lookup

**Files:**
- Create: `backend/src/services/reviewContextService.js`
- Modify: `backend/src/services/chapterMemoryService.js`

- [x] **Step 1: Add lightweight retrieval helpers**

Implement helpers that score historical memories by overlap with the current chapter:

```js
function collectQueryTerms(memoryCard) { ... }
function scoreMemoryMatch(currentMemory, historicalMemory) { ... }
```

Score inputs should prioritize:
- shared characters
- shared locations
- shared organizations
- matching fact subject/object terms
- matching thread labels

- [x] **Step 2: Build the review context service**

Implement:

```js
async function buildReviewContext(chapterId, signal) { ... }
```

Return:

```json
{
  "currentChapter": {},
  "currentMemory": {},
  "relevantMemories": [],
  "sourceExcerpts": [],
  "architecture": {}
}
```

Requirements:
- exclude the current chapter from history matches
- prefer the top 5-8 historical matches
- attach short raw excerpts from the matched chapters using `source_excerpt_map` labels first, then fallback to small content slices

- [x] **Step 3: Add a deterministic excerpt fallback**

If a historical memory card does not provide a usable excerpt, fallback to a short chapter content slice:

```js
function sliceExcerpt(content, term) {
  const index = content.indexOf(term);
  if (index === -1) return content.slice(0, 220);
  return content.slice(Math.max(0, index - 80), index + 140);
}
```

- [ ] **Step 4: Verify retrieval with two related chapters**

Run the backend, create or reuse two chapters that share a character or fact, and confirm `buildReviewContext()` returns the earlier chapter in `relevantMemories`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/reviewContextService.js backend/src/services/chapterMemoryService.js
git commit -m "feat: add historical review context retrieval"
```

### Task 4: Upgrade Review Agent To Use Evidence Bundles

**Files:**
- Modify: `backend/src/services/reviewAgent.js`
- Modify: `backend/src/services/chapterService.js`

- [x] **Step 1: Change the review entrypoint**

Update the review service signature to accept context:

```js
async function review(params, signal) {
  const { chapter, novel, architecture, currentMemory, relevantMemories, sourceExcerpts } = params;
}
```

- [x] **Step 2: Rewrite the review prompt around hard-logic validation**

The prompt must explicitly enforce:
- only report source-backed hard-logic issues
- history正文 overrides architecture when they conflict
- architecture conflict without正文 conflict is only a planning mismatch
- each issue must cite the current chapter and one historical source when applicable

Expected response shape:

```json
{
  "score": 0,
  "issues": [
    {
      "type": "character_state_conflict|knowledge_conflict|timeline_conflict|world_rule_conflict|item_state_conflict",
      "severity": "high|medium|low",
      "description": "string",
      "currentEvidence": "string",
      "historicalEvidence": "string",
      "historicalChapterNumber": 12,
      "suggestion": "string"
    }
  ],
  "notes": []
}
```

- [x] **Step 3: Wire chapter generation to the new context builder**

In `backend/src/services/chapterService.js`:
- refresh current chapter memory before review
- call `buildReviewContext(chapterId, signal)`
- pass the returned evidence bundle into `reviewAgent.review()`

- [ ] **Step 4: Verify review results contain source-backed conflicts**

Run the backend, review a chapter with an intentional contradiction, and confirm the response includes:
- `historicalChapterNumber`
- `currentEvidence`
- `historicalEvidence`

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/reviewAgent.js backend/src/services/chapterService.js
git commit -m "feat: review chapters with historical evidence"
```

### Task 5: Add Manual Review Refresh And Frontend Visibility

**Files:**
- Modify: `backend/src/routes/chapters.js`
- Modify: `frontend/src/services/api.js`
- Modify: `frontend/src/pages/ChapterDetail.jsx`

- [x] **Step 1: Add a manual review endpoint**

Add:

```js
router.post('/:id/review', async (req, res) => {
  const result = await chapterService.reviewChapter(req.params.id, ac.signal);
  res.json(result);
});
```

Also expose a memory refresh endpoint only if `reviewChapter()` needs it separately:

```js
router.post('/:id/refresh-memory', async (req, res) => { ... });
```

- [x] **Step 2: Extend the frontend API wrapper**

Add:

```js
review: (id) => api.post(`/chapters/${id}/review`),
refreshMemory: (id) => api.post(`/chapters/${id}/refresh-memory`)
```

- [x] **Step 3: Show findings in Chapter Detail**

Update `frontend/src/pages/ChapterDetail.jsx` to:
- add a "重新审阅" action
- render issue severity and type
- show historical chapter number when present
- display current and historical evidence blocks separately

- [ ] **Step 4: Verify the full flow from the UI**

Run frontend and backend:

```bash
npm run dev
```

From the chapter detail page, trigger a review and confirm:
- the page stays interactive
- findings are visible without opening devtools
- historical chapter references are readable

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/chapters.js frontend/src/services/api.js frontend/src/pages/ChapterDetail.jsx
git commit -m "feat: expose chapter review findings in chapter detail"
```

### Task 6: Smoke Test The MVP End To End

**Files:**
- Modify: `docs/superpowers/plans/2026-04-09-chapter-review-agent-mvp.md`

- [ ] **Step 1: Create a manual verification checklist**

Verify these scenarios:
- same character has contradictory ability across two chapters
- same clue is known too early in a later chapter
- architecture says one thing but history正文 says another, and the system does not flag a false positive

- [ ] **Step 2: Run the final smoke test**

Run:

```bash
npm run dev
```

Then manually confirm:
- memory cards refresh after edits
- manual review returns structured issues
- no review means `issues` is an empty array instead of a parse error fallback

- [ ] **Step 3: Mark completed items in this plan**

Update this file so finished steps are checked off as implementation progresses.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-04-09-chapter-review-agent-mvp.md
git commit -m "docs: finalize chapter review agent mvp checklist"
```
