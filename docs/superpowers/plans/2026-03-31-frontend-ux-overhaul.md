# Frontend UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the frontend's core writing workflow by reducing navigation friction, clarifying creation states, and adding consistent feedback patterns.

**Architecture:** Keep the current React + Vite structure, add a lightweight app-level feedback layer, and refactor the novel workspace, architecture workspace, and chapter detail page around clearer task zones. Prefer small shared UI helpers over introducing a full component library.

**Tech Stack:** React 19, React Router, Tailwind CSS, Axios

---

### Task 1: Add Shared UX Primitives

**Files:**
- Create: `frontend/src/components/ui/FeedbackProvider.jsx`
- Create: `frontend/src/components/ui/PageShell.jsx`
- Create: `frontend/src/components/ui/JsonField.jsx`
- Modify: `frontend/src/main.jsx`
- Modify: `frontend/src/index.css`

- [ ] Create a lightweight feedback provider with toast and confirm-dialog support that can replace most native `alert` and `confirm` calls.
- [ ] Add shared page shell helpers for hero/header/section presentation so pages can reuse a stronger layout system.
- [ ] Add a JSON helper field with format/validate capabilities for architecture editing.
- [ ] Mount the feedback provider at the application root and add any required global styling tokens.

### Task 2: Turn Novel Detail Into A Real Workspace

**Files:**
- Modify: `frontend/src/pages/NovelDetail.jsx`

- [ ] Replace the summary-only detail page with a workspace page that surfaces overview, architecture, and chapter content inline.
- [ ] Make the tab strip feel like real workspace navigation with counts and clear active states.
- [ ] Add stronger empty states and direct calls-to-action so users can move into architecture or chapter work without extra route hops.

### Task 3: Refactor Architecture Workflow

**Files:**
- Modify: `frontend/src/pages/ArchitectureManager.jsx`

- [ ] Reorganize the page into clearer sections for structure editing, AI batch generation, and chapter production.
- [ ] Replace destructive prompts and success alerts with the shared feedback system.
- [ ] Improve the architecture form with structured JSON assistance, inline guidance, and better draft/reset behavior.
- [ ] Make chapter-generation previews and batch results easier to review before saving.

### Task 4: Refactor Chapter Detail Workflow

**Files:**
- Modify: `frontend/src/pages/ChapterDetail.jsx`

- [ ] Separate reading, generation, editing, and version recovery into clearer zones.
- [ ] Expose AI generation controls from the page-level workflow instead of hiding them behind editing intent alone.
- [ ] Improve version history readability and recovery messaging.
- [ ] Replace native alerts/confirms with shared feedback patterns.

### Task 5: Wire App Shell And Verify

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/NovelList.jsx`
- Modify: `frontend/src/pages/ChapterManager.jsx`

- [ ] Update the global app shell to match the stronger workspace feel and route transitions.
- [ ] Apply the shared feedback/layout patterns to list and manager pages where needed for consistency.
- [ ] Run `npm run build` in `frontend` and fix any issues until the build succeeds cleanly.
