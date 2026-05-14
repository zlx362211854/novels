import * as aiStatus from '../services/aiStatusService';

const DEFAULT_AI_REQUEST_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 10 * 60 * 1000);

function chunkToText(content: any): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === 'string') return item;
      // thinking 块：内容在 item.thinking 字段，包裹 <think> 标签后推给前端显示
      if (item?.type === 'thinking') return item.thinking ? `<think>${item.thinking}</think>` : '';
      if (item?.type === 'text') return item.text || '';
      if (item?.type === 'text_delta') return item.text || '';
      if (item?.type === 'output_text') return item.text || '';
      if (typeof item?.text === 'string') return item.text;
      if (typeof item?.content === 'string') return item.content;
      return '';
    }).join('');
  }
  if (typeof content?.text === 'string') return content.text;
  if (typeof content?.content === 'string') return content.content;
  return '';
}

function extractChunkText(chunk: any): string {
  const direct = chunkToText(chunk?.content);
  if (direct) return direct;

  const candidates = [
    chunk?.text,
    chunk?.kwargs?.content,
    chunk?.lc_kwargs?.content,
    chunk?.additional_kwargs?.content,
    chunk?.response_metadata?.content,
  ];

  for (const candidate of candidates) {
    const text = chunkToText(candidate);
    if (text) return text;
  }

  return '';
}

export async function invokeWithStreaming(
  llm: any,
  messages: any[],
  options: {
    signal?: AbortSignal;
    taskId?: string | null;
    resetStream?: boolean;
    timeoutMs?: number;
  } = {}
): Promise<string> {
  const { signal, taskId = null, resetStream = true, timeoutMs = DEFAULT_AI_REQUEST_TIMEOUT_MS } = options;

  if (resetStream) {
    aiStatus.setStream(taskId, '');
  }

  const timeoutController = new AbortController();
  const timeoutError = new Error(`AI 请求超时（>${Math.round(timeoutMs / 1000)}s）`);
  const onAbort = () => timeoutController.abort(signal?.reason);
  const timer = setTimeout(() => {
    timeoutController.abort(timeoutError);
  }, timeoutMs);
  if (signal) {
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  const effectiveSignal = timeoutController.signal;
  let fullText = '';
  try {
    try {
      const stream = await llm.stream(messages, { signal: effectiveSignal });

      for await (const chunk of stream) {
        const text = extractChunkText(chunk);
        if (!text) continue;
        fullText += text;
        aiStatus.appendStream(taskId, text);
      }
    } catch (error) {
      if (effectiveSignal.aborted) {
        throw timeoutController.signal.reason instanceof Error
          ? timeoutController.signal.reason
          : error;
      }
      // Fall through to the non-streaming path below.
      console.warn('[AI] 流式调用失败，回退到普通 invoke:', (error as Error).message);
    }

    if (!fullText) {
      try {
        const response = await llm.invoke(messages, { signal: effectiveSignal });
        fullText = extractChunkText(response);
        if (fullText) {
          aiStatus.setStream(taskId, fullText);
        }
      } catch (error) {
        if (effectiveSignal.aborted) {
          throw timeoutController.signal.reason instanceof Error
            ? timeoutController.signal.reason
            : error;
        }
        throw error;
      }
    }
  } finally {
    clearTimeout(timer);
    if (signal) {
      signal.removeEventListener('abort', onAbort);
    }
  }

  // 兜底：若模型将 <think> 标签直接写入文本字段，在此剥离
  return fullText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}
