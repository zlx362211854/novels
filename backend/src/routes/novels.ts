import { Router, Request, Response } from 'express';
import * as novelService from '../services/novelService';
import * as chapterService from '../services/chapterService';
import * as architectureService from '../services/architectureService';
import * as architectureAiService from '../services/architectureAiService';
import * as architectureReviewService from '../services/architectureReviewService';
import { Novel, Chapter, Architecture } from '../models/sequelize';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
    try {
        const { title, description, genre } = req.body;
        if (!title) {
            return res.status(400).json({ error: '标题不能为空' });
        }
        const novel = await novelService.create({ title, description, genre });
        res.status(201).json(novel);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

router.get('/', async (req: Request, res: Response) => {
    try {
        const novels = await novelService.findAll();
        res.json(novels);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

router.get('/:id', async (req: Request, res: Response) => {
    try {
        const novel = await novelService.findById(String(req.params.id));
        if (!novel) {
            return res.status(404).json({ error: '小说不存在' });
        }
        res.json(novel);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

router.put('/:id', async (req: Request, res: Response) => {
    try {
        const { title, description, genre } = req.body;
        const novel = await novelService.update(String(req.params.id), { title, description, genre });
        if (!novel) {
            return res.status(404).json({ error: '小说不存在' });
        }
        res.json(novel);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const deleted = await novelService.deleteNovel(String(req.params.id));
        if (!deleted) {
            return res.status(404).json({ error: '小说不存在' });
        }
        res.json({ message: '删除成功' });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

router.post('/:id/chapters', async (req: Request, res: Response) => {
    try {
        const { architectureId, chapterNumber, title, content, status } = req.body;
        const novelId = String(req.params.id);

        const existingChapters = await chapterService.findByNovelId(novelId);
        const maxChapterNumber = existingChapters.reduce((max: number, ch: any) => Math.max(max, ch.chapter_number || 0), 0);
        const calculatedChapterNumber = chapterNumber || maxChapterNumber + 1;

        const chapter = await chapterService.create({
            novelId: Number(novelId),
            architectureId: architectureId ? Number(architectureId) : undefined,
            chapterNumber: calculatedChapterNumber,
            title,
            content,
            status
        });
        res.status(201).json(chapter);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

router.get('/:id/chapters', async (req: Request, res: Response) => {
    try {
        const chapters = await chapterService.findByNovelId(String(req.params.id));
        res.json(chapters);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

router.get('/:id/architectures', async (req: Request, res: Response) => {
    try {
        const architectures = await architectureService.findByNovelId(String(req.params.id));
        res.json(architectures);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

export default router;