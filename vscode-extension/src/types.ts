import * as vscode from 'vscode';

export interface Novel {
  id: number;
  title: string;
  description?: string | null;
  genre?: string | null;
}

export interface Chapter {
  id: number;
  novel_id?: number;
  novelId?: number;
  architecture_id?: number | null;
  architectureId?: number | null;
  chapter_number?: number;
  chapterNumber?: number;
  title: string;
  content: string;
  status?: string | null;
  updatedAt?: string;
  updated_at?: string;
}

export interface GenerateTask {
  taskId?: string;
  status?: string;
  title?: string;
  currentStep?: string;
  progress?: number;
  error?: string;
  streamText?: string;
  result?: unknown;
}

export type RewriteMode = 'smooth' | 'describe' | 'compress' | 'preserve' | 'custom';

export interface RewriteSelectionResult {
  rewrittenText: string;
  summary?: string;
}

export interface ChapterDocumentSnapshot {
  chapter: Chapter;
  openedContent: string;
  currentContent: string;
  mtime: number;
}

export type TreeElement = NovelTreeItem | ChapterTreeItem;

export class NovelTreeItem extends vscode.TreeItem {
  constructor(public readonly novel: Novel) {
    super(novel.title, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'novel';
    this.tooltip = novel.description || novel.title;
    this.iconPath = new vscode.ThemeIcon('book');
  }
}

export class ChapterTreeItem extends vscode.TreeItem {
  constructor(public readonly chapter: Chapter) {
    const number = chapter.chapter_number ?? chapter.chapterNumber;
    const prefix = number ? `第${number}章 ` : '';
    super(`${prefix}${chapter.title}`, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'chapter';
    this.tooltip = chapter.status ? `${chapter.title} (${chapter.status})` : chapter.title;
    this.description = chapter.status || undefined;
    this.iconPath = new vscode.ThemeIcon('markdown');
    this.command = {
      command: 'booksManage.openChapter',
      title: 'Open Chapter',
      arguments: [this],
    };
  }
}
