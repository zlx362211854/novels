import { Router, Request, Response } from 'express';
import * as scheduleService from '../services/scheduleService';
import {
    findNovelForUser,
    getAuthUserId,
    requireChapterAccess,
} from '../services/accessControlService';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
    try {
        const tasks = await scheduleService.getTasks(getAuthUserId(req));
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

router.post('/', async (req: Request, res: Response) => {
    try {
        const { novelId, chapterId, taskType, scheduledTime } = req.body;
        const numericNovelId = Number(novelId);
        const novel = await findNovelForUser(numericNovelId, getAuthUserId(req));
        if (!novel) {
            return res.status(404).json({ error: '小说不存在' });
        }
        if (chapterId) {
            const chapter = await requireChapterAccess(req, res, Number(chapterId));
            if (!chapter) return;
            if (Number(chapter.novel_id) !== numericNovelId) {
                return res.status(400).json({ error: '章节不属于当前小说' });
            }
        }
        const task = await scheduleService.createTask({
            novelId: numericNovelId,
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
        const deleted = await scheduleService.deleteTask(Number(req.params.id), getAuthUserId(req));
        if (!deleted) {
            return res.status(404).json({ error: '任务不存在' });
        }
        res.json({ message: '删除成功' });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

export default router;
