import { memoryExtractionGraph } from '../ai/graphs/memoryExtractionGraph';

interface ExtractOptions {
  skipRepairOnParseFailure?: boolean;
  taskId?: string | null;
}

async function extractMemoryCard(
  { chapter, novel, architecture }: any,
  signal?: AbortSignal,
  options: ExtractOptions = {}
): Promise<any> {
  const result = await memoryExtractionGraph.invoke(
    {
      chapter,
      novel,
      architecture,
      signal,
      skipRepairOnParseFailure: options.skipRepairOnParseFailure ?? false,
      taskId: options.taskId ?? null,
      rawResponse: '',
      memoryCard: null,
      parseSucceeded: false,
      parseError: '',
    },
    { signal }
  );

  return result.memoryCard;
}

export { extractMemoryCard };
