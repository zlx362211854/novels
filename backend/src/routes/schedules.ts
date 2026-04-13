import { Router, Request, Response } from 'express';
import * as scheduleService from '../services/scheduleService';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
    try {
        const tasks = await scheduleService.getTasks();
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

router.post('/', async (req: Request, res: Response) => {
    try {
        const { novelId, chapterId, taskType, scheduledTime } = req.body;
        const task = await scheduleService.createTask({
            novelId: Number(novelId),
            chapterId: chapterId ? Number(chapterId) : undefined,
            taskType,
            scheduledTime: new Date(scheduledTime)
        });
        res.status(201).json(task);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

router.delete('/:id', async (req: Request, res: Response) => {
    try {
        await scheduleService.deleteTask(Number(req.params.id));
        res.json({ message: '删除成功' });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

export default router;