import { getAIConfig } from '../ai/llmFactory';

const EMBEDDING_BATCH_SIZE = 16;

interface ZhipuEmbeddingItem {
  index: number;
  embedding: number[];
}

interface ZhipuEmbeddingResponse {
  data?: ZhipuEmbeddingItem[];
  error?: {
    message?: string;
  };
}

export async function embedText(text: string): Promise<number[]> {
  const embeddings = await embedTexts([text]);

  if (embeddings.length !== 1) {
    throw new Error(`Expected exactly 1 embedding result for single text, received ${embeddings.length}`);
  }

  const [embedding] = embeddings;
  return embedding;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const config = await getAIConfig();

  if (!config.zhipuApiKey) {
    throw new Error('Zhipu API key is not configured');
  }

  const allEmbeddings: number[][] = [];
  const endpoint = `${config.zhipuApiUrl}/embeddings`;

  for (let start = 0; start < texts.length; start += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(start, start + EMBEDDING_BATCH_SIZE);
    const batchEmbeddings = await requestEmbeddingBatch(endpoint, config.zhipuApiKey, config.zhipuEmbeddingModel || 'embedding-3', batch);
    allEmbeddings.push(...batchEmbeddings);
  }

  return allEmbeddings;
}

async function requestEmbeddingBatch(url: string, apiKey: string, model: string, batch: string[]): Promise<number[][]> {
  let response: Response;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: batch
      })
    });
  } catch (error) {
    throw new Error(buildEmbeddingErrorMessage({
      url,
      inputCount: batch.length,
      reason: `request failed: ${getErrorMessage(error)}`
    }));
  }

  let payload: ZhipuEmbeddingResponse;

  try {
    payload = (await response.json()) as ZhipuEmbeddingResponse;
  } catch (error) {
    throw new Error(buildEmbeddingErrorMessage({
      url,
      status: response.status,
      inputCount: batch.length,
      reason: `invalid JSON response: ${getErrorMessage(error)}`
    }));
  }

  if (!response.ok) {
    throw new Error(buildEmbeddingErrorMessage({
      url,
      status: response.status,
      inputCount: batch.length,
      reason: payload.error?.message || 'request was not successful'
    }));
  }

  return normalizeEmbeddingBatch(payload.data, batch.length, url, response.status);
}

function normalizeEmbeddingBatch(data: ZhipuEmbeddingItem[] | undefined, expectedCount: number, url: string, status: number): number[][] {
  if (!Array.isArray(data)) {
    throw new Error(buildEmbeddingErrorMessage({
      url,
      status,
      inputCount: expectedCount,
      reason: 'response data is missing or malformed'
    }));
  }

  if (data.length !== expectedCount) {
    throw new Error(buildEmbeddingErrorMessage({
      url,
      status,
      inputCount: expectedCount,
      reason: `response item count mismatch: expected ${expectedCount}, received ${data.length}`
    }));
  }

  const indexes = new Set<number>();
  const sorted = data.slice().sort((a, b) => a.index - b.index);

  sorted.forEach((item, expectedIndex) => {
    if (!item || typeof item.index !== 'number') {
      throw new Error(buildEmbeddingErrorMessage({
        url,
        status,
        inputCount: expectedCount,
        reason: 'response item index is missing or malformed'
      }));
    }

    if (indexes.has(item.index)) {
      throw new Error(buildEmbeddingErrorMessage({
        url,
        status,
        inputCount: expectedCount,
        reason: `duplicate response index: ${item.index}`
      }));
    }

    indexes.add(item.index);

    if (item.index !== expectedIndex) {
      throw new Error(buildEmbeddingErrorMessage({
        url,
        status,
        inputCount: expectedCount,
        reason: `response indexes must be contiguous from 0 to ${expectedCount - 1}`
      }));
    }

    if (!Array.isArray(item.embedding)) {
      throw new Error(buildEmbeddingErrorMessage({
        url,
        status,
        inputCount: expectedCount,
        reason: `response item ${item.index} is missing an embedding array`
      }));
    }
  });

  return sorted.map((item) => item.embedding);
}

function buildEmbeddingErrorMessage({
  url,
  inputCount,
  reason,
  status
}: {
  url: string;
  inputCount: number;
  reason: string;
  status?: number;
}): string {
  const statusPart = status === undefined ? 'unknown' : String(status);
  return `Zhipu embeddings request failed (${reason}) [url=${url}, status=${statusPart}, inputCount=${inputCount}]`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
