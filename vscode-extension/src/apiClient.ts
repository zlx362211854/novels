import * as vscode from 'vscode';
import { Chapter, GenerateTask, Novel, RewriteMode, RewriteSelectionResult } from './types';

const COOKIE_SECRET_KEY = 'booksManage.authCookie';

export class BackendError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
  }
}

export class ApiClient {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel
  ) {}

  get apiBaseUrl(): string {
    return vscode.workspace
      .getConfiguration('booksManage')
      .get<string>('apiBaseUrl', 'http://localhost:3001/api')
      .replace(/\/+$/, '');
  }

  async login(username: string, password: string): Promise<void> {
    const response = await fetch(`${this.apiBaseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      throw await this.toBackendError(response, '登录失败');
    }

    const setCookie = response.headers.get('set-cookie');
    const cookie = this.extractSessionCookie(setCookie);
    if (!cookie) {
      throw new BackendError('登录成功但响应中没有 session cookie');
    }

    await this.context.secrets.store(COOKIE_SECRET_KEY, cookie);
    this.output.appendLine(`[auth] logged in as ${username}`);
  }

  async me(): Promise<{ authenticated: boolean; username?: string }> {
    return this.request('/auth/me');
  }

  async listNovels(): Promise<Novel[]> {
    return this.request('/novels');
  }

  async listChapters(novelId: number): Promise<Chapter[]> {
    return this.request(`/novels/${novelId}/chapters`);
  }

  async getChapter(chapterId: number): Promise<Chapter> {
    return this.request(`/chapters/${chapterId}`);
  }

  async updateChapter(chapter: Chapter, content: string): Promise<Chapter> {
    return this.request(`/chapters/${chapter.id}`, {
      method: 'PUT',
      body: {
        title: chapter.title,
        content,
        status: chapter.status,
        architectureId: chapter.architecture_id ?? chapter.architectureId ?? undefined,
        regenerateMemory: false,
      },
    });
  }

  async generateChapter(chapterId: number, userPrompt = ''): Promise<{ taskId: string; status: string }> {
    return this.request(`/chapters/${chapterId}/generate`, {
      method: 'POST',
      body: { userPrompt },
    });
  }

  async getGenerateTask(taskId: string): Promise<GenerateTask> {
    return this.request(`/chapters/generate-tasks/${encodeURIComponent(taskId)}`);
  }

  async reviewChapter(chapterId: number): Promise<unknown> {
    return this.request(`/chapters/${chapterId}/review`, { method: 'POST' });
  }

  async tuneChapter(chapterId: number, userPrompt = ''): Promise<unknown> {
    return this.request(`/chapters/${chapterId}/tune`, {
      method: 'POST',
      body: { userPrompt },
    });
  }

  async rewriteSelection(input: {
    chapterId: number;
    selectedText: string;
    beforeText: string;
    afterText: string;
    mode: RewriteMode;
    customInstruction?: string;
  }): Promise<RewriteSelectionResult> {
    return this.request(`/chapters/${input.chapterId}/rewrite-selection`, {
      method: 'POST',
      body: input,
    });
  }

  private async request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
    const cookie = await this.context.secrets.get(COOKIE_SECRET_KEY);
    const url = `${this.apiBaseUrl}${path}`;
    const method = options.method || 'GET';
    this.output.appendLine(`[api] ${method} ${url}`);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      });
    } catch (error) {
      throw new BackendError(`无法连接后端：${(error as Error).message}`);
    }

    if (!response.ok) {
      throw await this.toBackendError(response, `${method} ${path} failed`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  private extractSessionCookie(setCookie: string | null): string | null {
    if (!setCookie) return null;
    const match = setCookie.match(/novels_admin_session=[^;]+/);
    return match ? match[0] : null;
  }

  private async toBackendError(response: Response, fallback: string): Promise<BackendError> {
    let message = fallback;
    try {
      const payload = (await response.json()) as { error?: string; message?: string };
      message = payload.error || payload.message || message;
    } catch {
      const text = await response.text().catch(() => '');
      if (text) message = text;
    }
    return new BackendError(message, response.status);
  }
}
