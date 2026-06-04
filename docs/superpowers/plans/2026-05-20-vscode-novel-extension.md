# VS Code Novel Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal VS Code extension that edits `books_manage` chapters through virtual Markdown documents and calls existing backend AI chapter endpoints.

**Architecture:** The extension lives in `vscode-extension/` as an independent TypeScript package. It uses a small API client, a TreeView provider, a virtual document provider, and a save hook that writes chapter content back to the backend.

**Tech Stack:** VS Code Extension API, TypeScript, Node fetch, existing Express backend API.

---

## File Structure

- `vscode-extension/package.json`: extension manifest, commands, views, scripts, dependencies.
- `vscode-extension/tsconfig.json`: TypeScript compiler settings.
- `vscode-extension/src/types.ts`: shared backend and extension state types.
- `vscode-extension/src/apiClient.ts`: backend requests, login cookie capture, task polling helpers.
- `vscode-extension/src/chapterDocumentProvider.ts`: virtual Markdown document cache and save conflict handling.
- `vscode-extension/src/novelTreeProvider.ts`: novels and chapters TreeView.
- `vscode-extension/src/extension.ts`: activation, commands, status bar, output channel wiring.
- `vscode-extension/README.md`: local usage instructions.

## Tasks

### Task 1: Scaffold Extension Package

- [ ] Create `vscode-extension/package.json` with extension metadata, activation events, commands, view contributions, and scripts.
- [ ] Create `vscode-extension/tsconfig.json`.
- [ ] Create `vscode-extension/README.md` with local development instructions.

### Task 2: Add Backend API Client

- [ ] Create `src/types.ts` for `Novel`, `Chapter`, and `GenerateTask`.
- [ ] Create `src/apiClient.ts` with `login`, `me`, `listNovels`, `listChapters`, `getChapter`, `updateChapter`, `generateChapter`, `getGenerateTask`, `reviewChapter`, and `tuneChapter`.
- [ ] Store the auth cookie in VS Code secret storage.
- [ ] Emit request and error logs to the output channel.

### Task 3: Add Virtual Chapter Documents

- [ ] Create `src/chapterDocumentProvider.ts`.
- [ ] Register the `books-manage` URI scheme.
- [ ] Open chapters as `books-manage://chapter/<chapterId>.md`.
- [ ] Cache opened chapter snapshots.
- [ ] On save, detect remote content conflicts and write local content with `PUT /chapters/:id`.

### Task 4: Add Sidebar Tree

- [ ] Create `src/novelTreeProvider.ts`.
- [ ] Show novels as collapsible items.
- [ ] Load chapters under each novel.
- [ ] Add chapter context values for open, generate, review, and tune commands.
- [ ] Add refresh support.

### Task 5: Wire Commands And Status

- [ ] Create `src/extension.ts`.
- [ ] Register login, refresh, open chapter, generate chapter, review chapter, and tune chapter commands.
- [ ] Add a status bar item showing backend login state and AI task progress.
- [ ] Poll generation tasks until completion or failure.
- [ ] Refresh open chapter documents after successful AI changes when the user chooses to reload.

### Task 6: Verify

- [ ] Run `npm install` in `vscode-extension/`.
- [ ] Run `npm run compile`.
- [ ] Fix TypeScript errors.
- [ ] Document any runtime verification that still requires manually launching the extension host.
