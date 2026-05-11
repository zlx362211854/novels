# NovelForge

NovelForge is an AI-powered workspace for long-form fiction planning, writing, review, memory management, automation, and publishing. It is designed for authors and teams who need to maintain coherent story structure, character state, world rules, timelines, and chapter continuity across serialized novels.

## Demo

<video src="./videos/book-manage-showcase/renders/book-manage-showcase.mp4" controls width="100%"></video>

If your Markdown viewer does not support embedded video, open it directly:

[Watch the project demo](./videos/book-manage-showcase/renders/book-manage-showcase.mp4)

## Key Capabilities

### Novel Project Workspace

- Manage multiple fiction projects with genre, description, update time, and writing progress.
- View full-story architecture, volume architecture, chapter architecture, and generated chapter counts from a single project dashboard.
- Guide authors toward the next practical writing step through a lightweight project overview.

### Story Bible and Long-Term Context

- Maintain characters, locations, organizations, items, world rules, and other persistent story facts.
- Provide stable context for chapter generation, review, and revision.
- Reduce the risk of lost settings, drifting character states, and inconsistent world rules in long-form writing.

### Architecture Studio

- Manage story architecture across full-book, volume, and chapter levels.
- Generate chapter-level architecture drafts from existing outlines and volume structures.
- Review pacing, chapter continuity, foreshadowing, and structural gaps.
- Move from chapter architecture into draft generation or batch chapter production.

### Chapter Writing and Versioning

- Create, edit, save, and generate chapter drafts.
- Preserve chapter history for rollback and comparison.
- Work with chapter content, linked architecture, memory cards, and AI review results in one workspace.

### AI Review and Revision

- Detect character-state conflicts, knowledge conflicts, timeline conflicts, world-rule conflicts, and key-item state conflicts.
- Generate revision suggestions or rewrite drafts from review results.
- Run cross-chapter review to surface continuity issues that are difficult to detect from a single chapter.

### Chapter Memory Cards

- Extract summaries, key events, entities, facts, state changes, and open threads from chapter content.
- Convert chapter-level information into reusable context for future writing.
- Regenerate and manually correct memory data when needed.

### Automation and Publishing

- Configure recurring tasks that automatically run chapter generation, review, and repair workflows.
- Support chapter publishing flows and local export.
- Connect writing, checking, revision, and delivery into a repeatable production loop.

## Tech Stack

### Frontend

- React
- Vite
- Tailwind CSS
- React Router
- CodeMirror
- Lucide React

### Backend

- Node.js
- TypeScript
- Express
- Sequelize
- SQLite / sqlite-vec
- LangChain / LangGraph

### Video

- HyperFrames
- GSAP

## Project Structure

```text
.
├── backend/                         # Backend APIs, AI services, data models, and tests
├── frontend/                        # React frontend application
├── data/                            # Local data directory
├── docs/                            # Design notes, plans, and specifications
├── videos/book-manage-showcase/     # Project demo video source and render output
├── DESIGN.md                        # Video visual design guide
├── docker-compose.yml
└── requirements.md
```

## Quick Start

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Default local URL:

```text
http://localhost:5173/
```

### Backend

```bash
cd backend
npm install
npm run dev
```

## Demo Video Assets

HyperFrames source:

```text
videos/book-manage-showcase/index.html
```

Rendered video:

```text
videos/book-manage-showcase/renders/book-manage-showcase.mp4
```

Local video player:

```text
videos/book-manage-showcase/watch.html
```

## Use Cases

- Structuring and writing long-form novels, web novels, and serialized fiction.
- Maintaining character state, foreshadowing, timelines, and world rules across many chapters.
- Integrating AI generation, AI review, human revision, memory extraction, and publishing into one workflow.

## Status

NovelForge is under active development. The current implementation covers project management, story architecture, chapter generation, AI review, memory cards, recurring tasks, and publishing-related workflows. Future work can extend model configuration, collaboration features, publishing-platform integrations, and more granular review strategies.
