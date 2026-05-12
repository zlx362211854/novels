# 小说导出导入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为现有项目增加单本小说的 JSON 导出与导入能力，支持跨环境迁移一部小说的核心创作数据。

**Architecture:** 后端新增一个独立的 `novelTransferService` 负责构建导出 bundle、校验导入 bundle、在事务内重建小说及其关联数据；路由层在现有 `novels` 路由中新增导出/导入接口。前端仅增加两个轻量入口：小说详情页导出 JSON、小说列表页上传 JSON 并导入为新副本。

**Tech Stack:** Node.js, TypeScript, Express, Sequelize, SQLite, React, Axios

---

## File Structure

### Backend

- Create: `backend/src/services/novelTransferService.ts`
  - 负责导出 bundle、校验 bundle、导入事务、ID 映射、重建关联
- Modify: `backend/src/routes/novels.ts`
  - 增加 `GET /:id/export-json`
  - 增加 `POST /import-json`
- Modify: `backend/src/models/sequelize.ts`
  - 仅在需要时补充导入逻辑所需模型导出或字段访问便利性

### Frontend

- Modify: `frontend/src/services/api.js`
  - 增加 JSON 导出与导入 API
- Modify: `frontend/src/pages/NovelDetail.jsx`
  - 增加 `导出 JSON` 按钮与下载逻辑
- Modify: `frontend/src/pages/NovelList.jsx`
  - 增加 `导入小说` 按钮、上传弹窗、导入成功后刷新与跳转

### Docs

- This plan only. No additional spec changes expected unless implementation uncovers a spec contradiction.

## Constraints

- 不新增自动化单元测试
- 不导入 `scheduled_tasks`
- 不导入任何 `sqlite-vec` 向量数据
- 导入策略固定为“创建新小说副本”，不支持覆盖或合并
- 导入时忽略原始主键与时间戳

## Task 1: 实现后端导出/导入服务骨架

**Files:**
- Create: `backend/src/services/novelTransferService.ts`

- [ ] **Step 1: 创建服务文件与导出类型定义**

在 `backend/src/services/novelTransferService.ts` 建立基础类型和导出接口，包含：

```ts
import { sequelize, Novel, Architecture, Chapter, ChapterVersion, ChapterMemory, StoryBibleEntry } from '../models/sequelize';

interface NovelExportBundle {
  version: number;
  exportedAt: string;
  source: {
    app: string;
  };
  novel: any;
  architectures: any[];
  chapters: any[];
  chapterVersions: any[];
  chapterMemories: any[];
  storyBibleEntries: any[];
}

function toPlain<T extends { toJSON?: () => any }>(record: T | null): any {
  if (!record) return null;
  return typeof record.toJSON === 'function' ? record.toJSON() : record;
}

export type { NovelExportBundle };
```

- [ ] **Step 2: 实现导出入口函数声明**

在同一文件中加入导出函数骨架：

```ts
async function exportNovelBundle(novelId: number): Promise<NovelExportBundle> {
  throw new Error('not implemented');
}

async function importNovelBundle(bundle: NovelExportBundle): Promise<{ novelId: number; title: string }> {
  throw new Error('not implemented');
}
```

- [ ] **Step 3: 导出服务模块接口**

在文件底部导出服务接口：

```ts
export {
  exportNovelBundle,
  importNovelBundle,
};
```

- [ ] **Step 4: 运行 TypeScript 构建确认骨架可编译**

Run: `npm run build`

Workdir: `/Users/linkzhao/workspace/AI/books_manage/backend`

Expected: build 成功，只有服务仍未接入业务实现，不应有类型错误

## Task 2: 实现小说导出 bundle 构建

**Files:**
- Modify: `backend/src/services/novelTransferService.ts`

- [ ] **Step 1: 实现按小说读取核心记录**

在 `exportNovelBundle` 中读取小说及关联实体：

```ts
const novel = await Novel.findByPk(novelId);
if (!novel) {
  throw new Error('小说不存在');
}

const architectures = await Architecture.findAll({
  where: { novel_id: novelId },
  order: [['id', 'ASC']],
});

const chapters = await Chapter.findAll({
  where: { novel_id: novelId },
  order: [['chapter_number', 'ASC'], ['id', 'ASC']],
});

const chapterIds = chapters.map((item: any) => Number(item.id));
const chapterVersions = chapterIds.length
  ? await ChapterVersion.findAll({
      where: { chapter_id: chapterIds },
      order: [['chapter_id', 'ASC'], ['version_number', 'ASC']],
    })
  : [];

const chapterMemories = chapterIds.length
  ? await ChapterMemory.findAll({
      where: { chapter_id: chapterIds },
      order: [['chapter_id', 'ASC']],
    })
  : [];

const storyBibleEntries = await StoryBibleEntry.findAll({
  where: { novel_id: novelId },
  order: [['id', 'ASC']],
});
```

- [ ] **Step 2: 组装 bundle 并返回**

将读取结果转为 plain JSON 并返回：

```ts
return {
  version: 1,
  exportedAt: new Date().toISOString(),
  source: {
    app: 'NovelForge',
  },
  novel: toPlain(novel),
  architectures: architectures.map(toPlain),
  chapters: chapters.map(toPlain),
  chapterVersions: chapterVersions.map(toPlain),
  chapterMemories: chapterMemories.map(toPlain),
  storyBibleEntries: storyBibleEntries.map(toPlain),
};
```

- [ ] **Step 3: 确认未引入定时任务与向量数据**

检查 `exportNovelBundle` 中没有读取以下模型或表：

```text
ScheduledTask
story_bible_entry_vectors
chapter_chunk_vectors
```

Expected: 导出只包含 spec 中定义的 6 类数据

- [ ] **Step 4: 运行后端构建验证**

Run: `npm run build`

Workdir: `/Users/linkzhao/workspace/AI/books_manage/backend`

Expected: build 成功

## Task 3: 实现导入 bundle 校验与标题去重

**Files:**
- Modify: `backend/src/services/novelTransferService.ts`

- [ ] **Step 1: 增加 bundle 基础校验函数**

在服务中加入：

```ts
function assertBundleShape(bundle: any): asserts bundle is NovelExportBundle {
  if (!bundle || typeof bundle !== 'object') {
    throw new Error('导入文件不是合法 JSON 对象');
  }
  if (bundle.version !== 1) {
    throw new Error('导入文件版本不受支持');
  }
  if (!bundle.novel || typeof bundle.novel !== 'object') {
    throw new Error('导入文件缺少 novel 字段');
  }
  if (!Array.isArray(bundle.architectures)) {
    throw new Error('导入文件缺少 architectures 数组');
  }
  if (!Array.isArray(bundle.chapters)) {
    throw new Error('导入文件缺少 chapters 数组');
  }
  if (!Array.isArray(bundle.chapterVersions)) {
    throw new Error('导入文件缺少 chapterVersions 数组');
  }
  if (!Array.isArray(bundle.chapterMemories)) {
    throw new Error('导入文件缺少 chapterMemories 数组');
  }
  if (!Array.isArray(bundle.storyBibleEntries)) {
    throw new Error('导入文件缺少 storyBibleEntries 数组');
  }
}
```

- [ ] **Step 2: 增加导入标题生成函数**

在服务中增加导入标题去重逻辑：

```ts
async function buildImportedTitle(baseTitle: string): Promise<string> {
  const normalized = `${baseTitle || '未命名小说'}（导入）`;
  let candidate = normalized;
  let index = 2;

  while (await Novel.findOne({ where: { title: candidate } })) {
    candidate = `${normalized.slice(0, -1)} ${index}）`;
    index += 1;
  }

  return candidate;
}
```

- [ ] **Step 3: 在 importNovelBundle 开头接入校验**

在 `importNovelBundle` 开头接入：

```ts
assertBundleShape(bundle);
const importedTitle = await buildImportedTitle(String(bundle.novel.title || '未命名小说'));
```

- [ ] **Step 4: 运行后端构建验证**

Run: `npm run build`

Workdir: `/Users/linkzhao/workspace/AI/books_manage/backend`

Expected: build 成功

## Task 4: 实现导入事务与 novel/architecture 重建

**Files:**
- Modify: `backend/src/services/novelTransferService.ts`

- [ ] **Step 1: 在事务内创建新小说**

在 `importNovelBundle` 中使用事务：

```ts
return await sequelize.transaction(async (transaction) => {
  const createdNovel = await Novel.create(
    {
      title: importedTitle,
      description: bundle.novel.description || null,
      genre: bundle.novel.genre || null,
      publish_config: bundle.novel.publish_config || null,
      ai_config: bundle.novel.ai_config || null,
    },
    { transaction }
  );
```

- [ ] **Step 2: 建立 architecture 映射并按顺序重建**

在事务中建立映射：

```ts
  const architectureIdMap = new Map<number, number>();

  for (const item of bundle.architectures) {
    const created = await Architecture.create(
      {
        novel_id: Number(createdNovel.id),
        level: item.level,
        parent_id: item.parent_id ? architectureIdMap.get(Number(item.parent_id)) ?? null : null,
        title: item.title,
        plot_outline: item.plot_outline || null,
        characters: item.characters || null,
        world_setting: item.world_setting || null,
        emotional_tone: item.emotional_tone || null,
        metadata: item.metadata || null,
      },
      { transaction }
    );

    architectureIdMap.set(Number(item.id), Number(created.id));
  }
```

- [ ] **Step 3: 返回事务作用域占位结果**

先在事务内返回一个占位结果，供后续章节任务继续扩展：

```ts
  return {
    createdNovel,
    architectureIdMap,
  };
});
```

然后在函数外层临时调整为：

```ts
const imported = await sequelize.transaction(...);
return {
  novelId: Number(imported.createdNovel.id),
  title: imported.createdNovel.title,
};
```

- [ ] **Step 4: 运行后端构建验证**

Run: `npm run build`

Workdir: `/Users/linkzhao/workspace/AI/books_manage/backend`

Expected: build 成功

## Task 5: 实现 chapters、chapter versions、memory、story bible 重建

**Files:**
- Modify: `backend/src/services/novelTransferService.ts`

- [ ] **Step 1: 在事务内重建章节并维护 chapter 映射**

扩展事务中的导入逻辑：

```ts
const chapterIdMap = new Map<number, number>();

for (const item of bundle.chapters) {
  const created = await Chapter.create(
    {
      novel_id: Number(createdNovel.id),
      architecture_id: item.architecture_id ? architectureIdMap.get(Number(item.architecture_id)) ?? null : null,
      chapter_number: item.chapter_number,
      title: item.title || null,
      content: item.content || null,
      review_result: item.review_result || null,
      publish_result: item.publish_result || null,
      status: item.status || 'draft',
    },
    { transaction }
  );

  chapterIdMap.set(Number(item.id), Number(created.id));
}
```

- [ ] **Step 2: 重建章节版本**

继续在事务中加入：

```ts
for (const item of bundle.chapterVersions) {
  const mappedChapterId = chapterIdMap.get(Number(item.chapter_id));
  if (!mappedChapterId) continue;

  await ChapterVersion.create(
    {
      chapter_id: mappedChapterId,
      version_number: item.version_number,
      content: item.content || '',
    },
    { transaction }
  );
}
```

- [ ] **Step 3: 重建章节记忆卡**

加入：

```ts
for (const item of bundle.chapterMemories) {
  const mappedChapterId = chapterIdMap.get(Number(item.chapter_id));
  if (!mappedChapterId) continue;

  await ChapterMemory.create(
    {
      chapter_id: mappedChapterId,
      summary: item.summary || null,
      key_events: item.key_events || null,
      entities: item.entities || null,
      facts: item.facts || null,
      state_changes: item.state_changes || null,
      open_threads: item.open_threads || null,
      content_hash: item.content_hash || '',
    },
    { transaction }
  );
}
```

- [ ] **Step 4: 重建故事圣经条目**

加入：

```ts
for (const item of bundle.storyBibleEntries) {
  await StoryBibleEntry.create(
    {
      novel_id: Number(createdNovel.id),
      type: item.type,
      title: item.title,
      content: item.content || '',
      priority: item.priority ?? 0,
      labels: item.labels || null,
    },
    { transaction }
  );
}
```

- [ ] **Step 5: 收敛事务最终返回值**

将事务返回值收敛为：

```ts
return {
  novelId: Number(createdNovel.id),
  title: createdNovel.title,
};
```

并删除 Task 4 中的临时占位结构。

- [ ] **Step 6: 运行后端构建验证**

Run: `npm run build`

Workdir: `/Users/linkzhao/workspace/AI/books_manage/backend`

Expected: build 成功

## Task 6: 暴露后端导出/导入接口

**Files:**
- Modify: `backend/src/routes/novels.ts`

- [ ] **Step 1: 引入 transfer service**

在文件顶部加入：

```ts
import * as novelTransferService from '../services/novelTransferService';
```

- [ ] **Step 2: 新增导出 JSON 路由**

在现有 `/export` 路由附近增加：

```ts
router.get('/:id/export-json', async (req: Request, res: Response) => {
  try {
    const novelId = Number(req.params.id);
    const result = await novelTransferService.exportNovelBundle(novelId);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=novel-${novelId}-export.json`);
    res.json(result);
  } catch (error) {
    const message = (error as Error).message;
    const status = message === '小说不存在' ? 404 : 500;
    res.status(status).json({ error: message });
  }
});
```

- [ ] **Step 3: 新增导入 JSON 路由**

在 `GET /` 和 `POST /bootstrap` 之后增加：

```ts
router.post('/import-json', async (req: Request, res: Response) => {
  try {
    const { bundle } = req.body;
    const result = await novelTransferService.importNovelBundle(bundle);
    res.status(201).json(result);
  } catch (error) {
    const message = (error as Error).message;
    const status =
      /不是合法 JSON|缺少|版本不受支持/.test(message) ? 400 : 500;
    res.status(status).json({ error: message });
  }
});
```

- [ ] **Step 4: 运行后端构建验证**

Run: `npm run build`

Workdir: `/Users/linkzhao/workspace/AI/books_manage/backend`

Expected: build 成功

## Task 7: 接入前端 API 与小说详情页导出按钮

**Files:**
- Modify: `frontend/src/services/api.js`
- Modify: `frontend/src/pages/NovelDetail.jsx`

- [ ] **Step 1: 在 API 层增加 JSON 导出和导入方法**

在 `api.js` 中扩展：

```js
export const novelApi = {
  getAll: () => api.get('/novels'),
  getById: (id) => api.get(`/novels/${id}`),
  create: (data) => api.post('/novels', data),
  bootstrap: (data) => api.post('/novels/bootstrap', data),
  importJson: (bundle) => api.post('/novels/import-json', { bundle }),
  update: (id, data) => api.put(`/novels/${id}`, data),
  delete: (id) => api.delete(`/novels/${id}`),
};

export const exportApi = {
  exportNovel: (id, scope = 'full', volumeId = null) => {
    ...
  },
  exportNovelJson: (id) =>
    api.get(`/novels/${id}/export-json`, {
      responseType: 'json',
    }),
};
```

- [ ] **Step 2: 在小说详情页增加导出 JSON 的处理函数**

在 `NovelDetail.jsx` 中加入：

```js
const handleExportJson = async () => {
  setExporting(true);
  try {
    const res = await exportApi.exportNovelJson(id);
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${novel.title}.json`;
    a.click();
    URL.revokeObjectURL(url);
    feedback.success('已导出 JSON 文件。');
  } catch (error) {
    console.error('导出 JSON 失败:', error);
    feedback.error(error.response?.data?.error || '导出失败，请稍后再试。');
  } finally {
    setExporting(false);
  }
};
```

- [ ] **Step 3: 在详情页操作区增加导出 JSON 按钮**

在现有 `导出` 按钮旁边加入：

```jsx
<Button variant="outline" size="sm" onClick={handleExportJson} disabled={exporting}>
  {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
  导出 JSON
</Button>
```

- [ ] **Step 4: 运行前端构建验证**

Run: `npm run build`

Workdir: `/Users/linkzhao/workspace/AI/books_manage/frontend`

Expected: build 成功

## Task 8: 实现小说列表页导入入口与弹窗

**Files:**
- Modify: `frontend/src/pages/NovelList.jsx`

- [ ] **Step 1: 增加导入状态与文件状态**

在 `NovelList.jsx` 的状态区加入：

```js
const [showImport, setShowImport] = useState(false);
const [importing, setImporting] = useState(false);
const [importFile, setImportFile] = useState(null);
```

- [ ] **Step 2: 增加导入处理函数**

在组件中加入：

```js
const handleImport = async () => {
  if (!importFile) {
    feedback.warning('请先选择导出的 JSON 文件。');
    return;
  }

  setImporting(true);
  try {
    const text = await importFile.text();
    const bundle = JSON.parse(text);
    const res = await novelApi.importJson(bundle);
    feedback.success('小说已导入。');
    setShowImport(false);
    setImportFile(null);
    await loadNovels();
    navigate(`/novels/${res.data.novelId}`);
  } catch (error) {
    console.error('导入小说失败:', error);
    if (error instanceof SyntaxError) {
      feedback.error('选择的文件不是合法 JSON。');
    } else {
      feedback.error(error.response?.data?.error || '导入失败，请稍后再试。');
    }
  } finally {
    setImporting(false);
  }
};
```

- [ ] **Step 3: 在列表页操作区增加导入按钮**

在 `actions` 区域加入：

```jsx
<Button variant="outline" onClick={() => setShowImport(true)}>
  导入小说
</Button>
```

- [ ] **Step 4: 增加导入弹窗 UI**

在页面底部加入一个轻量对话框，复用现有 `Dialog` 组件模式。如果当前文件没有引入 `Dialog` 相关组件，按项目现有弹窗风格添加：

```jsx
{showImport && (
  <Dialog open={showImport} onOpenChange={setShowImport}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>导入小说</DialogTitle>
        <DialogDescription>上传之前导出的 JSON 文件，系统会创建一部新的小说副本。</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <input
          type="file"
          accept="application/json,.json"
          onChange={(event) => setImportFile(event.target.files?.[0] || null)}
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => setShowImport(false)} disabled={importing}>
          取消
        </Button>
        <Button onClick={handleImport} disabled={importing}>
          {importing ? '导入中...' : '开始导入'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
)}
```

- [ ] **Step 5: 导入成功后清理状态**

在成功与取消路径上确保：

```js
setImportFile(null);
setShowImport(false);
```

Expected: 关闭弹窗后不会保留旧文件选择状态

- [ ] **Step 6: 运行前端构建验证**

Run: `npm run build`

Workdir: `/Users/linkzhao/workspace/AI/books_manage/frontend`

Expected: build 成功

## Task 9: 手工验证导出导入主流程

**Files:**
- No file changes

- [ ] **Step 1: 启动后端并验证导出接口**

Run: `npm run dev`

Workdir: `/Users/linkzhao/workspace/AI/books_manage/backend`

Then request:

```bash
curl -s http://127.0.0.1:3001/api/novels/1/export-json | head
```

Expected: 返回包含 `version`、`novel`、`architectures`、`chapters` 等字段的 JSON

- [ ] **Step 2: 使用导出结果回灌导入接口**

先保存导出结果，再导入：

```bash
curl -s http://127.0.0.1:3001/api/novels/1/export-json > /tmp/novel-export.json
curl -s -X POST http://127.0.0.1:3001/api/novels/import-json \
  -H 'Content-Type: application/json' \
  --data-binary @<(jq -n --argfile bundle /tmp/novel-export.json '{bundle:$bundle}')
```

Expected: 返回新的 `novelId` 和带 `（导入）` 后缀的标题

- [ ] **Step 3: 在前端验证按钮与弹窗**

Run: `npm run dev`

Workdir: `/Users/linkzhao/workspace/AI/books_manage/frontend`

Manual checks:

- 小说详情页能看到 `导出 JSON`
- 点击后能下载 `.json`
- 小说列表页能看到 `导入小说`
- 选中刚下载的文件后可导入
- 导入成功后跳到新小说详情页

- [ ] **Step 4: 记录验证结果**

在最终汇报中明确说明：

- 后端构建是否通过
- 前端构建是否通过
- 手工导出导入是否完成
- 如果没有完成哪一步，缺口在哪里

## Self-Review

- Spec coverage: 覆盖了 spec 中的后端导出、后端导入、ID 映射、前端导出入口、前端导入入口、不导定时任务、不导向量数据、导入为新副本
- Placeholder scan: 无 `TODO`、`TBD`、空任务描述；命令与代码块均已给出
- Type consistency: `exportNovelBundle` / `importNovelBundle`、`exportNovelJson` / `importJson`、`GET /:id/export-json` / `POST /import-json` 在计划中保持一致
