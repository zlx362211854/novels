import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import * as novelService from '../services/novelService';
import * as chapterService from '../services/chapterService';
import * as architectureService from '../services/architectureService';
import * as architectureAiService from '../services/architectureAiService';
import * as architectureReviewService from '../services/architectureReviewService';
import * as recurringTaskService from '../services/recurringTaskService';
import * as exportService from '../services/exportService';
import * as novelTransferService from '../services/novelTransferService';
import { chapterGenerationGraph } from '../ai/graphs/chapterGenerationGraph';
import { novelBootstrapGraph } from '../ai/graphs/novelBootstrapGraph';
import * as aiStatus from '../services/aiStatusService';
import { Novel, Chapter, Architecture } from '../models/sequelize';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
    try {
        const { title, description, genre, publishConfig, aiConfig } = req.body;
        if (!title) {
            return res.status(400).json({ error: '标题不能为空' });
        }
        const novel = await novelService.create({ title, description, genre, publishConfig, aiConfig });
        res.status(201).json(novel);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

router.post('/bootstrap', async (req: Request, res: Response) => {
    try {
        const { prompt, constraints, aiConfig } = req.body;
        if (!prompt || !String(prompt).trim()) {
            return res.status(400).json({ error: 'prompt 不能为空' });
        }
        const taskId = randomUUID();
        const result = await novelBootstrapGraph.invoke({
            prompt: String(prompt).trim(),
            constraints: constraints || {},
            aiConfig: aiConfig || null,
            taskId,
            draft: null,
            result: null,
        });
        res.status(201).json({ taskId, ...result.result });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

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
        const { title, description, genre, publishConfig, aiConfig } = req.body;
        const novel = await novelService.update(String(req.params.id), { title, description, genre, publishConfig, aiConfig });
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

router.get('/:id/export', async (req: Request, res: Response) => {
    try {
        const novelId = Number(req.params.id);
        const scope = typeof req.query.scope === 'string' ? req.query.scope : 'full';
        const volumeId = req.query.volumeId ? Number(req.query.volumeId) : undefined;
        const result = await exportService.exportToMarkdown({ novelId, scope, volumeId });
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=novel-${novelId}.md`);
        res.send(result);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

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

router.post('/:id/chapters/renumber', async (req: Request, res: Response) => {
    try {
        await architectureService.renumberNovelChapters(String(req.params.id));
        res.json({ message: '章节编号已重排' });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

router.post('/:id/architectures', async (req: Request, res: Response) => {
    try {
        const { level, parentId, title, plotOutline, characters, worldSetting, emotionalTone } = req.body;
        if (!level || !title) {
            return res.status(400).json({ error: 'level 和 title 不能为空' });
        }
        const stringify = (v: any) => (v && typeof v === 'object' ? JSON.stringify(v) : v);
        const architecture = await architectureService.create({
            novelId: Number(req.params.id),
            level,
            parentId: parentId ? Number(parentId) : null,
            title,
            plotOutline: stringify(plotOutline),
            characters: stringify(characters),
            worldSetting: stringify(worldSetting),
            emotionalTone: stringify(emotionalTone),
        });
        res.status(201).json(architecture);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

router.post('/:id/generate-architecture', async (req: Request, res: Response) => {
    try {
        const { level, parentId, title, plotOutline } = req.body;
        if (!level) {
            return res.status(400).json({ error: 'level 不能为空' });
        }
        const taskId = randomUUID();
        // 不绑定 req.signal：架构生成结果存入数据库，客户端刷新页面不应中断任务
        const result = await architectureAiService.generateArchitecture({
            novelId: Number(req.params.id),
            level,
            parentId: parentId ? Number(parentId) : undefined,
            title,
            plotOutline,
            taskId,
        });
        if (!res.headersSent) res.json(result);
    } catch (error) {
        if (!res.headersSent) res.status(500).json({ error: (error as Error).message });
    }
});

// 批量生成章架构草稿
router.post('/:id/generate-chapter-architectures', async (req: Request, res: Response) => {
    try {
        const { volumeId } = req.body;
        if (!volumeId) return res.status(400).json({ error: 'volumeId 不能为空' });
        const taskId = randomUUID();
        // 不绑定 req.signal：生成完成后存入数据库，刷新页面不中断任务
        const result = await architectureAiService.generateChapterArchitectures(
            { novelId: Number(req.params.id), volumeId: Number(volumeId), taskId }
        );
        if (!res.headersSent) res.json(result);
    } catch (error) {
        if (!res.headersSent) res.status(500).json({ error: (error as Error).message });
    }
});

// 批量保存章架构
router.post('/:id/batch-create-chapter-architectures', async (req: Request, res: Response) => {
    try {
        const { volumeId, chapters } = req.body;
        if (!volumeId || !Array.isArray(chapters)) return res.status(400).json({ error: 'volumeId 和 chapters 不能为空' });
        const result = await architectureService.replaceChapterArchitectures(
            Number(req.params.id), Number(volumeId), chapters
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// 生成单章正文
router.post('/:id/generate-chapter-content', async (req: Request, res: Response) => {
    const ac = new AbortController();
    res.on('close', () => { if (!res.writableEnded) ac.abort(); });
    try {
        const { chapterArchId } = req.body;
        if (!chapterArchId) return res.status(400).json({ error: 'chapterArchId 不能为空' });

        // 先创建空章节，再生成内容
        const arch = await Architecture.findByPk(chapterArchId);
        if (!arch) return res.status(404).json({ error: '章架构不存在' });

        const existingChapters = await chapterService.findByNovelId(String(req.params.id));
        const maxNum = existingChapters.reduce((m: number, c: any) => Math.max(m, c.chapter_number || 0), 0);

        const chapter = await chapterService.create({
            novelId: Number(req.params.id),
            architectureId: Number(chapterArchId),
            chapterNumber: maxNum + 1,
            title: arch.title,
            content: '',
            status: 'generating',
        });

        const taskId = randomUUID();
        const result = await chapterGenerationGraph.invoke(
            { chapterId: chapter.id, signal: ac.signal, taskId },
            { signal: ac.signal }
        );
        res.json({ chapter: result.updatedChapter });
    } catch (error) {
        if (ac.signal.aborted) return;
        res.status(500).json({ error: (error as Error).message });
    }
});

// 批量生成某卷正文
router.post('/:id/batch-generate-chapters', async (req: Request, res: Response) => {
    const ac = new AbortController();
    const taskId = randomUUID();
    res.on('close', () => { if (!res.writableEnded) ac.abort(); });
    try {
        const { volumeId } = req.body;
        if (!volumeId) return res.status(400).json({ error: 'volumeId 不能为空' });

        const chapterArchs = await Architecture.findAll({
            where: { novel_id: req.params.id, level: 'chapter', parent_id: Number(volumeId) },
            order: [['id', 'ASC']],
        });

        const volume = await Architecture.findByPk(Number(volumeId));
        const stepLabels = chapterArchs.map((arch: any, index: number) => `生成第 ${index + 1} 章：${arch.title}`);
        aiStatus.start(
            taskId,
            `批量生成「${volume?.title || '当前卷'}」正文`,
            stepLabels.length > 0 ? stepLabels : ['检查可生成章节']
        );

        const existingChapters = await chapterService.findByNovelId(String(req.params.id));
        let maxNum = existingChapters.reduce((m: number, c: any) => Math.max(m, c.chapter_number || 0), 0);

        const results = [];
        for (const [index, arch] of chapterArchs.entries()) {
            if (ac.signal.aborted) break;
            try {
                aiStatus.step(taskId, index, stepLabels[index] || `生成章节 ${index + 1}`);
                // 如果已有正文跳过
                const existing = existingChapters.find((c: any) => c.architecture_id === arch.id);
                if (existing) {
                    aiStatus.setStream(taskId, `已存在正文，跳过「${arch.title}」`);
                    results.push({ archId: arch.id, success: true, chapter: existing });
                    continue;
                }

                const chapter = await chapterService.create({
                    novelId: Number(req.params.id),
                    architectureId: arch.id,
                    chapterNumber: ++maxNum,
                    title: arch.title,
                    content: '',
                    status: 'generating',
                });
                aiStatus.setStream(taskId, `正在生成「${arch.title}」的正文...`);
                const result = await chapterGenerationGraph.invoke(
                    { chapterId: chapter.id, signal: ac.signal, taskId: null },
                    { signal: ac.signal }
                );
                aiStatus.setStream(taskId, `已完成「${arch.title}」`);
                results.push({ archId: arch.id, success: true, chapter: result.updatedChapter });
            } catch (err: any) {
                aiStatus.appendStream(taskId, `\n\n「${arch.title}」失败：${err.message}`);
                results.push({ archId: arch.id, success: false, error: err.message });
            }
        }
        aiStatus.finish(taskId);
        res.json(results);
    } catch (error) {
        if (ac.signal.aborted) return;
        aiStatus.error(taskId, (error as Error).message);
        res.status(500).json({ error: (error as Error).message });
    }
});

// 审阅架构
router.post('/:id/review-architectures', async (req: Request, res: Response) => {
    try {
        const result = await architectureReviewService.reviewArchitectures(Number(req.params.id), (req as any).signal);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// 全书级章架构审阅
router.post('/:id/review-chapter-architectures', async (req: Request, res: Response) => {
    try {
        const taskId = randomUUID();
        const result = await architectureReviewService.reviewChapterArchitectures(Number(req.params.id), (req as any).signal, taskId);
        res.json({ taskId, result });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// 重写架构
router.post('/:id/rewrite-architectures', async (req: Request, res: Response) => {
    try {
        const { reviewResult, userPrompt } = req.body;
        const result = await architectureReviewService.rewriteArchitectures(
            Number(req.params.id), reviewResult, userPrompt || '', (req as any).signal
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// 生成章架构修补方案
router.post('/:id/repair-chapter-architectures', async (req: Request, res: Response) => {
    try {
        const { reviewResult, userPrompt } = req.body;
        const taskId = randomUUID();
        const result = await architectureReviewService.repairChapterArchitectures(
            Number(req.params.id),
            reviewResult,
            userPrompt || '',
            (req as any).signal,
            taskId
        );
        res.json({ taskId, result });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// 应用章架构修补方案
router.post('/:id/apply-chapter-architecture-repair', async (req: Request, res: Response) => {
    try {
        const taskId = randomUUID();
        const result = await architectureReviewService.applyChapterArchitectureRepair(
            Number(req.params.id),
            req.body,
            taskId
        );
        res.json({ taskId, result });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// 应用重写结果
router.post('/:id/apply-rewrite', async (req: Request, res: Response) => {
    try {
        const rewriteResult = req.body;
        if (!rewriteResult) return res.status(400).json({ error: '缺少重写结果' });

        let updated = 0, created = 0, deleted = 0;

        if (rewriteResult.fullArchitecture) {
            const full = await Architecture.findOne({ where: { novel_id: req.params.id, level: 'full' } });
            if (full) {
                await architectureService.update(full.id, {
                    title: rewriteResult.fullArchitecture.title,
                    plotOutline: rewriteResult.fullArchitecture.plotOutline,
                });
                updated++;
            }
        }

        if (Array.isArray(rewriteResult.volumes)) {
            for (const vol of rewriteResult.volumes) {
                if (vol.id) {
                    await architectureService.update(vol.id, { title: vol.title, plotOutline: vol.plotOutline });
                    updated++;
                } else {
                    await architectureService.create({ novelId: Number(req.params.id), level: 'volume', title: vol.title, plotOutline: vol.plotOutline });
                    created++;
                }
            }
        }

        res.json({ stats: { updated, created, deleted } });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// 周期任务（每本小说一个）
router.get('/:id/recurring-task', async (req: Request, res: Response) => {
    try {
        const task = await recurringTaskService.findByNovel(String(req.params.id));
        res.json(recurringTaskService.serializeTask(task));
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

router.put('/:id/recurring-task', async (req: Request, res: Response) => {
    try {
        const { cronExpression, enabled, chaptersPerRun } = req.body || {};
        if (!cronExpression || typeof cronExpression !== 'string') {
            return res.status(400).json({ error: 'cronExpression 不能为空' });
        }
        const saved = await recurringTaskService.upsert(String(req.params.id), {
            cronExpression,
            enabled,
            chaptersPerRun,
        });
        res.json(saved);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

router.delete('/:id/recurring-task', async (req: Request, res: Response) => {
    try {
        const removed = await recurringTaskService.remove(String(req.params.id));
        if (!removed) return res.status(404).json({ error: '当前小说还没有周期任务' });
        res.json({ message: '已删除' });
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

router.post('/:id/recurring-task/run-now', async (req: Request, res: Response) => {
    try {
        const summary = await recurringTaskService.runNow(String(req.params.id));
        res.json({ summary });
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

export default router;
