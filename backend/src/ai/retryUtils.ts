export interface RetryOptions {
  maxAttempts?: number;
  delayMs?: number;
  signal?: AbortSignal;
  label?: string;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Object.assign(new Error('请求已取消'), { name: 'AbortError' }));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(Object.assign(new Error('请求已取消'), { name: 'AbortError' }));
    }, { once: true });
  });
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 3, delayMs = 60000, signal, label = 'AI' } = options;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) throw Object.assign(new Error('请求已取消'), { name: 'AbortError' });
    try {
      return await fn();
    } catch (error: any) {
      if (error.name === 'AbortError') throw error;
      lastError = error;
      console.error(`[${label}] 第${attempt + 1}次失败:`, error.message);
      if (attempt < maxAttempts - 1) {
        await sleep(delayMs, signal);
      }
    }
  }

  throw new Error(`${label}失败: ${lastError?.message}`);
}
