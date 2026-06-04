import * as vscode from 'vscode';
import { ApiClient } from './apiClient';
import { Chapter, ChapterDocumentSnapshot, ChapterTreeItem } from './types';

const SCHEME = 'books-manage';

export class ChapterDocumentProvider implements vscode.FileSystemProvider {
  private readonly emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  private readonly snapshots = new Map<string, ChapterDocumentSnapshot>();
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();

  readonly onDidChangeFile = this.emitter.event;

  constructor(
    private readonly api: ApiClient,
    private readonly output: vscode.OutputChannel
  ) {}

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    const snapshot = this.snapshots.get(uri.toString());
    if (!snapshot) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    return {
      type: vscode.FileType.File,
      ctime: snapshot.mtime,
      mtime: snapshot.mtime,
      size: Buffer.byteLength(snapshot.currentContent, 'utf8'),
    };
  }

  readDirectory(): [string, vscode.FileType][] {
    return [];
  }

  createDirectory(): void {
    throw vscode.FileSystemError.NoPermissions('books-manage documents are backed by chapters');
  }

  readFile(uri: vscode.Uri): Uint8Array {
    const snapshot = this.snapshots.get(uri.toString());
    if (!snapshot) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    return this.encoder.encode(snapshot.currentContent);
  }

  async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
    const snapshot = this.snapshots.get(uri.toString());
    if (!snapshot) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    const localContent = this.decoder.decode(content);
    this.output.appendLine(`[chapter] writeFile ${uri.toString()} bytes=${content.byteLength}`);
    await this.saveContent(uri, snapshot, localContent);
  }

  delete(): void {
    throw vscode.FileSystemError.NoPermissions('Delete chapters from the web app for now');
  }

  rename(): void {
    throw vscode.FileSystemError.NoPermissions('Rename chapters from the web app for now');
  }

  async openChapter(itemOrChapter: ChapterTreeItem | Chapter): Promise<void> {
    const chapterId = 'chapter' in itemOrChapter ? itemOrChapter.chapter.id : itemOrChapter.id;
    const chapter = await this.api.getChapter(chapterId);
    const uri = this.uriForChapter(chapter.id);
    this.snapshots.set(uri.toString(), {
      chapter,
      openedContent: chapter.content || '',
      currentContent: chapter.content || '',
      mtime: Date.now(),
    });
    this.fireChanged(uri);

    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.languages.setTextDocumentLanguage(document, 'markdown');
    await vscode.window.showTextDocument(document, { preview: false });
  }

  private async saveContent(
    uri: vscode.Uri,
    snapshot: ChapterDocumentSnapshot,
    localContent: string
  ): Promise<void> {
    const latest = await this.api.getChapter(snapshot.chapter.id);
    const latestContent = latest.content || '';

    if (latestContent !== snapshot.openedContent) {
      const choice = await vscode.window.showWarningMessage(
        '后端章节内容已变化，继续保存会覆盖后端内容。',
        { modal: true },
        '覆盖后端',
        '重新加载',
        '取消'
      );

      if (choice === '重新加载') {
        await this.reloadDocument(uri, latest);
        throw vscode.FileSystemError.Unavailable('保存已取消，已重新加载后端内容');
      }
      if (choice !== '覆盖后端') {
        throw vscode.FileSystemError.Unavailable('保存已取消');
      }
    }

    const updated = await this.api.updateChapter(latest, localContent);
    this.snapshots.set(uri.toString(), {
      chapter: updated,
      openedContent: updated.content || '',
      currentContent: updated.content || '',
      mtime: Date.now(),
    });
    this.output.appendLine(`[chapter] saved ${updated.id} ${updated.title}`);
    vscode.window.showInformationMessage(`已保存：${updated.title}`);
  }

  async reloadOpenChapter(chapterId: number): Promise<void> {
    const uri = this.uriForChapter(chapterId);
    const latest = await this.api.getChapter(chapterId);
    await this.reloadDocument(uri, latest);
  }

  hasOpenSnapshot(chapterId: number): boolean {
    return this.snapshots.has(this.uriForChapter(chapterId).toString());
  }

  uriForChapter(chapterId: number): vscode.Uri {
    return vscode.Uri.parse(`${SCHEME}://chapter/${chapterId}.md`);
  }

  chapterIdFromUri(uri: vscode.Uri): number | null {
    if (uri.scheme !== SCHEME || uri.authority !== 'chapter') return null;
    const match = uri.path.match(/\/(\d+)\.md$/);
    return match ? Number(match[1]) : null;
  }

  private async reloadDocument(uri: vscode.Uri, chapter: Chapter): Promise<void> {
    this.snapshots.set(uri.toString(), {
      chapter,
      openedContent: chapter.content || '',
      currentContent: chapter.content || '',
      mtime: Date.now(),
    });
    this.fireChanged(uri);

    const visibleEditor = vscode.window.visibleTextEditors.find((editor) => editor.document.uri.toString() === uri.toString());
    if (visibleEditor) {
      await vscode.window.showTextDocument(visibleEditor.document, visibleEditor.viewColumn);
    }
    this.output.appendLine(`[chapter] reloaded ${chapter.id} ${chapter.title}`);
  }

  private fireChanged(uri: vscode.Uri): void {
    this.emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }
}

export function isBooksManageDocument(document: vscode.TextDocument): boolean {
  return document.uri.scheme === SCHEME;
}
