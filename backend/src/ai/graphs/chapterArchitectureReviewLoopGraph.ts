import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { NovelBootstrapDraft } from '../../services/novelBootstrapService';
import * as aiStatus from '../../services/aiStatusService';
import {
  applyDraftChapterArchitectureRepair,
  repairDraftChapterArchitectures,
  reviewDraftChapterArchitectures,
} from '../../services/architectureReviewService';

const ChapterArchitectureReviewLoopState = Annotation.Root({
  draft: Annotation<NovelBootstrapDraft>,
  taskId: Annotation<string | null>,
  reviewHistory: Annotation<any[]>,
  result: Annotation<NovelBootstrapDraft>,
});

async function reviewLoopNode(state: typeof ChapterArchitectureReviewLoopState.State) {
  let currentDraft = state.draft;
  const reviewHistory: any[] = [];

  for (let round = 1; round <= 3; round += 1) {
    if (state.taskId) {
      aiStatus.step(state.taskId, 2 + round, `执行第 ${round} 轮章架构审阅`);
    }
    const reviewResult = await reviewDraftChapterArchitectures(currentDraft, undefined, state.taskId ?? null, round);
    const repairResult = await repairDraftChapterArchitectures(
      currentDraft,
      reviewResult,
      '请只修补受影响章架构，必要时新增章架构，不要删除章节。',
      undefined,
      state.taskId ?? null,
      round
    );
    currentDraft = {
      ...currentDraft,
      chapterArchitectures: applyDraftChapterArchitectureRepair(currentDraft.chapterArchitectures, repairResult),
    };
    reviewHistory.push({ round, reviewResult, repairResult });
  }

  return { reviewHistory, result: currentDraft };
}

export const chapterArchitectureReviewLoopGraph = new StateGraph(ChapterArchitectureReviewLoopState)
  .addNode('reviewLoop', reviewLoopNode)
  .addEdge(START, 'reviewLoop')
  .addEdge('reviewLoop', END)
  .compile();
