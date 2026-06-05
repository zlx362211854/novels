import { Router, Request, Response } from 'express';
import { setMaxListeners } from 'events';
import * as service from '../services/multiChapterReviewService';
import {
  findNovelForUser,
  getAuthUserId,
  requireChapterAccess,
  requireNovelParamAccess,
  requireReviewAccess,
} from '../services/accessControlService';

const router = Router();

// 发起跨章审阅
router.post('/', async (req: Request, res: Response) => {
  const ac = new AbortController();
  setMaxListeners(30, ac.signal);
  res.on('close', () => { if (!res.writableEnded) ac.abort(); });
  try {
    (req as any).setTimeout(0);
    const { novelId, chapterIds } = req.body;
    if (!novelId || !Array.isArray(chapterIds) || chapterIds.length < 2) {
      return res.status(400).json({ error: '请提供 novelId 和至少2个 chapterIds' });
    }
    const numericNovelId = Number(novelId);
    const userId = getAuthUserId(req);
    const novel = await findNovelForUser(numericNovelId, userId);
    if (!novel) {
      return res.status(404).json({ error: '小说不存在' });
    }
    const numericChapterIds = chapterIds.map(Number);
    for (const chapterId of numericChapterIds) {
      const chapter = await requireChapterAccess(req, res, chapterId);
      if (!chapter) return;
      if (Number(chapter.novel_id) !== numericNovelId) {
        return res.status(400).json({ error: '章节不属于当前小说' });
      }
    }
    const reviewId = await service.startReview(numericNovelId, numericChapterIds, ac.signal);
    res.json({ reviewId });
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: (error as Error).message });
  }
});

// 获取某小说的审阅历史（放在 /:reviewId 之前，避免路由歧义）
router.get('/novel/:novelId', requireNovelParamAccess('novelId'), async (req: Request, res: Response) => {
  try {
    const reviews = await service.listByNovel(Number(String(req.params.novelId)));
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

router.param('reviewId', async (req: Request, res: Response, next, value) => {
  try {
    const review = await requireReviewAccess(req, res, value);
    if (!review) return;
    (req as any).review = review;
    next();
  } catch (error) {
    next(error);
  }
});

// 获取审阅结果
router.get('/:reviewId', async (req: Request, res: Response) => {
  try {
    const result = await service.getReview(String(req.params.reviewId));
    res.json(result);
  } catch (error) {
    res.status(404).json({ error: (error as Error).message });
  }
});

// 发起修订（手动触发）
router.post('/:reviewId/fix', async (req: Request, res: Response) => {
  const ac = new AbortController();
  setMaxListeners(30, ac.signal);
  res.on('close', () => { if (!res.writableEnded) ac.abort(); });
  try {
    (req as any).setTimeout(0);
    const { selectedIssueIds, issueSuggestions } = req.body;
    if (!Array.isArray(selectedIssueIds) || selectedIssueIds.length === 0) {
      return res.status(400).json({ error: '请提供 selectedIssueIds' });
    }
    await service.startFix(
      String(req.params.reviewId),
      selectedIssueIds,
      issueSuggestions || {},
      ac.signal
    );
    res.json({ message: '修订完成' });
  } catch (error) {
    if (ac.signal.aborted) return;
    res.status(500).json({ error: (error as Error).message });
  }
});

// 获取修订草稿
router.get('/:reviewId/drafts', async (req: Request, res: Response) => {
  try {
    const drafts = await service.getDrafts(String(req.params.reviewId));
    res.json(drafts);
  } catch (error) {
    res.status(404).json({ error: (error as Error).message });
  }
});

// 应用或跳过某章修订
router.post('/:reviewId/apply', async (req: Request, res: Response) => {
  try {
    const { chapterId, accept } = req.body;
    const draft = await service.applyDraft(String(req.params.reviewId), Number(chapterId), Boolean(accept));
    res.json(draft);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;
