import { Router, Request, Response } from 'express';
import * as chapterService from '../services/chapterService';

const router = Router({ mergeParams: true });

router.post('/:id/revise', async (req: Request, res: Response) => {
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('[abort] 客户端断开 → chapter/revise 已中止');
      ac.abort();
    }
  });
  try {
    (req as any).setTimeout(0);
    const { reviewResult } = req.body;
    const result = await chapterService.reviseChapter(String(req.params.id), reviewResult, ac.signal);
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
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('[abort] 客户端断开 → chapter/generate 已中止');
      ac.abort();
    }
  });
  try {
    (req as any).setTimeout(0);
    const result = await chapterService.generate(String(req.params.id), ac.signal);
    res.json(result);
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;