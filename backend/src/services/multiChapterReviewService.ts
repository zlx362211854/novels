import { MultiChapterReview, Chapter, ChapterVersion } from '../models/sequelize';
import { crossChapterReviewGraph } from '../ai/graphs/crossChapterReviewGraph';
import { multiChapterFixGraph } from '../ai/graphs/multiChapterFixGraph';
import * as chapterMemoryService from './chapterMemoryService';
import * as aiStatus from './aiStatusService';

const MAX_CHAPTERS = 30;

async function startReview(novelId: number, chapterIds: number[], signal?: AbortSignal): Promise<string> {
  if (chapterIds.length > MAX_CHAPTERS) throw new Error(`最多选择 ${MAX_CHAPTERS} 章`);
  if (chapterIds.length < 2) throw new Error('至少选择 2 章');

  const taskId = `cross-review-${novelId}-${Date.now()}`;

  try {
    const result = await crossChapterReviewGraph.invoke({
      novelId,
      chapterIds,
      taskId,
      signal,
      chapters: [],
      issues: [],
      reviewId: '',
    }, { signal });

    return result.reviewId;
  } catch (err) {
    aiStatus.error(taskId, (err as Error).message);
    throw err;
  }
}

async function getReview(reviewId: string): Promise<any> {
  const record = await MultiChapterReview.findByPk(reviewId);
  if (!record) throw new Error('审阅记录不存在');
  return {
    reviewId: record.id,
    novelId: record.novel_id,
    chapterIds: JSON.parse(record.chapter_ids),
    issues: record.review_data ? JSON.parse(record.review_data) : [],
    status: record.status,
    createdAt: record.created_at,
  };
}

async function startFix(
  reviewId: string,
  selectedIssueIds: string[],
  issueSuggestions: Record<string, string> = {},
  signal?: AbortSignal
): Promise<void> {
  const taskId = `cross-fix-${reviewId}-${Date.now()}`;

  try {
    await multiChapterFixGraph.invoke({
      reviewId,
      selectedIssueIds,
      issueSuggestions,
      taskId,
      signal,
      review: null,
      fixTasks: [],
      drafts: [],
    }, { signal });
  } catch (err) {
    aiStatus.error(taskId, (err as Error).message);
    throw err;
  }
}

async function getDrafts(reviewId: string): Promise<any[]> {
  const record = await MultiChapterReview.findByPk(reviewId);
  if (!record) throw new Error('审阅记录不存在');
  return record.fix_data ? JSON.parse(record.fix_data) : [];
}

async function applyDraft(reviewId: string, chapterId: number, accept: boolean): Promise<any> {
  const record = await MultiChapterReview.findByPk(reviewId);
  if (!record) throw new Error('审阅记录不存在');

  const drafts = record.fix_data ? JSON.parse(record.fix_data) : [];
  const draft = drafts.find((d: any) => d.chapterId === chapterId);
  if (!draft) throw new Error('未找到该章修订草稿');

  if (accept) {
    const chapter = await Chapter.findByPk(chapterId);
    if (!chapter) throw new Error('章节不存在');

    // Backup current version
    if ((chapter as any).content) {
      const count = await ChapterVersion.count({ where: { chapter_id: chapterId } });
      await ChapterVersion.create({
        chapter_id: chapterId,
        version_number: count + 1,
        content: (chapter as any).content,
      });
    }

    (chapter as any).content = draft.revisedContent;
    await chapter.save();
    draft.status = 'accepted';

    await chapterMemoryService.upsertForChapter(chapterId);
  } else {
    draft.status = 'skipped';
  }

  record.fix_data = JSON.stringify(drafts);
  await record.save();

  return draft;
}

async function listByNovel(novelId: number): Promise<any[]> {
  const records = await MultiChapterReview.findAll({
    where: { novel_id: novelId },
    order: [['created_at', 'DESC']],
    limit: 20,
  });
  return records.map((r: any) => ({
    reviewId: r.id,
    novelId: r.novel_id,
    chapterIds: JSON.parse(r.chapter_ids),
    issueCount: r.review_data ? JSON.parse(r.review_data).length : 0,
    status: r.status,
    createdAt: r.created_at,
  }));
}

export { startReview, getReview, startFix, getDrafts, applyDraft, listByNovel };
