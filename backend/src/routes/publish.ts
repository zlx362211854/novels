import { Router, Request, Response } from 'express';
import * as publishService from '../services/publishService';

const router = Router();

router.post('/:chapterId', async (req: Request, res: Response) => {
  const ac = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('[abort] 客户端断开 → publish 已中止');
      ac.abort();
    }
  });
  try {
    const { platforms, mode = 'publish' } = req.body;
    if (!Array.isArray(platforms) || !platforms.length) {
      return res.status(400).json({ error: '请选择至少一个发布平台' });
    }
    const result = await publishService.publishChapter(
      String(req.params.chapterId),
      platforms,
      ac.signal,
      mode
    );
    res.json(result);
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/login/:platform', async (req: Request, res: Response) => {
  try {
    const result = await publishService.openLoginBrowser(String(req.params.platform));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/status/:platform', async (req: Request, res: Response) => {
  try {
    const status = publishService.checkLoginStatus(String(req.params.platform));
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;