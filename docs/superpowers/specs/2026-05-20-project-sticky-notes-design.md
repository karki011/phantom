# Project Sticky Notes — Design Spec

**Author:** Subash Karki
**Date:** 2026-05-20
**Status:** Approved

## Overview

Per-project sticky notes on the home pane. Persistent across all worktrees and branches within a project. Create, edit inline, expand to full pane, delete. GSAP animations for a tactile feel.

## Data Model

New `project_notes` SQLite table:

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUID |
| project_id | TEXT FK | → projects |
| type | TEXT | `'todo'` \| `'idea'` \| `'bug'` \| `'note'` |
| title | TEXT | First line / heading |
| body | TEXT | Markdown content |
| pinned | INTEGER | 0 or 1 |
| position | INTEGER | Sort order (lower = first) |
| created_at | INTEGER | Unix epoch |
| updated_at | INTEGER | Unix epoch |

## Type → Color Mapping

| Type | Color | Token |
|---|---|---|
| todo | `#f59e0b` | amber/gold |
| idea | `#3b82f6` | blue |
| bug | `#ef4444` | red/danger |
| note | `vars.color.accent` | cyan (default) |

## Layout

Notes section sits between Quick Actions/Recipes and Workspace Status on the home pane.

```
┌─ ▼ Notes (3) ──────────────────────── [+ Add] ─┐
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │▄▄TODO▄▄▄ │  │▄▄IDEA▄▄▄ │  │▄▄BUG▄▄▄▄ │      │
│  │Fix auth  │  │Dark mode │  │Login     │      │
│  │☐ check   │  │toggle    │  │race cond │      │
│  └──────────┘  └──────────┘  └──────────┘      │
└─────────────────────────────────────────────────┘
```

- Grid: `repeat(auto-fill, minmax(180px, 1fr))`
- Each card: 3px colored top border by type, title, body preview, `[↗]` expand button
- Max card height ~120px with overflow hidden + fade gradient
- Collapsible: chevron toggle, `(N)` count badge visible when collapsed
- `[+ Add]` visible even when collapsed
- Collapse state persisted via preferences (`home.notesCollapsed`)

## Interactions

| Action | Mechanism |
|---|---|
| Create | `[+ Add]` → modal: pick type + enter title |
| Edit inline | Click card → Milkdown editor replaces preview. Autosave 500ms debounce. Esc/click-away saves & collapses |
| Expand to pane | `[↗]` button → opens `notes` pane tab with full Milkdown editor |
| Delete | Context menu → "Delete Note" with confirm |
| Change type | Context menu → type submenu |
| Reorder | Drag handle on hover. Updates `position` in DB |
| Pin | Context menu → "Pin to Top". Pinned notes sort first |

## GSAP Animations

| Trigger | Animation |
|---|---|
| Card creation | Scale from 0, `back.out(1.7)` bounce |
| Card delete | Shrink + fade + slide down, remaining cards shuffle with `power2.inOut` |
| Collapse/expand section | Staggered card reveal — cards pop in one by one |
| Drag reorder | Cards slide to new positions with Flip plugin |
| Inline edit open | Card height expands, content fades in |
| Type change | Color bar morph transition |

## Backend (Go)

### SQL Queries (sqlc)

```sql
-- ListProjectNotes: list all notes for a project, pinned first, then by position
-- CreateProjectNote: insert new note
-- UpdateProjectNote: update title, body, type, pinned, position, updated_at
-- DeleteProjectNote: delete by id
-- ReorderProjectNotes: (handled via individual UpdateProjectNote calls)
```

### Wails Bindings

```go
func (a *App) ListProjectNotes(projectId string) ([]ProjectNote, error)
func (a *App) CreateProjectNote(projectId, noteType, title string) (*ProjectNote, error)
func (a *App) UpdateProjectNote(id, title, body, noteType string, pinned bool) error
func (a *App) DeleteProjectNote(id string) error
```

### Events

- `note:created` — payload: `{ projectId, note }`
- `note:updated` — payload: `{ projectId, noteId }`
- `note:deleted` — payload: `{ projectId, noteId }`

## Frontend Components

```
frontend/src/
  shared/ProjectNotes/
    ProjectNotes.tsx          ← grid, [+ Add], collapse toggle
    NoteCard.tsx              ← single card (preview + inline edit)
    NoteCard.css.ts           ← styles
    CreateNoteDialog.tsx      ← type picker + title modal
  components/panes/
    NotesPane.tsx             ← full pane tab (Milkdown editor)
  core/
    signals/notes.ts          ← signals, CRUD helpers
    bindings/notes.ts         ← Go binding wrappers
    types/index.ts            ← ProjectNote type addition
```

### Pane Registration

- Add `'notes'` to `PaneType` union
- Register `NotesPane` in `PaneRegistry.ts`
- Data: `addTabWithData('notes', noteTitle, { noteId, projectId })`

## Dependencies

- Milkdown (`@milkdown/kit`) — already installed
- GSAP — already installed
- `marked` + `DOMPurify` — already installed (for preview rendering)
- No new npm packages required

## Migration

New migration file `XXX_project_notes.up.sql` with the `project_notes` table. Down migration drops the table.

## Scope Boundaries

- No kanban columns (future iteration)
- No branch-scoping (notes are project-level only)
- No search/filter (3-5 notes don't need it)
- No real-time sync between windows (single-user desktop app)
