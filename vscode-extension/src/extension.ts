import * as vscode from 'vscode';
import { ApiClient, BackendError } from './apiClient';
import { ChapterDocumentProvider, isBooksManageDocument } from './chapterDocumentProvider';
import { NovelTreeProvider } from './novelTreeProvider';
import { ChapterTreeItem, RewriteMode } from './types';

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_COUNT = 240;

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Books Manage');
  const api = new ApiClient(context, output);
  const documents = new ChapterDocumentProvider(api, output);
  const tree = new NovelTreeProvider(api, output);
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

  status.text = 'Books Manage';
  status.tooltip = 'Books Manage backend status';
  status.show();

  context.subscriptions.push(
    output,
    status,
    vscode.workspace.registerFileSystemProvider('books-manage', documents, {
      isCaseSensitive: true,
    }),
    vscode.window.registerTreeDataProvider('booksManageNovels', tree),
    vscode.commands.registerCommand('booksManage.login', () => login(api, tree, status)),
    vscode.commands.registerCommand('booksManage.refresh', () => tree.refresh()),
    vscode.commands.registerCommand('booksManage.saveChapter', () => saveActiveChapter(output)),
    vscode.commands.registerCommand('booksManage.openChapter', (item: ChapterTreeItem) => runCommand(() => documents.openChapter(item))),
    vscode.commands.registerCommand('booksManage.generateChapter', (item: ChapterTreeItem) =>
      runCommand(() => generateChapter(api, documents, item, status, output))
    ),
    vscode.commands.registerCommand('booksManage.reviewChapter', (item: ChapterTreeItem) =>
      runCommand(() => reviewChapter(api, item, output))
    ),
    vscode.commands.registerCommand('booksManage.tuneChapter', (item: ChapterTreeItem) =>
      runCommand(() => tuneChapter(api, documents, item, output))
    ),
    vscode.commands.registerCommand('booksManage.rewriteSelectionSmooth', () =>
      runCommand(() => rewriteSelection(api, documents, 'smooth', output))
    ),
    vscode.commands.registerCommand('booksManage.rewriteSelectionDescribe', () =>
      runCommand(() => rewriteSelection(api, documents, 'describe', output))
    ),
    vscode.commands.registerCommand('booksManage.rewriteSelectionCompress', () =>
      runCommand(() => rewriteSelection(api, documents, 'compress', output))
    ),
    vscode.commands.registerCommand('booksManage.rewriteSelectionPreserve', () =>
      runCommand(() => rewriteSelection(api, documents, 'preserve', output))
    ),
    vscode.commands.registerCommand('booksManage.rewriteSelectionCustom', () =>
      runCommand(() => rewriteSelection(api, documents, 'custom', output))
    ),
    vscode.workspace.onWillSaveTextDocument((event) => {
      if (isBooksManageDocument(event.document)) {
        output.appendLine(`[chapter] saving ${event.document.uri.toString()}`);
      }
    })
  );

  void updateAuthStatus(api, status);
}

export function deactivate(): void {}

async function login(api: ApiClient, tree: NovelTreeProvider, status: vscode.StatusBarItem): Promise<void> {
  const username = await vscode.window.showInputBox({
    prompt: 'Books Manage username',
    value: 'admin',
    ignoreFocusOut: true,
  });
  if (!username) return;

  const password = await vscode.window.showInputBox({
    prompt: 'Books Manage password',
    password: true,
    ignoreFocusOut: true,
  });
  if (!password) return;

  await api.login(username, password);
  status.text = 'Books Manage: logged in';
  vscode.window.showInformationMessage('Books Manage 登录成功');
  tree.refresh();
}

async function updateAuthStatus(api: ApiClient, status: vscode.StatusBarItem): Promise<void> {
  try {
    const me = await api.me();
    status.text = me.authenticated ? `Books Manage: ${me.username || 'logged in'}` : 'Books Manage: logged out';
  } catch (error) {
    if (error instanceof BackendError && error.status === 401) {
      status.text = 'Books Manage: login required';
      return;
    }
    status.text = 'Books Manage: backend offline';
  }
}

async function generateChapter(
  api: ApiClient,
  documents: ChapterDocumentProvider,
  item: ChapterTreeItem,
  status: vscode.StatusBarItem,
  output: vscode.OutputChannel
): Promise<void> {
  const userPrompt = await vscode.window.showInputBox({
    prompt: 'Optional prompt for chapter generation',
    ignoreFocusOut: true,
  });
  const started = await api.generateChapter(item.chapter.id, userPrompt || '');
  output.appendLine(`[generate] task accepted ${started.taskId}`);
  status.text = `Books Manage: generating ${item.chapter.title}`;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `生成章节：${item.chapter.title}`,
      cancellable: false,
    },
    async (progress) => {
      for (let index = 0; index < MAX_POLL_COUNT; index += 1) {
        const task = await api.getGenerateTask(started.taskId);
        const label = task.currentStep || task.status || 'running';
        progress.report({ message: label });
        output.appendLine(`[generate] ${started.taskId} ${label}`);

        if (task.status === 'completed' || task.status === 'success' || task.status === 'finished') {
          status.text = 'Books Manage';
          await maybeReloadChapter(documents, item.chapter.id, '章节生成完成，是否重新加载当前章节？');
          vscode.window.showInformationMessage(`章节生成完成：${item.chapter.title}`);
          return;
        }

        if (task.status === 'failed' || task.status === 'error') {
          throw new Error(task.error || '章节生成失败');
        }

        await sleep(POLL_INTERVAL_MS);
      }
      throw new Error('章节生成轮询超时');
    }
  );
}

async function reviewChapter(api: ApiClient, item: ChapterTreeItem, output: vscode.OutputChannel): Promise<void> {
  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `审核章节：${item.chapter.title}`,
      cancellable: false,
    },
    () => api.reviewChapter(item.chapter.id)
  );
  output.appendLine(`[review] ${item.chapter.id} ${item.chapter.title}`);
  output.appendLine(JSON.stringify(result, null, 2));
  output.show(true);
  vscode.window.showInformationMessage(`章节审核完成：${item.chapter.title}`);
}

async function tuneChapter(
  api: ApiClient,
  documents: ChapterDocumentProvider,
  item: ChapterTreeItem,
  output: vscode.OutputChannel
): Promise<void> {
  const userPrompt = await vscode.window.showInputBox({
    prompt: 'Prompt for chapter tuning',
    ignoreFocusOut: true,
  });
  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `润色章节：${item.chapter.title}`,
      cancellable: false,
    },
    () => api.tuneChapter(item.chapter.id, userPrompt || '')
  );
  output.appendLine(`[tune] ${item.chapter.id} ${item.chapter.title}`);
  output.appendLine(JSON.stringify(result, null, 2));
  await maybeReloadChapter(documents, item.chapter.id, '章节润色完成，是否重新加载当前章节？');
  vscode.window.showInformationMessage(`章节润色完成：${item.chapter.title}`);
}

async function maybeReloadChapter(
  documents: ChapterDocumentProvider,
  chapterId: number,
  message: string
): Promise<void> {
  if (!documents.hasOpenSnapshot(chapterId)) return;
  const choice = await vscode.window.showInformationMessage(message, '重新加载', '稍后');
  if (choice === '重新加载') {
    await documents.reloadOpenChapter(chapterId);
  }
}

async function runCommand(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message = (error as Error).message;
    vscode.window.showErrorMessage(`Books Manage 操作失败：${message}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rewriteSelection(
  api: ApiClient,
  documents: ChapterDocumentProvider,
  mode: RewriteMode,
  output: vscode.OutputChannel
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isBooksManageDocument(editor.document)) {
    vscode.window.showWarningMessage('请先打开 Books Manage 章节文档');
    return;
  }

  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showWarningMessage('请先选中要改写的文本');
    return;
  }

  const chapterId = documents.chapterIdFromUri(editor.document.uri);
  if (!chapterId) {
    vscode.window.showErrorMessage('无法从当前文档识别章节 ID');
    return;
  }

  const customInstruction = mode === 'custom'
    ? await vscode.window.showInputBox({
        prompt: '输入自定义改写要求',
        placeHolder: '例如：改得更克制，减少形容词，保留对白',
        ignoreFocusOut: true,
      })
    : undefined;
  if (mode === 'custom' && !customInstruction?.trim()) return;

  const fullText = editor.document.getText();
  const startOffset = editor.document.offsetAt(selection.start);
  const endOffset = editor.document.offsetAt(selection.end);
  const selectedText = editor.document.getText(selection);
  const beforeText = fullText.slice(Math.max(0, startOffset - 1600), startOffset);
  const afterText = fullText.slice(endOffset, Math.min(fullText.length, endOffset + 800));

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'AI 改写选区',
      cancellable: false,
    },
    () => api.rewriteSelection({
      chapterId,
      selectedText,
      beforeText,
      afterText,
      mode,
      customInstruction,
    })
  );

  const replaced = await editor.edit((edit) => {
    edit.replace(selection, result.rewrittenText);
  });

  if (!replaced) {
    throw new Error('替换选区失败');
  }

  output.appendLine(`[rewrite-selection] chapter=${chapterId} mode=${mode}`);
  if (result.summary) output.appendLine(`[rewrite-selection] ${result.summary}`);
  vscode.window.showInformationMessage(result.summary || '选区改写已应用，确认后按 Cmd+S 保存');
}

async function saveActiveChapter(output: vscode.OutputChannel): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isBooksManageDocument(editor.document)) {
    await vscode.commands.executeCommand('workbench.action.files.save');
    return;
  }

  output.appendLine(`[chapter] explicit save ${editor.document.uri.toString()} dirty=${editor.document.isDirty}`);
  const saved = await editor.document.save();
  if (!saved) {
    vscode.window.showWarningMessage('章节没有保存成功，请打开 Books Manage 输出面板查看日志');
  }
}
