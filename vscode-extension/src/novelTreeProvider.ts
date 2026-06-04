import * as vscode from 'vscode';
import { ApiClient } from './apiClient';
import { ChapterTreeItem, NovelTreeItem, TreeElement } from './types';

export class NovelTreeProvider implements vscode.TreeDataProvider<TreeElement> {
  private readonly emitter = new vscode.EventEmitter<TreeElement | undefined | null | void>();

  readonly onDidChangeTreeData = this.emitter.event;

  constructor(
    private readonly api: ApiClient,
    private readonly output: vscode.OutputChannel
  ) {}

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeElement): Promise<TreeElement[]> {
    try {
      if (!element) {
        const novels = await this.api.listNovels();
        return novels.map((novel) => new NovelTreeItem(novel));
      }

      if (element instanceof NovelTreeItem) {
        const chapters = await this.api.listChapters(element.novel.id);
        return chapters
          .slice()
          .sort((left, right) => (left.chapter_number ?? left.chapterNumber ?? 0) - (right.chapter_number ?? right.chapterNumber ?? 0))
          .map((chapter) => new ChapterTreeItem(chapter));
      }

      return [];
    } catch (error) {
      this.output.appendLine(`[tree] ${(error as Error).message}`);
      vscode.window.showErrorMessage(`Books Manage 加载失败：${(error as Error).message}`);
      return [];
    }
  }
}
