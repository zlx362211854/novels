import { Router, Request, Response } from 'express';
import { setMaxListeners } from 'events';
import * as chapterService from '../services/chapterService';
import * as chapterMemoryService from '../services/chapterMemoryService';
import { ChapterMemory } from '../models/sequelize';
import * as aiStatus from '../services/aiStatusService';

const router = Router({ mergeParams: true });

router.post('/:id/revise', async (req: Request, res: Response) => {
  const ac = new AbortController();
  setMaxListeners(30, ac.signal);
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('[abort] 客户端断开 → chapter/revise 已中止');
      ac.abort();
    }
  });
  try {
    (req as any).setTimeout(0);
    const { reviewResult, userPrompt } = req.body;
    const result = await chapterService.reviseChapter(
      String(req.params.id),
      reviewResult,
      typeof userPrompt === 'string' ? userPrompt : '',
      ac.signal
    );
    res.json(result);
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/:id/tune', async (req: Request, res: Response) => {
  const ac = new AbortController();
  setMaxListeners(30, ac.signal);
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('[abort] 客户端断开 → chapter/tune 已中止');
      ac.abort();
    }
  });
  try {
    (req as any).setTimeout(0);
    const { userPrompt } = req.body;
    const result = await chapterService.tuneChapter(
      String(req.params.id),
      typeof userPrompt === 'string' ? userPrompt : '',
      ac.signal
    );
    res.json(result);
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const chapter = await chapterService.findById(String(req.params.id));
    if (!chapter) {
      return res.status(404).json({ error: '章节不存在' });
    }
    res.json(chapter);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { title, content, status, architectureId, regenerateMemory = true } = req.body;
    const chapter = await chapterService.update(
      String(req.params.id),
      { title, content, status, architectureId: architectureId ? Number(architectureId) : undefined },
      { regenerateMemory }
    );
    if (!chapter) {
      return res.status(404).json({ error: '章节不存在' });
    }
    res.json(chapter);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await chapterService.delete(String(req.params.id));
    if (!deleted) {
      return res.status(404).json({ error: '章节不存在' });
    }
    res.json({ message: '删除成功' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/:id/versions', async (req: Request, res: Response) => {
  try {
    const versions = await chapterService.getVersions(String(req.params.id));
    res.json(versions);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/:id/versions/:versionNumber/restore', async (req: Request, res: Response) => {
  try {
    const chapter = await chapterService.restoreVersion(
      String(req.params.id),
      parseInt(String(req.params.versionNumber))
    );
    if (!chapter) {
      return res.status(404).json({ error: '版本不存在' });
    }
    res.json(chapter);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/:id/review', async (req: Request, res: Response) => {
  const ac = new AbortController();
  setMaxListeners(30, ac.signal);
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('[abort] 客户端断开 → chapter/review 已中止');
      ac.abort();
    }
  });
  try {
    (req as any).setTimeout(0);
    const result = await chapterService.reviewChapter(String(req.params.id), ac.signal);
    res.json(result);
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/:id/generate', async (req: Request, res: Response) => {
  try {
    (req as any).setTimeout(0);
    const { userPrompt } = req.body;
    const taskId = `generate-${req.params.id}-${Date.now()}`;

    void chapterService
      .generate(
        String(req.params.id),
        undefined,
        typeof userPrompt === 'string' ? userPrompt : '',
        taskId
      )
      .catch((error) => {
        console.error(`[chapter-generate] 后台任务失败 taskId=${taskId} chapterId=${req.params.id}`, error);
      });

    res.status(202).json({
      taskId,
      status: 'accepted',
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/generate-tasks/:taskId', async (req: Request, res: Response) => {
  const task = aiStatus.getTask(String(req.params.taskId));
  if (!task) {
    return res.status(404).json({ error: '任务不存在或已过期' });
  }
  res.json(task);
});

// GET /:id/memory — 获取章节记忆卡
router.get('/:id/memory', async (req: Request, res: Response) => {
  try {
    const memory = await chapterMemoryService.findByChapterId(Number(req.params.id));
    res.json(memory || null);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// PUT /:id/memory — 手动更新记忆卡字段
router.put('/:id/memory', async (req: Request, res: Response) => {
  try {
    const { summary, key_events, entities, facts, state_changes, open_threads } = req.body;
    const record = await ChapterMemory.findOne({ where: { chapter_id: Number(req.params.id) } });
    if (!record) {
      return res.status(404).json({ error: '记忆卡不存在，请先生成章节正文' });
    }
    const updates: any = {};
    if (summary !== undefined) updates.summary = summary;
    if (key_events !== undefined) updates.key_events = typeof key_events === 'string' ? key_events : JSON.stringify(key_events);
    if (entities !== undefined) updates.entities = typeof entities === 'string' ? entities : JSON.stringify(entities);
    if (facts !== undefined) updates.facts = typeof facts === 'string' ? facts : JSON.stringify(facts);
    if (state_changes !== undefined) updates.state_changes = typeof state_changes === 'string' ? state_changes : JSON.stringify(state_changes);
    if (open_threads !== undefined) updates.open_threads = typeof open_threads === 'string' ? open_threads : JSON.stringify(open_threads);
    await record.update(updates);
    const updated = await chapterMemoryService.findByChapterId(Number(req.params.id));
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// POST /:id/memory/regenerate — 重新 AI 提取记忆卡
router.post('/:id/memory/regenerate', async (req: Request, res: Response) => {
  const ac = new AbortController();
  const taskId = `memory-${req.params.id}-${Date.now()}`;
  setMaxListeners(30, ac.signal);
  res.on('close', () => { if (!res.writableEnded) ac.abort(); });
  try {
    (req as any).setTimeout(0);
    const chapter = await chapterService.findById(String(req.params.id));
    const chapterLabel = chapter?.title
      ? `提取「${chapter.title}」记忆卡`
      : `提取第${chapter?.chapter_number || req.params.id}章记忆卡`;
    aiStatus.start(taskId, chapterLabel, ['AI 提取记忆卡', '修复记忆卡结果']);
    // 清除 content_hash 强制重新提取
    const record = await ChapterMemory.findOne({ where: { chapter_id: Number(req.params.id) } });
    if (record) await record.update({ content_hash: '' });
    const memory = await chapterMemoryService.upsertForChapter(Number(req.params.id), ac.signal, { taskId });
    if (ac.signal.aborted) return;
    aiStatus.finish(taskId);
    res.json(memory);
  } catch (error) {
    if (ac.signal.aborted) return;
    aiStatus.error(taskId, (error as Error).message);
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
