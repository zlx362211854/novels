import { Request, Response, NextFunction } from 'express';
import { Architecture, Chapter, MultiChapterReview, Novel } from '../models/sequelize';

function getAuthUserId(req: Request): number {
  const userId = Number((req as any).auth?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error('AUTH_USER_MISSING');
  }
  return userId;
}

async function findNovelForUser(novelId: number | string, userId: number): Promise<any | null> {
  return await Novel.findOne({ where: { id: novelId, user_id: userId } });
}

async function findChapterForUser(chapterId: number | string, userId: number): Promise<any | null> {
  return await Chapter.findOne({
    where: { id: chapterId },
    include: [{
      model: Novel,
      as: 'novel',
      attributes: ['id', 'user_id'],
      where: { user_id: userId },
    }],
  });
}

async function findArchitectureForUser(architectureId: number | string, userId: number): Promise<any | null> {
  return await Architecture.findOne({
    where: { id: architectureId },
    include: [{
      model: Novel,
      as: 'novel',
      attributes: ['id', 'user_id'],
      where: { user_id: userId },
    }],
  });
}

async function findReviewForUser(reviewId: number | string, userId: number): Promise<any | null> {
  return await MultiChapterReview.findOne({
    where: { id: reviewId },
    include: [{
      model: Novel,
      as: 'novel',
      attributes: ['id', 'user_id'],
      where: { user_id: userId },
    }],
  });
}

function requireNovelParamAccess(paramName: string = 'id') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const novel = await findNovelForUser(String(req.params[paramName]), getAuthUserId(req));
      if (!novel) return res.status(404).json({ error: '小说不存在' });
      (req as any).novel = novel;
      next();
    } catch (error) {
      next(error);
    }
  };
}

async function requireChapterAccess(req: Request, res: Response, chapterId: number | string): Promise<any | null> {
  const chapter = await findChapterForUser(chapterId, getAuthUserId(req));
  if (!chapter) {
    res.status(404).json({ error: '章节不存在' });
    return null;
  }
  return chapter;
}

async function requireArchitectureAccess(req: Request, res: Response, architectureId: number | string): Promise<any | null> {
  const architecture = await findArchitectureForUser(architectureId, getAuthUserId(req));
  if (!architecture) {
    res.status(404).json({ error: '架构不存在' });
    return null;
  }
  return architecture;
}

async function requireReviewAccess(req: Request, res: Response, reviewId: number | string): Promise<any | null> {
  const review = await findReviewForUser(reviewId, getAuthUserId(req));
  if (!review) {
    res.status(404).json({ error: '审阅不存在' });
    return null;
  }
  return review;
}

export {
  getAuthUserId,
  findNovelForUser,
  requireNovelParamAccess,
  requireChapterAccess,
  requireArchitectureAccess,
  requireReviewAccess,
};
