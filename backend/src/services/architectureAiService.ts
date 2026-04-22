import { architectureGraph, chapterBatchGraph } from '../ai/graphs/architectureGraph';

interface GenerateArchitectureParams {
  novelId: number;
  level: string;
  parentId?: number;
  title?: string;
  plotOutline?: string;
  taskId?: string;
}

async function generateArchitecture(params: GenerateArchitectureParams, signal?: AbortSignal): Promise<any> {
  const result = await architectureGraph.invoke(
    {
      novelId: params.novelId,
      level: params.level,
      parentId: params.parentId,
      title: params.title || '',
      plotOutline: params.plotOutline,
      taskId: params.taskId ?? null,
      signal: signal ?? undefined,
      novel: null,
      parentContext: '',
      siblingContext: '',
      volumeNumber: null,
      result: null,
    },
    { signal }
  );

  return result.result;
}

async function generateChapterArchitectures(params: any, signal?: AbortSignal): Promise<any[]> {
  const result = await chapterBatchGraph.invoke(
    {
      novelId: params.novelId,
      volumeId: params.volumeId,
      taskId: params.taskId ?? null,
      signal: signal ?? undefined,
      novel: null,
      volume: null,
      fullArch: null,
      result: [],
    },
    { signal }
  );

  return result.result;
}

export {
  generateArchitecture,
  generateChapterArchitectures,
};
