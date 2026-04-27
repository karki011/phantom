# Daily Digest

Author: Subash Karki

The Daily Digest is an automatic developer productivity journal that captures everything you do across all projects in a single day. It lives in the top-right header bar (calendar icon) and writes plain markdown files to disk so your data is always yours.

**Storage:** `~/.phantom-os/journal/YYYY-MM-DD.md`

---

## Four Sections

Every journal entry has exactly four sections: Morning Brief, Work Log, End of Day, and Notes.

### Morning Brief

A snapshot of what happened since yesterday, auto-generated the first time you open Daily Digest for the day.

**Trigger:** Opening the Daily Digest pane when no Morning Brief exists for today. The frontend calls `generateMorningBrief()` automatically on mount.

**Data sources (per project):**

| Source | What it collects |
|--------|-----------------|
| `git log --since="yesterday"` | Commits with messages (top 3 shown, rest summarized) |
| `git log --numstat` | Lines added / removed |
| `gh pr list --state open` | Open PRs with title, number, and URL |
| `gh run list --branch main` | CI status on main (pass/fail) |
| `git for-each-ref` | Stale branches (>1 week since last commit) |
| Sessions DB | Session count, total cost, total tokens, per-session first prompt |
| Sessions DB | Completed task count |
| `git worktree list` | Active worktree count |

**Grouping:** Results are grouped by project name in bold headers like `**[my-project]**`.

**Immutability:** Once generated, the Morning Brief is locked (lock icon in the UI). The `morningGeneratedAt` timestamp in YAML frontmatter prevents regeneration. This ensures the historical record does not drift.

**Sample output:**

```
Since yesterday:

**[phantom-os]**
- 4 commits on feature/daily-digest
  · Add journal generator with git data collection
  · Wire session watcher to journal appender
  · Implement work log deduplication
  · ...and 1 more
- +342 / -28 lines
- [PR #47](https://github.com/user/phantom-os/pull/47) open: "Daily Digest feature"
- CI: success on main

- 3 sessions, $2.41 spent, 48k tokens
  · Add journal generator with git data collection
  · Fix session enricher aggregate query
- 2 tasks completed
- 3 active worktrees
```

### Work Log

A real-time timeline of events that auto-populates throughout the day. You never write to it manually — the backend appends entries as things happen.

**Events captured:**

| Event | Source | Format |
|-------|--------|--------|
| Session started | `session_watcher.go` | `HH:MM [project] Session started` |
| Session ended | `session_watcher.go` | `HH:MM Session ended (abc12345), 48K tokens, $2.41` |
| Git commit | `activity_poller.go` | `HH:MM [project] Committed: message text` |
| Git push | `activity_poller.go` | `HH:MM [project] Pushed to remote` |
| Agent spawned | `activity_poller.go` | `HH:MM [project] Spawned agent: task description` |
| PR opened | `background.go` | `HH:MM [project] PR #47 opened: 'title'` |
| PR merged | `background.go` | `HH:MM [project] PR #47 merged` |
| CI passed | `background.go` | `HH:MM [project] CI: ✓ all checks passed` |
| CI failed | `background.go` | `HH:MM [project] CI: ✗ failed` |
| Branch switched | `app.go` (git watcher) | `HH:MM Switched branch` |
| Ward triggered | `safety/service.go` | `HH:MM ⚠️ Ward triggered: rule-name` |

**Deduplication:** If the same event (after stripping the `HH:MM` timestamp prefix) is appended within 30 seconds, it is silently skipped. This handles git watchers and fsnotify events that fire multiple times for the same action.

**Filtering:** When a project is selected in the dropdown, the work log filters to lines containing `[project-name]`.

### End of Day

A summary of today's totals, auto-generated when the last active session ends.

**Triggers:**
1. **Automatic:** The `session_watcher` emits a `journal:eod-trigger` event when it detects zero remaining active sessions. The frontend listens for this and calls `generateEndOfDay()`.
2. **Manual:** Click the "Generate End of Day Recap" button.

**Content includes:**

- Total commits, files touched, lines added/removed
- Session count, cost, tokens, tool calls
- Per-session first prompt summaries (what each session worked on)
- Per-project breakdown with commit messages (top 3)
- Merged PRs today (with links)
- Still-open PRs (with links)
- Completed task count
- Pending task count

**Immutability:** Same as Morning Brief — once generated, the `eodGeneratedAt` timestamp locks it.

**Sample output:**

```
Today: 7 commits, 12 files touched, +456/-89 lines
Sessions: 3, $4.12 spent, 96k tokens, 247 tool calls
  · Add journal generator with git data collection
  · Fix session enricher aggregate query

- [phantom-os] 5 commits, 8 files changed (+312/-45)
  · Add journal generator with git data collection
  · Wire session watcher to journal appender
  · Implement work log deduplication
  · ...and 2 more
- [phantom-os] [PR #47](https://github.com/user/phantom-os/pull/47) merged: "Daily Digest feature"

Tasks completed: 3
- 1 task still pending
```

### Notes

A free-text area for personal annotations. This is the only user-editable section.

- Auto-saves with a 1-second debounce after you stop typing
- Persists directly in the `## Notes` section of the markdown file
- Survives date navigation and app restarts

---

## Project Filtering

The project dropdown in the date navigation bar filters the digest by project.

**How it works:**

- **All Projects (default):** Reads `~/.phantom-os/journal/YYYY-MM-DD.md`
- **Specific project:** Reads `~/.phantom-os/journal/YYYY-MM-DD--project-name.md`

Project-scoped journal files use the format `{date}--{sanitized-project-name}.md` where slashes, spaces, and backslashes in the project name are replaced with hyphens.

When a project is selected:
- Morning Brief and End of Day are generated with only that project's data
- Work Log lines are filtered client-side to lines containing `[project-name]`

---

## Date Navigation

The date navigation bar sits at the top of the Daily Digest pane.

| Control | Action |
|---------|--------|
| **◀** (left arrow) | Go to previous day |
| **▶** (right arrow) | Go to next day (disabled if already on today) |
| **Today** button | Jump back to today (only shown when viewing a past date) |
| **Calendar icon + date** | Shows the full date (e.g., "Friday, April 25, 2026") |
| **Project dropdown** | Filter by project (only shown when projects exist) |

---

## File Format

Journal files are plain markdown with YAML frontmatter. Here is a complete example:

```markdown
---
date: "2026-04-25"
morningGeneratedAt: 1745571234567
eodGeneratedAt: 1745603456789
---

## Morning Brief

Since yesterday:

**[phantom-os]**
- 4 commits on feature/daily-digest
  · Add journal generator with git data collection
  · Wire session watcher to journal appender
  · Implement work log deduplication
  · ...and 1 more
- +342 / -28 lines
- [PR #47](https://github.com/user/phantom-os/pull/47) open: "Daily Digest feature"

- 3 sessions, $2.41 spent, 48k tokens
- 2 tasks completed

## Work Log

- 09:12 [phantom-os] Session started
- 09:34 [phantom-os] Committed: Add journal generator with git data collection
- 09:35 [phantom-os] Pushed to remote
- 10:02 [phantom-os] Spawned agent: Fix test failures
- 10:43 Session ended (9b917f44), 48K tokens, $2.41
- 11:15 [phantom-os] Session started
- 11:30 [phantom-os] CI: ✓ all checks passed
- 11:45 [phantom-os] PR #47 opened: 'Daily Digest feature'
- 12:10 Session ended (a3c45d12), 22K tokens, $1.23
- 14:00 Switched branch
- 15:30 ⚠️ Ward triggered: no-force-push

## End of Day

Today: 7 commits, 12 files touched, +456/-89 lines
Sessions: 3, $4.12 spent, 96k tokens, 247 tool calls

- [phantom-os] 5 commits, 8 files changed (+312/-45)
  · Add journal generator with git data collection
  · Wire session watcher to journal appender
  · Implement work log deduplication

Tasks completed: 3

## Notes

Good progress on the digest feature. Need to add
enrichment for worktree create/remove events tomorrow.
```

**Frontmatter fields:**

| Field | Type | Purpose |
|-------|------|---------|
| `date` | string | ISO date (`YYYY-MM-DD`) |
| `morningGeneratedAt` | int64 or `null` | Unix millisecond timestamp; non-null means Morning Brief is locked |
| `eodGeneratedAt` | int64 or `null` | Unix millisecond timestamp; non-null means End of Day is locked |

---

## Enrichment Pipeline

The `SessionEnricher` runs a background enrichment loop every 60 seconds for all active sessions and also fires on session completion.

**What it computes per session:**

| Field | Source |
|-------|--------|
| Files touched | Unique file paths from `tool:read`, `tool:edit`, `tool:write` activity events |
| Git commits | Count of `git:commit` activity events |
| Lines added/removed | Parsed from git diff stat patterns in activity event metadata |
| Summary | Heuristic: first prompt text + file count + commit count |
| Outcome | `completed` or `abandoned` (if message count <= 1) |
| Branch | Extracted from `git:checkout` / `git:branch` activity events |
| PR URL + status | Parsed from `git:push` activity event metadata |

**Daily stats aggregation:** After enriching a session, the enricher upserts into a `daily_stats` table with totals for the date: session count, total duration, total cost, total tokens, total tool calls, total commits. Aggregated per project.

---

## Integration Points

The Daily Digest is a passive consumer. Other subsystems push events into it via the `journalAppender` interface (a single method: `AppendWorkLog(date, line string)`).

| Subsystem | File | Events pushed |
|-----------|------|---------------|
| Session Watcher | `collector/session_watcher.go` | Session start, session end (with tokens + cost) |
| Activity Poller | `collector/activity_poller.go` | Git commit, git push, agent spawn |
| GitHub Poller | `app/background.go` | PR opened, PR merged, CI pass, CI fail |
| Git Watcher | `app/app.go` | Branch switched |
| Safety Service | `safety/service.go` | Ward triggered |

**Wails events that refresh the UI:**

| Event | Effect |
|-------|--------|
| `session:new` | Reload today's entry (new work log lines) |
| `session:end` | Reload today's entry |
| `session:stale` | Reload today's entry |
| `journal:eod-trigger` | Auto-generate End of Day recap |

---

## Configuration

The Daily Digest requires no configuration. Everything is automatic:

- **File location:** `~/.phantom-os/journal/` (created on first use)
- **Morning Brief:** Auto-generates on first pane open of the day
- **Work Log:** Auto-populates from backend events in real-time
- **End of Day:** Auto-generates when the last session ends
- **Notes:** Auto-saves with 1-second debounce
- **Enrichment:** Runs every 60 seconds for active sessions
- **Deduplication:** 30-second window for identical work log entries
- **Immutability:** Morning Brief and End of Day are write-once per day (prevents data drift from re-generation)
