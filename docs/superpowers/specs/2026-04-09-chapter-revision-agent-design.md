# Chapter Revision Agent Design

## Goal

Add a post-review revision flow that uses review findings to produce a revised chapter draft without directly overwriting the original chapter content.

The feature should help the user move from:

1. detect hard-logic issues
2. generate a safer revision proposal
3. preview the proposal
4. decide whether to apply it into the editor

This should reduce manual rewriting effort while keeping the user in control of the final saved chapter.

## Product Intent

The current chapter review flow can detect hard-logic issues and show source-backed evidence. The next step is not automatic replacement of the current chapter, but controlled revision assistance.

The revised flow should preserve three product principles:

- review remains evidence-driven
- revision remains constrained to the detected issues
- the user must explicitly choose whether to apply the revised draft

This keeps the tool useful for long-form fiction editing without making it feel destructive or unpredictable.

## Scope

This design covers only chapter-level revision after a review result exists.

Included:

- generating a revised chapter proposal from review findings
- surfacing the proposal in the chapter detail page
- applying the proposal into the edit buffer only
- keeping explicit user save as the only persistence step
- moving AI agent files into `backend/src/agents/`

Not included:

- automatic overwrite of saved chapter content
- paragraph-level diff rendering
- partial patch application
- architecture rewrite or multi-chapter rewrite
- style review, pacing review, or continuity review beyond hard-logic fixes

## User Flow

### 1. Review chapter

The user runs a chapter review from the chapter detail page, or receives a review result automatically after generation.

If the result contains no issues, the revision action should not be emphasized.

### 2. Generate revised draft

If the review result contains issues, the user can click a new action:

`生成修订建议稿`

This sends the current chapter content plus the review result into a revision pipeline.

### 3. Preview revised draft

The system returns a structured revision result:

- revision summary
- applied issue list
- full revised chapter content

The frontend shows the revised draft in a dedicated panel, separate from the current editor content.

### 4. Apply or discard

The user can:

- apply the revised draft into the editor buffer
- regenerate a revised draft
- discard the revised draft

Applying the revised draft does not save it to the database. The user must still use the existing save flow.

## Architecture

### Separation of responsibilities

AI-facing files should move into a dedicated `agents` directory:

- `backend/src/agents/reviewAgent.js`
- `backend/src/agents/chapterMemoryAgent.js`
- `backend/src/agents/chapterRevisionAgent.js`

Service files remain orchestration-only:

- loading chapter/novel/architecture data
- building review context
- deciding whether to refresh memory
- deciding what to return to the frontend

This keeps prompts and model I/O isolated from application flow.

### Revision pipeline

The chapter revision flow should look like this:

1. load chapter, novel, architecture
2. validate or reuse the incoming review result
3. build review context from chapter memories and source excerpts
4. invoke `chapterRevisionAgent`
5. return a revision proposal without saving chapter content

The revision flow must reuse the existing review context model so the revision agent can see:

- current chapter content
- current chapter memory card
- relevant historical memories
- historical source excerpts
- architecture as a secondary reference

### Revision constraints

The revision agent must be conservative:

- only fix issues that appear in `reviewResult.issues`
- preserve unaffected scenes and language where possible
- do not introduce new events, new characters, or new rules
- do not move the chapter beyond its architecture scope
- if evidence is weak, prefer minimal revision

The system should treat the revised content as a proposal, not an authoritative replacement.

## Backend Design

### New agent

Create `backend/src/agents/chapterRevisionAgent.js`.

Responsibilities:

- build the revision prompt
- call the configured model
- parse and validate the response JSON

Expected input:

- `chapter`
- `novel`
- `architecture`
- `reviewResult`
- `currentMemory`
- `relevantMemories`
- `sourceExcerpts`

Expected output:

```json
{
  "summary": "string",
  "appliedIssues": [
    {
      "type": "string",
      "description": "string"
    }
  ],
  "revisedContent": "string"
}
```

### New service entrypoint

Add a new chapter service method:

```js
async function reviseChapter(chapterId, reviewResult, signal)
```

Responsibilities:

- load the current chapter and novel context
- load architecture if present
- ensure review context is available
- call `chapterRevisionAgent.revise(...)`
- return the revision proposal

This method must not persist revised content to `chapters.content`.

### New API endpoint

Add:

`POST /api/chapters/:id/revise`

Request body:

```json
{
  "reviewResult": { ... }
}
```

First version behavior:

- require `reviewResult` from the frontend
- reject requests if there is no chapter content
- reject requests if `reviewResult.issues` is empty

This keeps the first version simple and explicit.

## Frontend Design

### Chapter detail page

Extend the current review panel in `ChapterDetail.jsx`.

When review issues exist, show a new action:

- `生成修订建议稿`

The page should store a transient `revisionDraft` object in state:

```js
{
  summary,
  appliedIssues,
  revisedContent
}
```

### Revision proposal panel

Render a dedicated panel under the review section or near the editor area.

The panel should display:

- revision summary
- applied issues
- revised content preview

### User actions

The proposal panel should support:

- `应用到编辑区`
- `重新生成建议稿`
- `放弃建议稿`

`应用到编辑区` should only set the editor buffer to `revisedContent`.

The user must still click the existing save button to persist the new content.

## Error Handling

### Review prerequisites

If review has not been run yet, the revision action should be unavailable.

If the review has no issues, the revision action should either be hidden or disabled with a clear reason.

### Agent failure

If revision generation fails:

- preserve the current editor content
- preserve the current review result
- show a non-destructive error message

### Invalid revision output

If the model output cannot be parsed or does not contain `revisedContent`, return a structured error rather than partial garbage content.

## Testing Strategy

### Backend

Add tests for:

- revision prompt includes review issues and conservative rewrite rules
- revision service rejects empty content or empty issue lists
- revision endpoint returns structured proposal JSON
- revised content is not saved automatically

### Frontend

Use existing build verification and local manual testing for the first pass.

Manual checks:

- review result with issues shows the revision action
- revision proposal renders without replacing current text
- apply action updates the editor buffer only
- saving after apply creates a new chapter version through the existing save path

## File Layout

### Create

- `backend/src/agents/chapterRevisionAgent.js`

### Move or modify

- `backend/src/agents/reviewAgent.js`
- `backend/src/agents/chapterMemoryAgent.js`
- `backend/src/services/chapterService.js`
- `backend/src/services/reviewContextService.js`
- `backend/src/routes/chapters.js`
- `frontend/src/services/api.js`
- `frontend/src/pages/ChapterDetail.jsx`

## Open Decisions Resolved

- revision should generate a proposal, not overwrite the chapter
- the user must explicitly apply the proposal into the editor
- the user must still explicitly save to persist
- agent files belong under `backend/src/agents/`

## Design Summary

This feature adds a safer second stage after review: not just detecting problems, but producing a constrained revision proposal. The design avoids destructive writes, keeps review and revision responsibilities separate, and fits cleanly into the existing chapter detail workflow.
