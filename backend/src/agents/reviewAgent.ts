import { chapterReviewGraph } from '../ai/graphs/chapterReviewGraph';

async function review(params: any, signal?: AbortSignal): Promise<any> {
  const { chapter, novel, architecture, currentMemory, relevantMemories = [], sourceExcerpts = [] } = params;

  const result = await chapterReviewGraph.invoke(
    {
      chapterId: chapter.id,
      signal,
      chapter,
      novel,
      architecture,
      currentMemory,
      reviewContext: {
        currentMemory,
        relevantMemories,
        sourceExcerpts,
      },
      reviewResult: null,
      taskId: null,
    },
    { signal }
  );

  return result.reviewResult;
}

export default { review };
