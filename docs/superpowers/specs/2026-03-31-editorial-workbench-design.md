# Editorial Workbench Design

## Goal

Reframe the entire frontend as an "editorial workbench" for long-form fiction writing: visually refined, calm, and publication-adjacent rather than dashboard-like.

The product should feel like a serious writing environment:
- readable for long sessions
- visually cohesive across all pages
- elegant without becoming decorative noise
- more like a contemporary literary workspace than a SaaS admin panel

## Product Intent

This application helps users manage novels, structure story architecture, generate chapters, and revise text. The UI therefore needs to support two different but connected mental modes:

1. Planning mode
The user is shaping a long-form project, balancing architecture, chapter structure, and production progress.

2. Writing mode
The user is reading, comparing, editing, restoring, and generating text over long sessions.

The design must make both modes feel part of the same product language. It should not look like one page is a tool panel and another is a document editor from a different app.

## Chosen Aesthetic Direction

The visual direction combines:

- Classic editorial calm
Warm paper surfaces, ink-like typography, disciplined hierarchy, strong readability, restrained borders, minimal color noise.

- Contemporary literary workbench
Magazine-like spacing, intentional asymmetry where useful, stronger headline treatment, large quiet surfaces, and clearer "desk" composition rather than stacked admin cards.

This is not luxury-glassmorphism, not playful app chrome, and not generic productivity UI.

## Visual Principles

### 1. Paper-first surfaces

The interface should feel like layered paper, notes, and editorial sheets placed on a desk.

Rules:
- use warm off-white and pale stone backgrounds instead of plain gray
- use subtle layered panels instead of loud color blocks
- keep shadows soft and shallow
- rely more on border rhythm and spacing than on color saturation

### 2. Ink-forward typography

Typography is the main source of beauty.

Rules:
- page titles should feel like editorial section heads
- body text should remain quiet and durable for long reading
- labels and metadata should become lighter and more typographically disciplined
- avoid loud bolding everywhere; emphasis should be selective

### 3. Calm hierarchy

Users should immediately see:
- what the page is for
- what the primary next action is
- what is reference information
- what is dangerous or destructive

Rules:
- one primary CTA per page header
- secondary actions should recede visually
- destructive actions should never visually compete with primary creation actions
- avoid equal-weight buttons placed side by side unless they are truly peers

### 4. Fewer generic cards

Many current pages still read like dashboard blocks.

Rules:
- larger, more intentional sections
- fewer but stronger containers
- use grouping by workflow, not just by data type
- reduce visual fragmentation

### 5. Reading quality matters

The chapter page must look like a text environment first.

Rules:
- wider rhythm and more elegant text rendering
- strong typographic spacing for markdown content
- cleaner editing split between text entry and preview
- more document-like reading mode

## Color System

Base palette:
- background: warm ivory / paper
- panel: pale cream / soft white
- text primary: ink black with slight blue-gray bias
- text secondary: neutral slate
- border: quiet stone

Accent palette:
- primary accent: editorial navy
- success: muted pine / deep green
- warning: softened amber
- danger: restrained oxblood / muted red

Usage rules:
- blue is reserved for path-forward actions and key navigation
- green is reserved for completion and healthy generation states
- amber is for caution or AI-generation staging
- red only for destructive or irreversible actions

No bright gradients, no purple bias, and no candy-colored badges.

## Type Strategy

The UI should use a dual-role typography approach:

- Display / heading tone:
Refined, editorial, slightly literary in feel

- UI / body tone:
Clean, highly readable, stable for long working sessions

Implementation guidance:
- keep the current Chinese-friendly stack if webfont loading becomes risky
- if introducing webfonts, choose one serif or editorial display face for headings and keep body text highly legible
- never sacrifice Chinese readability for novelty

## Layout Strategy

### Global shell

The shell should feel lighter and more composed.

Requirements:
- sticky top bar remains, but visually quieter
- stronger max-width discipline
- more consistent page top rhythm
- headers should feel like section openers, not generic page tops

### Page rhythm

Each page should follow:
- page heading
- short contextual framing
- one primary action area
- one or two main working zones

Avoid long stacks of equal-priority modules.

## Page-by-Page Design

### 1. Novel list

Intent:
This page should feel like a catalog of active manuscripts.

Design changes:
- each novel card should feel like a manuscript/project entry, not a generic app tile
- stronger typography for title
- softer metadata treatment
- clearer empty state
- cleaner create-project modal with better editorial tone

Primary user question:
"Which project do I continue?"

### 2. Novel overview

Intent:
This page is now a light project summary, not a secondary workspace.

Design changes:
- reduce block count
- emphasize progress and current status
- present one strong "continue writing" entry into the full architecture page
- make supporting information quiet and elegant

Primary user question:
"Where am I in this project, and where should I go next?"

### 3. Architecture manager

Intent:
This is the true operational core of the product.

Design changes:
- make this page feel like a real editorial desk
- left side: structure and architecture material
- right side: AI production / action zone
- architecture hierarchy should read like nested editorial outlines, not a CRUD tree
- chapter production controls should feel like production tools, not random action links

Primary user question:
"How do I shape the story structure and move into chapter output?"

### 4. Chapter detail

Intent:
This page should feel like a manuscript reading and revision environment.

Design changes:
- reading mode should feel closer to a polished manuscript page
- edit mode should feel like a serious drafting tool
- AI generation panel and version history should support revision, not distract from reading
- the visual relationship between read mode and edit mode should remain unified

Primary user question:
"Do I revise this draft, regenerate it, or roll back?"

### 5. Settings

Intent:
Settings should not steal attention from the writing experience.

Design changes:
- quieter, more utility-oriented layout
- cleaner grouping for AI provider config and template config
- stronger form spacing and less modal heaviness
- keep it elegant but clearly secondary to the main workflow

Primary user question:
"What do I need to configure without breaking my focus?"

## Component Rules

### Buttons

- primary: dark editorial navy or deep ink, compact and confident
- secondary: outlined, quiet, low-chroma
- destructive: restrained red outline or muted solid only when needed
- action clusters must have one obvious primary action, never three competing solids

### Inputs

- surfaces should feel clean and slightly paper-like
- corners should be softer than brutalist, but not bubbly
- focus states should be elegant and calm
- spacing inside fields should support long-form entry

### Cards / panels

- use fewer, larger containers
- internal spacing should be generous
- borders should do more work than shadows
- avoid dashboard sameness

### Badges / status chips

- use low saturation
- prioritize readability over contrast theatrics
- badges should support scanning, not dominate attention

### Empty states

- gentle, encouraging tone
- no generic "nothing here"
- always provide the next reasonable action

## Motion

Motion should be subtle and editorial:
- soft fade and lift on page load
- gentle hover transitions on cards and buttons
- no springy toy-like motion
- no constant pulsing or shimmer

If motion is added, it must reinforce calmness and tactility.

## Content Tone

Microcopy should feel:
- calm
- expert
- helpful
- non-robotic

It should avoid:
- alarmist warnings unless truly necessary
- overly casual product slang
- generic dashboard phrasing

## Accessibility and Practical Constraints

The redesign must preserve:
- strong readability on desktop and laptop
- acceptable mobile adaptation
- adequate contrast for primary text and controls
- clear focus states
- no overreliance on color alone to signal meaning

The redesign should not require:
- introducing a heavyweight UI framework
- rewriting all routing or data flow
- changing backend contracts

## Implementation Boundaries

This redesign should focus on:
- global styling system
- page shell consistency
- page layouts
- component polish
- microcopy and interaction clarity

This redesign should not include:
- backend feature changes
- major workflow re-architecture beyond visual and interaction simplification already approved
- animation-heavy experimentation

## Success Criteria

The redesign is successful if:

- the product no longer looks like a generic CRUD admin tool
- the architecture page clearly feels like the main writing/production desk
- the chapter page feels comfortable for sustained reading and revision
- the novel overview page becomes lighter and more purposeful
- all pages look like part of one coherent editorial system
