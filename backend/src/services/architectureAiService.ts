import { architectureGraph, chapterBatchGraph } from '../ai/graphs/architectureGraph';

interface GenerateArchitectureParams {
  novelId: number;
  level: string;
  parentId?: number;
  title?: string;
}

async function generateArchitecture(params: GenerateArchitectureParams, signal?: AbortSignal): Promise<any> {
  const result = await architectureGraph.invoke(
    {
      novelId: params.novelId,
      level: params.level,
      parentId: params.parentId,
      title: params.title || '',
      signal,
      novel: null,
      parentContext: '',
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
      signal,
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
