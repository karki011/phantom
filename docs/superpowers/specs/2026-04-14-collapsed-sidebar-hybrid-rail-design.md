# Collapsed Sidebar — Hybrid Rail + Activity Pulse

**Date:** 2026-04-14
**Author:** Subash Karki
**Status:** Approved

## Problem

When the left sidebar is collapsed (40px), users lose all context about projects, worktrees, active sessions, and pending changes. The collapsed state shows only a single expand chevron.

## Solution

Replace the collapsed state with a vertical icon rail showing per-project letter avatars with status indicators, tooltips, and footer actions.

## Collapsed Layout

```
┌─────────┐  40px wide
│   ◀▶    │  Expand chevron (existing)
│─────────│
│   [P]●  │  Project avatar — cyan pulse ring = has active worktree
│   (A)   │  Project avatar — dimmed, no ring
│   (F)•  │  Project avatar — gold dot = uncommitted changes
│─────────│
│   ⚠     │  Warning icon (only if ANY worktree is invalid)
│─────────│
│    +    │  Add project
│    ⚙    │  Manage projects
└─────────┘
```

## Component Design

### Inline `CollapsedSidebar` in WorktreeSidebar.tsx

Not a separate file. Rendered when `collapsed === true`. Uses existing atoms already in scope: `projects`, `worktreesByProject`, `activeWorktreeId`, `setCollapsed`, `setExpandedProjects`.

### Per-Project Avatar

- **Shape**: 28px circle, 2px border
- **Letter**: First character of `project.name`, uppercase, 12px bold
- **Background**: `project.color` at 20% opacity (fallback `--phantom-accent-purple`)
- **Text color**: `project.color` (fallback `--phantom-accent-purple`)
- **Active ring**: Project containing active worktree gets 2px solid `var(--phantom-accent-cyan, #00d4ff)` border + `ceremony-breathe` animation
- **Inactive**: 2px solid transparent border, 60% opacity
- **Starred overlay**: 6px gold star at top-right corner

### Changes Badge

- 8px gold circle at bottom-right of avatar
- Shown only on the active project when `gitChangesCountAtom > 0`
- Color: `--phantom-accent-gold`
- No new polling or atoms needed — derives from existing right sidebar git status

### Invalid Worktree Warning

- Single `AlertTriangle` icon below the project list
- Only renders if any worktree has `worktreeValid === false`
- Tooltip: "1 worktree has issues — expand to fix" (with actual count)
- Color: `--phantom-status-warning`

### Tooltip

Mantine `<Tooltip>` with `position="right"`, `multiline`, `openDelay={300}`:
```
phantom-os
▸ skk (main) ← active
▸ feature-x (feature/sidebar)
2 worktrees
```

### Click Behavior

Click avatar → expand sidebar + auto-expand that project in the list. Does NOT change `activeWorktreeId`.

### Footer Icons

Two icons only in collapsed mode:
- `Plus` (14px) → open repository picker
- `Settings2` (14px) → open manage projects modal (only if projects exist)

Both with `<Tooltip position="right">`.

### Animation

Reuses existing `ceremony-breathe` keyframe for the active project ring pulse.

## Files Changed

1. `apps/desktop/src/renderer/components/sidebar/WorktreeSidebar.tsx` — replace collapsed branch (lines 226-244)

No new files, no new atoms, no new API calls.

## Data Dependencies

| Data | Source | Already Available |
|------|--------|-------------------|
| Projects list | `projectsAtom` | Yes |
| Worktrees per project | `worktreesByProjectAtom` | Yes |
| Active worktree ID | `activeWorktreeIdAtom` | Yes |
| Git changes count | `gitChangesCountAtom` | Yes (import from fileExplorer atoms) |
| Worktree validity | `WorktreeData.worktreeValid` | Yes |
