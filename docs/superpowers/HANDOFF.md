# PhantomOS v2 — Session Handoff

**Date:** 2026-04-20
**Author:** Subash Karki
**Session:** Chrome Shell + Onboarding Redesign + Settings Sidebar

---

## What Was Done This Session

### Chrome Shell (Wave 4)

| Component | What |
|-----------|------|
| StatusStrip | Fixed top bar — "PHANTOM OS" brand, active sessions, burn rate, tokens, live status dot |
| Dock | Fixed bottom nav — 9 screen buttons with Unicode icons, active glow, accent box-shadow |
| CommandPalette | ⌘K overlay — fuzzy search, arrow/enter/escape keyboard nav, backdrop dismiss |
| Screen Router | Switch/Match routing for all 9 screen IDs in app.tsx (placeholder screens) |

### Onboarding Redesign (7-Phase Cinematic Flow)

Rebuilt from 5 hardcoded phases → 7 data-driven phases with auto-accept timers.

**Architecture:**
```
screens/onboarding/
├── config/          types.ts, phases.ts, voice.ts (all content as data)
├── engine/          PhaseRunner, AutoTimer, AbilityReveal
├── phases/          BootTerminal, IdentityBind, DomainSelect, DomainLink,
│                    AbilityAwaken, WardConfig, Awakening
├── styles/          flow, boot, panel, phases, ability, awakening (.css.ts)
├── OnboardingFlow.tsx, PhasePanel.tsx, index.ts
```

**Phase flow:**
1. Awakening — dynamic boot (session count), new vocabulary (tracing, anchoring, binding)
2. Identity Lock — git name auto-detect, 5s countdown, "Lock In" CTA
3. Domain Selection — 6 themes + 3 fonts, 2s auto-resolve, 80px preview cards
4. Domain Link — project scanner, "Scan Environment" + "Skip for Now", 8s auto-resolve
5. Ability Awakening — 5 abilities revealed sequentially, speech-synced (await speech before next)
6. Ward Configuration — 3 defense levels, vertical card layout, 5s auto-resolve to balanced
7. Complete Awakening — summary, "Authority level: GRANTED", hunter profile card, "ENTER SYSTEM"

**Post-onboarding:** CRT power-on sweep transition (accent line sweeps top→bottom, overlay fades)

### Settings Screen (Sidebar Layout)

Refactored to Kobalte Tabs with vertical orientation:
- 220px sidebar with 6 sections
- Content area shows selected section
- [data-selected] accent styling on active tab
- Danger Zone tab has red styling

### Infrastructure

- Installed `@kobalte/core` — headless UI components (ToggleGroup, Switch, TextField, Tabs)
- Activated `@vanilla-extract/sprinkles` — type-safe utility classes wrapping all 76 theme tokens
- Centralized voice preset: rate 0.84, pitch 0.72
- All timers tracked and cleaned up in onCleanup
- SolidJS reactivity reviewed: proper Show/For, no destructured props, getters for reactive ctx

### Code Quality

- 3-agent simplify review (reuse, quality, efficiency) — fixed timer leaks, derived state, dead code
- 2-agent code review (CLAUDE.md compliance, bug scan) — fixed hardcoded colors, onCleanup in async handler
- SolidJS-specific review — fixed `{condition && <JSX/>}` → `<Show>`, reactive prop getter, createMemo → plain functions

---

## What's Next

### Screen 2: Command Center (Next)

The main dashboard — first screen built with sprinkles + Kobalte from scratch.

| Feature | Component |
|---------|-----------|
| 3-column layout | Project tree / session card grid / system feed |
| Session cards | Name, model, tokens, cost, context bar |
| Context menus | Kobalte ContextMenu on session cards |
| Project tree | Grouped by repo, expandable |
| System feed | Live activity log (Wails events) |
| Tooltips | Kobalte Tooltip on metric values |

### Screen Build Sequence (after Command Center)

| Order | Screen | Key Feature |
|-------|--------|-------------|
| 3 | Smart View | Structured Claude events, accept/reject, token ledger |
| 4 | Git Ops | Branches, commits, diffs, stash |
| 5 | Eagle Eye | Worktree table, parallel fetch |
| 6 | Wards | Rule list, YAML editor, audit trail |
| 7 | CodeBurn | Burn rate, cost history, projections |
| 8 | Hunter Stats | XP, achievements, heatmap |

---

## Key File Locations

| What | Path |
|------|------|
| Go backend | `v2/internal/` |
| Frontend src | `v2/frontend/src/` |
| Chrome shell | `v2/frontend/src/chrome/` |
| Onboarding config | `v2/frontend/src/screens/onboarding/config/` |
| Onboarding engine | `v2/frontend/src/screens/onboarding/engine/` |
| Onboarding phases | `v2/frontend/src/screens/onboarding/phases/` |
| Onboarding styles | `v2/frontend/src/screens/onboarding/styles/` |
| Settings | `v2/frontend/src/screens/settings/` |
| Sprinkles | `v2/frontend/src/styles/sprinkles.css.ts` |
| Theme contract | `v2/frontend/src/styles/theme.css.ts` |
| Audio engine | `v2/frontend/src/core/audio/engine.ts` |
| Shared components | `v2/frontend/src/shared/` |
| Specs | `docs/superpowers/specs/` |

---

## Commands

```bash
# Build Go
cd /Users/subash.karki/phantom-os/v2 && go build ./...

# Run all tests
go test -race -count=1 -timeout=120s ./...

# Frontend typecheck
cd /Users/subash.karki/phantom-os/v2/frontend && pnpm typecheck

# Run app in dev mode
cd /Users/subash.karki/phantom-os/v2 && wails dev

# Reset onboarding (to re-test)
sqlite3 ~/.phantom-os/phantom.db "DELETE FROM user_preferences WHERE key = 'onboarding_completed';"
```

---

## Resume Instructions

1. Read this handoff
2. Start with Screen 2: Command Center (3-column layout, session cards, live feed)
3. Use sprinkles for layout/spacing, `style()` for complex visuals, Kobalte for interactions
4. Use `model: "sonnet"` for implementation agents, `model: "opus"` for research only
5. Spawn agents with `bypassPermissions` mode
