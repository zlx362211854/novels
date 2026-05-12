import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { createProgressTracker } from '../progressAdapter';
import { novelMetadataBootstrapGraph } from './novelMetadataBootstrapGraph';
import { storyBibleBootstrapGraph } from './storyBibleBootstrapGraph';
import { novelArchitectureBootstrapGraph } from './novelArchitectureBootstrapGraph';
import * as aiStatus from '../../services/aiStatusService';
import * as architectureAiService from '../../services/architectureAiService';
import * as architectureService from '../../services/architectureService';
import {
  applyPersistedChapterArchitectureReviewLoop,
  createBootstrapNovel,
  NovelBootstrapMetadata,
  saveBootstrapFullArchitecture,
  saveBootstrapStoryBible,
  saveBootstrapVolumeArchitectures,
} from '../../services/novelBootstrapService';

const NovelBootstrapState = Annotation.Root({
  prompt: Annotation<string>,
  constraints: Annotation<any>,
  aiConfig: Annotation<any>,
  taskId: Annotation<string | null>,
  draft: Annotation<any | null>,
  result: Annotation<any>,
});

async function generateNode(state: typeof NovelBootstrapState.State) {
  const steps = [
    '生成并保存小说基础信息',
    '生成并保存故事圣经',
    '生成全本架构',
    '生成卷架构',
    '保存全本架构',
    '保存卷架构',
    '生成并保存章架构',
    '执行第 1 轮章架构审阅',
    '执行第 2 轮章架构审阅',
    '执行第 3 轮章架构审阅',
    '完成',
  ];
  const tracker = state.taskId ? createProgressTracker(state.taskId, steps) : null;
  tracker?.start('一键生成新小说');

  try {
    tracker?.step(0);
    const metadataResult = await novelMetadataBootstrapGraph.invoke({
      prompt: state.prompt,
      constraints: state.constraints,
      aiConfig: state.aiConfig ?? null,
      taskId: state.taskId ?? null,
      result: null,
    });
    const metadata: NovelBootstrapMetadata = {
      prompt: state.prompt,
      aiConfig: state.aiConfig ?? null,
      novel: metadataResult.result.novel,
      cast: metadataResult.result.cast,
      story: metadataResult.result.story,
    };
    const createdNovel = await createBootstrapNovel(metadata);
    const novelId = Number(createdNovel.id);

    tracker?.step(1);
    const storyBibleResult = await storyBibleBootstrapGraph.invoke({
      metadata: metadataResult.result,
      prompt: state.prompt,
      constraints: state.constraints,
      aiConfig: state.aiConfig ?? null,
      taskId: state.taskId ?? null,
      result: [],
    });
    await saveBootstrapStoryBible(novelId, storyBibleResult.result);

    tracker?.step(2);
    const architectureResult = await novelArchitectureBootstrapGraph.invoke({
      metadata: metadataResult.result,
      prompt: state.prompt,
      constraints: state.constraints,
      aiConfig: state.aiConfig ?? null,
      taskId: state.taskId ?? null,
      result: null,
    });

    tracker?.step(4);
    const savedFullArchitecture = await saveBootstrapFullArchitecture(
      novelId,
      metadata,
      architectureResult.result.fullArchitecture,
    );

    tracker?.step(5);
    const savedVolumes = await saveBootstrapVolumeArchitectures(
      novelId,
      Number(savedFullArchitecture.id),
      architectureResult.result.volumeArchitectures,
    );

    tracker?.step(6);
    let savedChapterCount = 0;
    for (const volume of savedVolumes) {
      if (state.taskId) {
        aiStatus.step(state.taskId, 6, `生成并保存 ${volume.title} 章架构`);
      }
      const generatedChapters = await architectureAiService.generateChapterArchitectures(
        { novelId, volumeId: Number(volume.id), taskId: state.taskId ?? null }
      );
      const savedChapters = await architectureService.replaceChapterArchitectures(
        novelId,
        Number(volume.id),
        generatedChapters,
      );
      savedChapterCount += savedChapters.length;
    }

    tracker?.step(7);
    await applyPersistedChapterArchitectureReviewLoop(novelId, 3, state.taskId ?? null);
    tracker?.step(10);
    tracker?.finish();

    return {
      result: {
        novelId,
        title: createdNovel.title,
        status: 'completed',
        counts: {
          volumes: savedVolumes.length,
          chapters: savedChapterCount,
          storyBibleEntries: storyBibleResult.result.length,
        },
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
