import { chapterRevisionGraph } from '../ai/graphs/chapterRevisionGraph';

async function revise(params: any, signal?: AbortSignal): Promise<any> {
  const { chapter, novel, architecture, reviewResult } = params;

  const result = await chapterRevisionGraph.invoke(
    {
      chapterId: chapter.id,
      reviewResult,
      signal,
      taskId: `revise-${chapter.id}-${Date.now()}`,
      chapter,
      novel,
      reviewContext: null,
      revisionResult: null,
    },
    { signal }
  );

  return result.revisionResult;
}

export { revise };
