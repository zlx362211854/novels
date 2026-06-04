# VS Code Novel Extension Design

## Goal

Build a personal VS Code extension for `books_manage` that uses VS Code as the writing surface while keeping the existing backend as the source of truth for novels, chapters, and AI operations.

## Scope

The first version is a native VS Code client, not a fork of Code OSS and not a WebView wrapper around the existing React frontend.

It supports:

- Login against the existing backend auth endpoint.
- A sidebar tree for novels and chapters.
- Opening a chapter as a virtual Markdown document.
- Saving the virtual document back to the backend with `Cmd+S`.
- Running chapter-level AI actions: generate, review, tune.
- Showing connection, task, and error status in VS Code UI.

It does not support:

- Full novel creation/bootstrap UI.
- Architecture, story-bible, recurring-task, publishing, or multi-chapter review management.
- Local folder sync or offline editing.
- Complex diff-based conflict merging.

## Architecture

The extension is a thin TypeScript client under `vscode-extension/`.

The backend remains authoritative. The extension stores a local snapshot only for open virtual documents so it can detect whether a chapter changed remotely before saving. The virtual document URI format is:

```text
books-manage://chapter/<chapterId>.md
```

The document body contains only chapter content. Chapter title, status, and IDs are held in extension state and backend responses, not embedded into the Markdown body.

## Backend API Usage

Default API base:

```text
http://localhost:3001/api
```

Endpoints:

- `POST /auth/login`
- `GET /auth/me`
- `GET /novels`
- `GET /novels/:id/chapters`
- `GET /chapters/:id`
- `PUT /chapters/:id`
- `POST /chapters/:id/generate`
- `GET /chapters/generate-tasks/:taskId`
- `POST /chapters/:id/review`
- `POST /chapters/:id/tune`

The extension captures the `novels_admin_session` cookie from login and sends it in later requests.

## UX

Activity Bar view: `Books Manage`.

Tree shape:

```text
Books Manage
  Novel Title
    第1章 Chapter Title
    第2章 Chapter Title
```

Chapter context actions:

- Open Chapter
- Generate Chapter
- Review Chapter
- Tune Chapter

Global commands:

- `Books Manage: Login`
- `Books Manage: Refresh`

## Save And Conflict Behavior

When a chapter opens, the extension records the backend content snapshot.

On save:

1. Fetch the latest chapter from the backend.
2. If backend content differs from the opening snapshot, ask the user to choose:
   - Overwrite Backend
   - Reload From Backend
   - Cancel
3. If no conflict or overwrite is chosen, call `PUT /chapters/:id`.
4. Update the snapshot after a successful save.

No automatic save is performed in the first version.

## AI Behavior

Generate:

1. Call `POST /chapters/:id/generate`.
2. Poll `GET /chapters/generate-tasks/:taskId`.
3. When complete, fetch the chapter again and refresh the open document if the user accepts.

Review and tune call their existing synchronous endpoints. Results are shown in a VS Code output channel, with a short notification for success or failure.

## Error Handling

The extension should show direct messages for:

- Backend unavailable.
- Login failed.
- Session expired or unauthorized.
- Chapter not found.
- Save conflict.
- AI task failure.

Detailed request and task logs go to the `Books Manage` output channel.

## Acceptance Criteria

- A user can log in to the local backend from VS Code.
- The sidebar shows existing novels and chapters.
- Opening a chapter creates a Markdown editor tab with URI `books-manage://chapter/<id>.md`.
- `Cmd+S` writes changed content back to `PUT /api/chapters/:id`.
- A remote content change detected before save triggers the conflict prompt.
- Chapter generate starts a backend task and polls until success or failure.
- Chapter review and tune can be triggered from the tree context menu.
