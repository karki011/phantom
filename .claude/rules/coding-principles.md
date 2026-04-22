# Coding Principles — PhantomOS

These principles guide all code in PhantomOS — human and machine-generated alike.

---

## Core Principles

### KISS — Keep It Simple
Write the simplest code that solves the problem. No clever abstractions, nested ternaries, or multi-level indirection. If a developer can't understand it in 30 seconds, simplify it.

### YAGNI — You Aren't Gonna Need It
Don't build for hypothetical future requirements. No speculative abstractions, unused parameters, or "just in case" code paths.

### DRY — Don't Repeat Yourself
Extract shared logic only when duplication is **proven** (3+ occurrences). Three similar lines beat a premature abstraction. When extracting, put shared components in `src/shared/` with co-located styles.

### Composition Over Inheritance
Prefer composing small, focused components over deep inheritance. In SolidJS, this means signals + props + component composition.

---

## PhantomOS-Specific Rules

### Theme System
- **Always** use `vars` from `styles/theme.css.ts` for colors, spacing, radius, shadows, fonts
- **Never** hardcode hex colors, pixel values, or font-family strings
- Three font tokens: `vars.font.display` (titles), `vars.font.body` (UI text), `vars.font.mono` (code/paths/system)
- Use `color-mix(in srgb, ${vars.color.accent} N%, ${vars.color.border})` for accent-tinted borders

### Vanilla Extract
- Co-locate `.css.ts` files next to their component
- Use `selectors` for pseudo-classes and data attributes: `'&:hover'`, `'[data-selected] &'`
- Use `globalStyle()` for child element selectors (`& input`, `& textarea`) — Vanilla Extract blocks these in `style()`
- Use `keyframes()` for animations

### Kobalte Components
- Prefer Kobalte primitives over custom HTML: Tabs, Dialog, TextField, Collapsible, Checkbox, Select, Skeleton, Progress, Toast, Separator
- Follow the wrapper pattern (see `src/shared/Tip/Tip.tsx`): thin component → Kobalte primitive → co-located `.css.ts`
- Use `PhantomModal` for all dialogs — don't create raw `Dialog` usage
- Use `buttonRecipe` from `recipes.css.ts` for all buttons — don't create custom button styles
- `activationMode="manual"` on `Tabs` to prevent focus-based activation conflicts

### SolidJS Reactivity
- `createSignal` for local state, `createStore` + `produce` for complex state
- `createMemo` for derived computations, `createEffect` for side effects
- Never access signals outside tracking scope (no signal reads in event handlers without wrapping)
- Use `queueMicrotask` to defer store updates that depend on DOM rendering (e.g., adding a tab then activating it)

### Component Patterns
- Shared/reusable → `src/shared/{ComponentName}/` with `.tsx` + `.css.ts`
- Feature-specific → `src/components/{area}/`
- `PhantomLoader` for all loading states
- `showToast()` / `showWarningToast()` for success/warning notifications
- Minimum UX delays: 600ms scan, 800ms add/remove — so users see the loading feedback

### Go Backend
- Wails bindings in `internal/app/bindings_*.go`
- Git operations in `internal/git/`
- Always check for existing records before creating (dedup)
- Use `sql.NullString`/`sql.NullInt64` for nullable fields
- Regenerate sqlc after SQL query changes: `~/go/bin/sqlc generate`

### Terminal
- xterm.js sessions live in the Terminal Runtime Registry (`core/terminal/registry.ts`)
- Sessions survive component unmount/remount — use `hasSession()` → `attachSession()` for reattach
- Skip PhantomLoader on reattach (set `loading = false` at init if session exists)
- Use `MONO_FONT_FAMILY` constant or `currentMonoFont()` signal — never hardcode font strings

---

## Anti-Patterns

| Anti-Pattern | What To Do Instead |
|---|---|
| `window.prompt()` / `window.alert()` | Use `PhantomModal` |
| Custom button styles | Use `buttonRecipe({ variant, size })` |
| Raw `<input>` / `<textarea>` | Use Kobalte `TextField` |
| Manual `role="tablist"` / `aria-selected` | Use Kobalte `Tabs` |
| Hardcoded font-family strings | Use `vars.font.*` tokens |
| Inline hex colors | Use `vars.color.*` tokens |
| `& child` selectors in `style()` | Use `globalStyle()` |
| `produce` with simultaneous tab push + activate | Split: push first, `queueMicrotask` activate second |

---

## File Organization

```
frontend/src/
  shared/           # Reusable components (PhantomModal, Toast, CloneDialog, etc.)
  components/       # Feature-specific UI (sidebar, panes, layout)
  core/             # Signals, bindings, store, types
  styles/           # Global theme, recipes, sprinkles, animations
  screens/          # Full-screen views (onboarding)

internal/
  app/              # Wails bindings
  db/               # SQLite queries (sqlc)
  git/              # Git operations
  tui/              # Bubbletea programs
  terminal/         # PTY management
```
