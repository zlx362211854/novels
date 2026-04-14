import { memoryExtractionGraph } from '../ai/graphs/memoryExtractionGraph';

interface ExtractOptions {
  skipRepairOnParseFailure?: boolean;
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
