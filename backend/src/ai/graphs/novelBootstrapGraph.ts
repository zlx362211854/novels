import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { createProgressTracker } from '../progressAdapter';
import { novelMetadataBootstrapGraph } from './novelMetadataBootstrapGraph';
import { storyBibleBootstrapGraph } from './storyBibleBootstrapGraph';
import { novelArchitectureBootstrapGraph } from './novelArchitectureBootstrapGraph';
import { chapterArchitectureReviewLoopGraph } from './chapterArchitectureReviewLoopGraph';
import { NovelBootstrapDraft, saveNovelBootstrapDraft } from '../../services/novelBootstrapService';

const NovelBootstrapState = Annotation.Root({
  prompt: Annotation<string>,
  constraints: Annotation<any>,
  taskId: Annotation<string | null>,
  draft: Annotation<NovelBootstrapDraft | null>,
  result: Annotation<any>,
});

async function generateNode(state: typeof NovelBootstrapState.State) {
  const steps = [
    '生成小说基础信息',
    '生成故事圣经',
    '生成全书架构',
    '执行第 1 轮章架构审阅',
    '执行第 2 轮章架构审阅',
    '执行第 3 轮章架构审阅',
    '保存小说数据',
  ];
  const tracker = state.taskId ? createProgressTracker(state.taskId, steps) : null;
  tracker?.start('一键生成新小说');

  try {
    tracker?.step(0);
    const metadataResult = await novelMetadataBootstrapGraph.invoke({
      prompt: state.prompt,
      constraints: state.constraints,
      taskId: state.taskId ?? null,
      result: null,
    });

    tracker?.step(1);
    const storyBibleResult = await storyBibleBootstrapGraph.invoke({
      metadata: metadataResult.result,
      prompt: state.prompt,
      constraints: state.constraints,
      taskId: state.taskId ?? null,
      result: [],
    });

    tracker?.step(2);
    const architectureResult = await novelArchitectureBootstrapGraph.invoke({
      metadata: metadataResult.result,
      prompt: state.prompt,
      constraints: state.constraints,
      taskId: state.taskId ?? null,
      result: null,
    });

    let draft: NovelBootstrapDraft = {
      prompt: state.prompt,
      novel: metadataResult.result.novel,
      cast: metadataResult.result.cast,
      story: metadataResult.result.story,
      storyBibleEntries: storyBibleResult.result,
      fullArchitecture: architectureResult.result.fullArchitecture,
      volumeArchitectures: architectureResult.result.volumeArchitectures,
      chapterArchitectures: architectureResult.result.chapterArchitectures,
    };

    tracker?.step(3);
    const loopResult = await chapterArchitectureReviewLoopGraph.invoke({
      draft,
      taskId: state.taskId ?? null,
      reviewHistory: [],
      result: null,
    });
    draft = loopResult.result;

    tracker?.step(6);
    const saved = await saveNovelBootstrapDraft(draft);
    tracker?.finish();

    return {
      draft,
      result: {
        novelId: saved.novel.id,
        title: saved.novel.title,
        status: 'completed',
        counts: saved.counts,
      },
    };
  } catch (error: any) {
    tracker?.error(error.message);
    throw error;
  }
}

export const novelBootstrapGraph = new StateGraph(NovelBootstrapState)
  .addNode('generate', generateNode)
  .addEdge(START, 'generate')
  .addEdge('generate', END)
  .compile();
