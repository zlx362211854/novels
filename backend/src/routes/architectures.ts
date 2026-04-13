import { Router, Request, Response } from 'express';
import * as architectureService from '../services/architectureService';

const router = Router();

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const architecture = await architectureService.findById(String(req.params.id));
    if (!architecture) {
      return res.status(404).json({ error: '架构不存在' });
    }
    res.json(architecture);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { title, plotOutline, characters, worldSetting, emotionalTone, metadata } = req.body;
    const architecture = await architectureService.update(String(req.params.id), {
      title,
      plotOutline,
      characters,
      worldSetting,
      emotionalTone,
      metadata
    });
    if (!architecture) {
      return res.status(404).json({ error: '架构不存在' });
    }
    res.json(architecture);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await architectureService.delete(String(req.params.id));
    if (!deleted) {
      return res.status(404).json({ error: '架构不存在' });
    }
    res.json({ message: '删除成功' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;