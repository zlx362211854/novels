# SQLite-Vec RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hybrid RAG layer using Zhipu embeddings and `sqlite-vec`, then inject retrieved story bible rules and chapter evidence into chapter generation first.

**Architecture:** Keep the current `ChapterMemory` rule-based recall intact, add vector-backed storage for chapter chunks and story bible entries inside SQLite, and introduce a `ragService` that merges rule recall with vector recall into a single retrieval context. Wire the first version into chapter generation only, then reuse the same path for review/revision/tuning later.

**Tech Stack:** Node.js, TypeScript, Sequelize, SQLite, better-sqlite3, sqlite-vec, LangGraph, Zhipu Embeddings API

---

### Task 1: Add vector-ready schema and SQLite extension bootstrap

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/src/models/sequelize.ts`
- Create: `backend/test/sqlite-vec-bootstrap.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

test('sqlite-vec bootstrap exposes vector search helpers', async () => {
  const mod = await import('../src/services/vectorStoreService');
  assert.equal(typeof mod.ensureVectorExtensionLoaded, 'function');
  assert.equal(typeof mod.ensureVectorSchema, 'function');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/sqlite-vec-bootstrap.test.js`
Expected: FAIL with module not found or missing exports.

- [ ] **Step 3: Add package dependency and schema models**

```json
{
  "dependencies": {
    "sqlite-vec": "^latest"
  }
}
```

```ts
interface ChapterChunkAttributes {
  id?: number;
  novel_id: number;
  chapter_id: number;
  chapter_number: number;
  chunk_index: number;
  text: string;
  labels: string | null;
  embedding: string | null;
  content_hash: string;
  created_at?: Date;
  updated_at?: Date;
}

interface StoryBibleEntryAttributes {
  id?: number;
  novel_id: number;
  type: string;
  title: string;
  content: string;
  labels: string | null;
  embedding: string | null;
  priority: number;
  created_at?: Date;
  updated_at?: Date;
}
```

```ts
async function ensureLegacySchema(): Promise<void> {
  // existing legacy checks...

  const allTables = await queryInterface.showAllTables();
  if (!allTables.includes('chapter_chunks')) {
    await ChapterChunk.sync({ force: false });
  }
  if (!allTables.includes('story_bible_entries')) {
    await StoryBibleEntry.sync({ force: false });
  }
}
```

- [ ] **Step 4: Create vector bootstrap service**

```ts
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

let db: Database.Database | null = null;

function getVectorDb(): Database.Database {
  if (!db) {
    db = new Database(process.env.DB_PATH || './data/novels.db');
  }
  return db;
}

export function ensureVectorExtensionLoaded(): void {
  const vectorDb = getVectorDb();
  sqliteVec.load(vectorDb);
}

export function ensureVectorSchema(): void {
  const vectorDb = getVectorDb();
  vectorDb.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chapter_chunk_vec USING vec0(
      chunk_id INTEGER PRIMARY KEY,
      embedding FLOAT[1024]
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS story_bible_vec USING vec0(
      entry_id INTEGER PRIMARY KEY,
      embedding FLOAT[1024]
    );
  `);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/sqlite-vec-bootstrap.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/src/models/sequelize.ts backend/src/services/vectorStoreService.ts backend/test/sqlite-vec-bootstrap.test.js
git commit -m "feat: add sqlite-vec bootstrap and vector tables"
```

### Task 2: Add Zhipu embedding service

**Files:**
- Modify: `backend/src/ai/llmFactory.ts`
- Create: `backend/src/services/embeddingService.ts`
- Create: `backend/test/embedding-service.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

test('embedText normalizes zhipu embeddings response', async () => {
  const service = await import('../src/services/embeddingService');
  assert.equal(typeof service.embedText, 'function');
  assert.equal(typeof service.embedTexts, 'function');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/embedding-service.test.js`
Expected: FAIL because the service file does not exist.

- [ ] **Step 3: Extend AI config for embeddings**

```ts
export interface AIConfig {
  aiModel: string;
  zhipuApiKey?: string;
  zhipuApiUrl?: string;
  zhipuEmbeddingModel?: string;
}
```

```ts
return {
  aiModel: configMap.aiModel || process.env.DEFAULT_AI_MODEL || 'minimax',
  zhipuApiKey: configMap.zhipuApiKey || process.env.ZHIPU_API_KEY,
  zhipuApiUrl: process.env.ZHIPU_API_URL || 'https://open.bigmodel.cn/api/paas/v4',
  zhipuEmbeddingModel: configMap.zhipuEmbeddingModel || process.env.ZHIPU_EMBEDDING_MODEL || 'embedding-3',
};
```

- [ ] **Step 4: Implement embedding service**

```ts
import { getAIConfig } from '../ai/llmFactory';

async function requestEmbeddings(input: string[]): Promise<number[][]> {
  const config = await getAIConfig();
  const response = await fetch(`${config.zhipuApiUrl}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.zhipuApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.zhipuEmbeddingModel || 'embedding-3',
      input,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed: ${response.status}`);
  }

  const payload: any = await response.json();
  return (payload.data || [])
    .sort((a: any, b: any) => a.index - b.index)
    .map((item: any) => item.embedding || []);
}

export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await requestEmbeddings([text]);
  return embedding || [];
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  return requestEmbeddings(texts);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/embedding-service.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/ai/llmFactory.ts backend/src/services/embeddingService.ts backend/test/embedding-service.test.js
git commit -m "feat: add zhipu embedding service"
```

### Task 3: Build chapter chunk indexing

**Files:**
- Create: `backend/src/services/chapterChunkService.ts`
- Modify: `backend/src/services/chapterMemoryService.ts`
- Create: `backend/test/chapter-chunk-service.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

test('splitIntoChunks groups chapter text into stable retrieval chunks', async () => {
  const service = await import('../src/services/chapterChunkService');
  const chunks = service.splitIntoChunks('第一段\\n\\n第二段\\n\\n第三段', 2);
  assert.equal(chunks.length, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/chapter-chunk-service.test.js`
Expected: FAIL because the service file does not exist.

- [ ] **Step 3: Implement chunk splitting and label extraction**

```ts
export function splitIntoChunks(content: string, paragraphLimit = 4): string[] {
  const paragraphs = String(content || '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (let i = 0; i < paragraphs.length; i += paragraphLimit) {
    chunks.push(paragraphs.slice(i, i + paragraphLimit).join('\n\n'));
  }
  return chunks;
}
```

```ts
function buildChunkLabels(memory: any = {}): string[] {
  return [
    ...(memory.entities?.characters || []),
    ...(memory.entities?.locations || []),
    ...(memory.entities?.items || []),
    ...(memory.entities?.organizations || []),
  ].filter(Boolean);
}
```

- [ ] **Step 4: Implement rebuild and vector sync**

```ts
export async function rebuildForChapter(chapterId: number, signal?: AbortSignal): Promise<void> {
  const chapter = await Chapter.findByPk(chapterId);
  if (!chapter?.content) return;

  const memory = await chapterMemoryService.findByChapterId(chapterId);
  const chunks = splitIntoChunks(chapter.content);
  const embeddings = await embedTexts(chunks);

  await ChapterChunk.destroy({ where: { chapter_id: chapterId } });

  for (let index = 0; index < chunks.length; index += 1) {
    const row = await ChapterChunk.create({
      novel_id: chapter.novel_id,
      chapter_id: chapter.id,
      chapter_number: chapter.chapter_number,
      chunk_index: index,
      text: chunks[index],
      labels: JSON.stringify(buildChunkLabels(memory)),
      embedding: JSON.stringify(embeddings[index] || []),
      content_hash: chapterMemoryService.buildContentHash(chapter.content),
    });
    upsertChapterChunkVector(row.id, embeddings[index] || []);
  }
}
```

- [ ] **Step 5: Trigger rebuild after memory upsert**

```ts
const created = await ChapterMemory.create(payload);
await chapterChunkService.rebuildForChapter(chapterId, signal);
return deserializeMemory(created);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test test/chapter-chunk-service.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/chapterChunkService.ts backend/src/services/chapterMemoryService.ts backend/test/chapter-chunk-service.test.js
git commit -m "feat: add chapter chunk indexing"
```

### Task 4: Add story bible storage and vector indexing

**Files:**
- Create: `backend/src/services/storyBibleService.ts`
- Create: `backend/src/routes/storyBible.ts`
- Modify: `backend/src/index.ts`
- Create: `backend/test/story-bible-service.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

test('normalizeStoryBibleEntry applies defaults', async () => {
  const service = await import('../src/services/storyBibleService');
  const entry = service.normalizeStoryBibleEntry({ title: '人物规则', content: '沈青衫不可失忆' });
  assert.equal(entry.priority, 100);
  assert.equal(entry.type, 'world_rule');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/story-bible-service.test.js`
Expected: FAIL because the service file does not exist.

- [ ] **Step 3: Implement story bible service**

```ts
export function normalizeStoryBibleEntry(entry: any = {}) {
  return {
    type: entry.type || 'world_rule',
    title: entry.title || '未命名条目',
    content: entry.content || '',
    labels: Array.isArray(entry.labels) ? entry.labels : [],
    priority: Number.isFinite(entry.priority) ? entry.priority : 100,
  };
}
```

```ts
export async function createEntry(data: any): Promise<any> {
  const normalized = normalizeStoryBibleEntry(data);
  const embedding = await embedText([normalized.title, normalized.content].join('\n'));
  const row = await StoryBibleEntry.create({
    novel_id: data.novel_id,
    type: normalized.type,
    title: normalized.title,
    content: normalized.content,
    labels: JSON.stringify(normalized.labels),
    embedding: JSON.stringify(embedding),
    priority: normalized.priority,
  });
  upsertStoryBibleVector(row.id, embedding);
  return deserializeEntry(row);
}
```

- [ ] **Step 4: Add CRUD routes**

```ts
router.get('/novels/:novelId/story-bible', async (req, res) => {
  res.json(await storyBibleService.listByNovelId(Number(req.params.novelId)));
});

router.post('/novels/:novelId/story-bible', async (req, res) => {
  res.json(await storyBibleService.createEntry({ ...req.body, novel_id: Number(req.params.novelId) }));
});
```

- [ ] **Step 5: Mount the route**

```ts
app.use('/api', storyBibleRouter);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test test/story-bible-service.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/storyBibleService.ts backend/src/routes/storyBible.ts backend/src/index.ts backend/test/story-bible-service.test.js
git commit -m "feat: add story bible vector storage"
```

### Task 5: Build RAG retrieval context service

**Files:**
- Create: `backend/src/services/ragService.ts`
- Modify: `backend/src/services/reviewContextService.ts`
- Create: `backend/test/rag-service.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

test('buildQueryText combines chapter focus and memory facts', async () => {
  const service = await import('../src/services/ragService');
  const text = service.buildQueryText({
    chapter: { title: '夜渡寒江', content: '' },
    architecture: { plot_outline: '潜入敌营' },
    currentMemory: { facts: [{ subject: '沈青衫', predicate: '受伤', object: '左臂' }] },
  });
  assert.match(text, /夜渡寒江/);
  assert.match(text, /潜入敌营/);
  assert.match(text, /沈青衫/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/rag-service.test.js`
Expected: FAIL because the service file does not exist.

- [ ] **Step 3: Implement query construction and vector recall**

```ts
export function buildQueryText(input: any = {}): string {
  const facts = (input.currentMemory?.facts || [])
    .map((fact: any) => `${fact.subject || ''} ${fact.predicate || ''} ${fact.object || ''}`.trim())
    .join('\n');

  return [
    input.chapter?.title || '',
    input.architecture?.plot_outline || '',
    input.userPrompt || '',
    facts,
  ].filter(Boolean).join('\n');
}
```

```ts
export async function buildRetrievalContext(chapterId: number, options: any = {}): Promise<any> {
  const reviewContext = await reviewContextService.buildReviewContext(chapterId, options.signal, options.preloaded || {});
  const queryText = buildQueryText({
    chapter: reviewContext.currentChapter,
    architecture: reviewContext.architecture,
    currentMemory: reviewContext.currentMemory,
    userPrompt: options.userPrompt || '',
  });

  const queryEmbedding = await embedText(queryText);
  const retrievedChunks = await chapterChunkService.findRelevantChunks(reviewContext.currentChapter.novel_id, queryEmbedding, {
    excludeChapterId: reviewContext.currentChapter.id,
    limit: 6,
  });
  const storyBibleEntries = await storyBibleService.findRelevantEntries(reviewContext.currentChapter.novel_id, queryEmbedding, {
    limit: 6,
  });

  return {
    ...reviewContext,
    retrievedChunks,
    storyBibleEntries,
    queryText,
  };
}
```

- [ ] **Step 4: Keep reviewContextService backward compatible**

```ts
export async function buildReviewContext(...) {
  // keep the current shape and behavior intact for existing callers
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/rag-service.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/ragService.ts backend/src/services/reviewContextService.ts backend/test/rag-service.test.js
git commit -m "feat: add hybrid rag retrieval service"
```

### Task 6: Inject RAG context into chapter generation

**Files:**
- Modify: `backend/src/services/aiService.ts`
- Modify: `backend/src/ai/graphs/chapterGenerationGraph.ts`
- Create: `backend/test/chapter-generation-rag-prompt.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';

test('buildChapterPrompt renders story bible and retrieved chunks', async () => {
  const mod = await import('../src/services/aiService');
  const prompt = mod.buildChapterPrompt(
    { title: '江湖夜雨', genre: '武侠' },
    { title: '第十章', plot_outline: '夜探密室' },
    null,
    null,
    null,
    [],
    '',
    {
      storyBibleEntries: [{ type: 'world_rule', title: '门规', content: '玄铁令不可离身', priority: 100 }],
      retrievedChunks: [{ chapterNumber: 3, text: '沈青衫左臂旧伤未愈。' }],
      relevantMemories: [],
    }
  );

  assert.match(prompt, /故事圣经硬约束/);
  assert.match(prompt, /玄铁令不可离身/);
  assert.match(prompt, /历史原文证据/);
  assert.match(prompt, /左臂旧伤未愈/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node -r ts-node/register --test test/chapter-generation-rag-prompt.test.js`
Expected: FAIL because `buildChapterPrompt` does not accept retrieval context yet.

- [ ] **Step 3: Extend prompt builder**

```ts
function formatStoryBibleEntries(entries: any[] = []): string {
  if (!entries.length) return '';
  return [
    '## 故事圣经硬约束',
    ...entries.map((entry: any) => `- [${entry.type}] ${entry.title}：${entry.content}`),
  ].join('\n');
}

function formatRetrievedChunks(chunks: any[] = []): string {
  if (!chunks.length) return '';
  return [
    '## 历史原文证据',
    ...chunks.map((chunk: any) => `### 第${chunk.chapterNumber || '?'}章\n${chunk.text}`),
  ].join('\n\n');
}
```

```ts
function buildChapterPrompt(..., retrievalContext: any = {}): string {
  const storyBibleSection = formatStoryBibleEntries(retrievalContext.storyBibleEntries);
  const chunkSection = formatRetrievedChunks(retrievalContext.retrievedChunks);
  // inject sections before current chapter architecture block
}
```

- [ ] **Step 4: Call ragService from generation graph**

```ts
const retrievalContext = await ragService.buildRetrievalContext(Number(state.chapterId), {
  signal: state.signal,
  userPrompt: state.userPrompt || '',
  preloaded: { chapter, novel, architecture },
});

const prompt = buildChapterPrompt(
  novel,
  architecture || chapter,
  volumeArch,
  fullArch,
  prevChapterContent,
  volumeChapterArchs,
  state.userPrompt || '',
  retrievalContext,
);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node -r ts-node/register --test test/chapter-generation-rag-prompt.test.js`
Expected: PASS

- [ ] **Step 6: Verify build and targeted tests**

Run: `node -r ts-node/register --test test/chapter-generation-rag-prompt.test.js test/chapter-tune-graph.test.ts test/chapter-service-tune.test.js`
Expected: PASS

Run: `npm run build`
Expected: Known unrelated TypeScript issues may remain; any new RAG-related errors must be fixed before stopping.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/aiService.ts backend/src/ai/graphs/chapterGenerationGraph.ts backend/test/chapter-generation-rag-prompt.test.js
git commit -m "feat: inject rag context into chapter generation"
```

### Task 7: Self-check and docs touch-up

**Files:**
- Modify: `docs/superpowers/specs/2026-04-24-hybrid-rag-design.md`

- [ ] **Step 1: Re-read the spec and confirm coverage**

Run: `sed -n '1,260p' docs/superpowers/specs/2026-04-24-hybrid-rag-design.md`
Expected: Every Phase 1 and Phase 2 requirement maps to Tasks 1-6 above.

- [ ] **Step 2: Note intentional deferrals**

```md
- Review / revision / tune graph integration stays for the next implementation slice.
- Frontend story bible editor stays out of this first pass.
```

- [ ] **Step 3: Run whitespace check**

Run: `git diff --check`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-04-24-hybrid-rag-design.md
git commit -m "docs: clarify sqlite-vec rag implementation slice"
```
