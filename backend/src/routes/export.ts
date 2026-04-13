import { Router, Request, Response } from 'express';
import * as exportService from '../services/exportService';

const router = Router();

router.get('/novel/:novelId', async (req: Request, res: Response) => {
  try {
    const novelId = Number(req.params.novelId);
    const format = req.query.format as string || 'txt';
    const result = await exportService.exportNovel(novelId, format);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=novel.${format === 'json' ? 'json' : 'txt'}`);
    res.send(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/chapter/:chapterId', async (req: Request, res: Response) => {
  try {
    const chapterId = Number(req.params.chapterId);
    const result = await exportService.exportChapterContent(chapterId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;