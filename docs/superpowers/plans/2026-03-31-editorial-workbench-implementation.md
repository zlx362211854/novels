# Editorial Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the frontend into a cohesive editorial workbench with calmer typography, paper-like surfaces, cleaner hierarchy, and stronger visual consistency across every page.

**Architecture:** Keep the current React + Vite app structure, but centralize the editorial visual system in global CSS and shared UI primitives. Then restyle pages in priority order so the application reads as one calm writing product instead of a collection of admin screens.

**Tech Stack:** React 19, React Router, Tailwind CSS 4, Axios

---

## File Structure

- `frontend/src/index.css`
  Global visual tokens, paper surfaces, typography, shared transitions, prose improvements.
- `frontend/src/App.jsx`
  Editorial shell, top navigation styling, app frame consistency.
- `frontend/src/components/ui/PageShell.jsx`
  Shared page headers, stat grids, section panels tuned to the new visual language.
- `frontend/src/components/ui/FeedbackProvider.jsx`
  Toasts and confirmation dialogs updated to match the editorial tone.
- `frontend/src/components/ui/JsonField.jsx`
  JSON editing surfaces styled consistently with the rest of the product.
- `frontend/src/pages/NovelList.jsx`
  Manuscript-like project index page.
- `frontend/src/pages/NovelDetail.jsx`
  Lightweight project overview page with stronger editorial hierarchy.
- `frontend/src/pages/ArchitectureManager.jsx`
  Main writing/production desk with structure lane + production lane composition.
- `frontend/src/pages/ChapterDetail.jsx`
  Manuscript reading and revision environment.
- `frontend/src/pages/Settings.jsx`
  Quiet utility page for model config and prompt templates.

---

### Task 1: Establish Editorial Visual Tokens

**Files:**
- Modify: `frontend/src/index.css`
- Modify: `frontend/src/components/ui/PageShell.jsx`
- Modify: `frontend/src/components/ui/FeedbackProvider.jsx`
- Modify: `frontend/src/components/ui/JsonField.jsx`

- [ ] **Step 1: Write the failing test**

There is no existing UI test harness in this repo. Use a visual regression proxy for this redesign:

Run:
```bash
npm run build
```

Expected before work:
- Build passes, but pages still render with the current mixed dashboard/editor look.

- [ ] **Step 2: Verify the baseline is the old design**

Open the app at:
```text
http://localhost:5175/
```

Confirm these baseline issues before changing code:
- top shell feels like a generic app header
- panel styling is inconsistent across pages
- typography is serviceable but not editorial
- cards rely too much on generic rounded rectangles

- [ ] **Step 3: Implement the global editorial system**

Update `frontend/src/index.css` to:
- introduce CSS variables for paper, ink, border, accent, success, warning, danger
- refine page background layers and subtle texture
- improve heading and body rhythm
- tighten button/input defaults and transitions
- improve markdown/prose styling for long reading

Update `frontend/src/components/ui/PageShell.jsx` to:
- make hero/header sections calmer and more publication-like
- reduce generic panel feel
- refine stat blocks into more elegant manuscript metadata tiles

Update `frontend/src/components/ui/FeedbackProvider.jsx` to:
- make toast panels lighter and more restrained
- make confirm dialogs feel like editorial confirmation sheets instead of generic modals

Update `frontend/src/components/ui/JsonField.jsx` to:
- align with the new paper/input language
- reduce utility-tool harshness

- [ ] **Step 4: Run build to verify the visual system compiles**

Run:
```bash
npm run build
```

Expected:
- `vite build` exits successfully
- no JSX/CSS syntax errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/index.css frontend/src/components/ui/PageShell.jsx frontend/src/components/ui/FeedbackProvider.jsx frontend/src/components/ui/JsonField.jsx
git commit -m "feat: add editorial visual system"
```

### Task 2: Restyle The Global App Shell And Project Index

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/pages/NovelList.jsx`

- [ ] **Step 1: Write the failing test**

Use a visual regression proxy:

Open:
```text
http://localhost:5175/
```

Expected before work:
- the shell and novel index still do not read like a manuscript catalog

- [ ] **Step 2: Verify the baseline failure**

Check specifically:
- top bar lacks editorial presence
- novel cards look like generic tiles instead of project entries
- spacing and alignment are not yet unified with the new visual system

- [ ] **Step 3: Implement the shell and list page redesign**

Update `frontend/src/App.jsx` to:
- simplify nav weight
- increase compositional polish
- make the shell feel more like a writing environment header

Update `frontend/src/pages/NovelList.jsx` to:
- make each project read like a manuscript/project sheet
- improve the empty state, modal, and CTA rhythm
- align metadata spacing and button hierarchy with the editorial system

- [ ] **Step 4: Run build to verify the restyled entry flow**

Run:
```bash
npm run build
```

Expected:
- `vite build` exits successfully

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/pages/NovelList.jsx
git commit -m "feat: restyle app shell and project index"
```

### Task 3: Restyle The Novel Overview And Architecture Desk

**Files:**
- Modify: `frontend/src/pages/NovelDetail.jsx`
- Modify: `frontend/src/pages/ArchitectureManager.jsx`

- [ ] **Step 1: Write the failing test**

Use a visual regression proxy:

Open:
```text
http://localhost:5175/novels/1
```

and, after navigating from the UI, open the architecture page for any existing novel.

Expected before work:
- overview feels cleaner than before but still not fully editorial
- architecture page is operationally improved but not yet visually distinctive enough

- [ ] **Step 2: Verify the baseline failure**

Check specifically:
- overview page still reads slightly like product cards rather than a composed project summary
- architecture hierarchy could feel more outline-like and less CRUD-like
- production zone and structure zone need stronger visual contrast in purpose without using loud color

- [ ] **Step 3: Implement the overview + architecture redesign**

Update `frontend/src/pages/NovelDetail.jsx` to:
- simplify the summary view further
- make the "continue writing" block feel like the dominant editorial action
- improve manuscript progress framing

Update `frontend/src/pages/ArchitectureManager.jsx` to:
- make the page feel like the main editorial desk
- strengthen the composition between structure editing and AI production
- refine hierarchy chips, nested chapter rows, preview modal, and create/edit modal styling
- reduce dashboard-card repetition

- [ ] **Step 4: Run build to verify the core workbench pages**

Run:
```bash
npm run build
```

Expected:
- `vite build` exits successfully

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/NovelDetail.jsx frontend/src/pages/ArchitectureManager.jsx
git commit -m "feat: redesign overview and architecture desk"
```

### Task 4: Restyle Chapter Reading And Revision

**Files:**
- Modify: `frontend/src/pages/ChapterDetail.jsx`

- [ ] **Step 1: Write the failing test**

Use a visual regression proxy:

Open any chapter detail page from the local app.

Expected before work:
- page functions correctly, but reading mode and edit mode still need stronger manuscript-like refinement

- [ ] **Step 2: Verify the baseline failure**

Check specifically:
- reading view is still closer to a generic content page than a polished manuscript
- version history and generation controls are visually useful but not fully integrated into one editorial tone

- [ ] **Step 3: Implement the chapter page redesign**

Update `frontend/src/pages/ChapterDetail.jsx` to:
- make read mode feel like a manuscript page
- make edit mode feel like an elegant drafting desk rather than a split admin form
- refine side panels, metadata, revision actions, and version cards
- ensure preview and read typography are especially strong

- [ ] **Step 4: Run build to verify chapter view changes**

Run:
```bash
npm run build
```

Expected:
- `vite build` exits successfully

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ChapterDetail.jsx
git commit -m "feat: redesign chapter reading and revision"
```

### Task 5: Restyle Settings As A Quiet Utility Page

**Files:**
- Modify: `frontend/src/pages/Settings.jsx`

- [ ] **Step 1: Write the failing test**

Use a visual regression proxy:

Open:
```text
http://localhost:5175/settings
```

Expected before work:
- settings still looks like an older generic form page and does not match the rest of the redesigned product

- [ ] **Step 2: Verify the baseline failure**

Check specifically:
- form layout is too generic
- modals still feel visually disconnected from the rest of the system
- AI config and template management need clearer grouping and quieter hierarchy

- [ ] **Step 3: Implement the settings redesign**

Update `frontend/src/pages/Settings.jsx` to:
- use `PageShell` and `SectionCard`
- restyle config forms, template list, and template modal
- replace remaining native alert/confirm usage with the shared feedback system
- make the page feel intentionally secondary but still polished

- [ ] **Step 4: Run build to verify settings page changes**

Run:
```bash
npm run build
```

Expected:
- `vite build` exits successfully

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Settings.jsx
git commit -m "feat: redesign settings page"
```

### Task 6: Final Verification Sweep

**Files:**
- Modify: `frontend/src/index.css` (only if final polish is needed)
- Modify: `frontend/src/App.jsx` (only if final polish is needed)

- [ ] **Step 1: Run final build verification**

Run:
```bash
npm run build
```

Expected:
- `vite build` exits successfully
- output bundle generated in `dist/`

- [ ] **Step 2: Run manual review across core routes**

Review in browser:
- `/`
- a real `/novels/:id`
- a real `/novels/:id/architecture`
- a real `/chapters/:id`
- `/settings`

Expected:
- all pages share the same editorial visual language
- architecture page clearly feels like the main production desk
- chapter page feels comfortable for extended reading
- settings page feels quiet and secondary

- [ ] **Step 3: Apply final polish if needed**

If anything still feels visually inconsistent, make only targeted polish edits in:
- `frontend/src/index.css`
- `frontend/src/App.jsx`

- [ ] **Step 4: Re-run build after final polish**

Run:
```bash
npm run build
```

Expected:
- `vite build` exits successfully

- [ ] **Step 5: Commit**

```bash
git add frontend/src/index.css frontend/src/App.jsx
git commit -m "chore: polish editorial workbench visuals"
```
