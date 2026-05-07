import { Router, Request, Response } from 'express';
import * as storyBibleService from '../services/storyBibleService';

const router = Router({ mergeParams: true });

router.get('/', async (req: Request, res: Response) => {
  try {
    const entries = await storyBibleService.listEntries(String(req.params.novelId));
    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.get('/:entryId', async (req: Request, res: Response) => {
  try {
    const entry = await storyBibleService.getEntryById(String(req.params.novelId), String(req.params.entryId));
    if (!entry) {
      return res.status(404).json({ error: '故事圣经条目不存在' });
    }

    res.json(entry);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const entry = await storyBibleService.createEntry({
      novelId: Number(req.params.novelId),
      type: req.body.type,
      title: req.body.title,
      content: req.body.content,
      priority: req.body.priority,
      labels: req.body.labels,
    });
    res.status(201).json(entry);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.put('/:entryId', async (req: Request, res: Response) => {
  try {
    const entry = await storyBibleService.updateEntry(String(req.params.novelId), String(req.params.entryId), {
      type: req.body.type,
      title: req.body.title,
      content: req.body.content,
      priority: req.body.priority,
      labels: req.body.labels,
    });

    if (!entry) {
      return res.status(404).json({ error: '故事圣经条目不存在' });
    }

    res.json(entry);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.delete('/:entryId', async (req: Request, res: Response) => {
  try {
    const deleted = await storyBibleService.deleteEntry(String(req.params.novelId), String(req.params.entryId));
    if (!deleted) {
      return res.status(404).json({ error: '故事圣经条目不存在' });
    }

    res.json({ message: '删除成功' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
