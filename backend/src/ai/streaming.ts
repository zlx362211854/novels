import * as aiStatus from '../services/aiStatusService';

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
  } = {}
): Promise<string> {
  const { signal, taskId = null, resetStream = true } = options;

  if (resetStream) {
    aiStatus.setStream(taskId, '');
  }

  let fullText = '';
  try {
    const stream = await llm.stream(messages, { signal });

    for await (const chunk of stream) {
      const text = extractChunkText(chunk);
      if (!text) continue;
      fullText += text;
      aiStatus.appendStream(taskId, text);
    }
  } catch (error) {
    // Fall through to the non-streaming path below.
    console.warn('[AI] 流式调用失败，回退到普通 invoke:', (error as Error).message);
  }

  if (!fullText) {
    const response = await llm.invoke(messages, { signal });
    fullText = extractChunkText(response);
    if (fullText) {
      aiStatus.setStream(taskId, fullText);
    }
  }

  // 兜底：若模型将 <think> 标签直接写入文本字段，在此剥离
  return fullText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}
