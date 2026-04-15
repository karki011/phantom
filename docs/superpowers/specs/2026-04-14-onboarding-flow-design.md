# Phantom OS — First Boot Onboarding Flow

**Author:** Subash Karki  
**Date:** 2026-04-14  
**Status:** Approved

## Overview

A cinematic first-boot onboarding experience styled as a system initialization sequence. When a new user opens Phantom OS for the first time, instead of a generic setup wizard, they experience a dramatic "boot sequence" — terminal text typing line by line with sound effects, revealing interactive calibration panels for each subsystem. Inspired by Solo Leveling's "System" notifications.

The onboarding also establishes **consent-based Claude Code integration** — users explicitly opt into phantom-ai MCP registration, project-scoped instructions, and pre-edit hooks. This solves the distribution problem: no silent writes to user config files.

## Goals

1. Memorable first impression that matches Phantom OS's identity
2. Collect operator name, theme, font, sound preferences
3. Get explicit consent for Claude Code AI integration (MCP, hooks, instructions)
4. Store an `onboarding_completed` flag so the flow only runs once
5. Allow re-running from Settings ("Re-initialize System")

## First-Run Detection

- New preference key: `onboarding_completed` (value: ISO timestamp or empty)
- On app load, `App.tsx` checks this key via `usePreferences()` hook
- If missing/empty → render `<OnboardingFlow />` full-screen instead of main shell
- Settings page gets a "Re-initialize System" button that clears the key and reopens the flow

## Data Model

All state is local React state during onboarding. Nothing persists until Phase 5 commits everything at once via batch `PUT /preferences/:key` calls.

### Preference Keys Written on Completion

| Key | Example Value | Source | Editable |
|-----|---------------|--------|----------|
| `onboarding_completed` | `2026-04-14T20:30:00Z` | System | No |
| `operator_name` | `Subash` | User input (pre-filled from git) | Yes |
| `operator_git_name` | `Subash Karki` | `git config user.name` | Read-only |
| `operator_git_email` | `subash@cloudzero.com` | `git config user.email` | Read-only |
| `theme` | `cyberpunk` | User selection | Yes |
| `font_family` | `JetBrains Mono` | User selection | Yes |
| `sounds` | `true` | User toggle | Yes |
| `sounds_style` | `electronic` | User selection | Yes |
| `claude_mcp_enabled` | `true` | User consent | Yes |
| `claude_instructions_enabled` | `true` | User consent | Yes |
| `claude_hooks_enabled` | `false` | User consent | Yes |

## Phase Flow

The boot follows a strict rhythm: **terminal text types in → UI panel slides up → user makes choice → panel dissolves → terminal confirms → next phase.**

Audio runs from the very first frame. A low ambient hum starts immediately and each terminal line gets a sound cue. Timing is deliberate — pauses create tension.

### Pre-Phase: Boot Sequence

Screen is black. Ambient hum fades in over 1s.

```
[SYSTEM]  .  .  .                         ← dots appear one by one, 500ms apart
                                          ← 800ms pause

[SYSTEM]  A new operator has been detected.
                                          ← 600ms pause, subtle pulse sound

[SYSTEM]  Initiating first boot sequence...
                                          ← low rumble builds

[█░░░░░░░░░]  Mounting core filesystem
[██░░░░░░░░]  Loading phantom kernel
[████░░░░░░]  Initializing memory banks
[██████░░░░]  Bootstrapping subsystems
[████████░░]  Calibrating neural pathways
[██████████]  CORE ONLINE                 ← sharp confirmation sound + screen flash
                                          ← 1s pause

[SYSTEM]  All prerequisites satisfied.
[SYSTEM]  Operator calibration required.
```

### Phase 1 — OPERATOR IDENTIFICATION

**Terminal intro:**
```
──────────────────────────────────────────
[PHASE 1 of 5]  OPERATOR IDENTIFICATION
[SYSTEM]  Scanning local identity...
[SCAN ]  git config → identity found
```

**UI Panel:** Shows detected git name/email as read-only confirmation. Single input field for "operator handle" pre-filled with git user.name. A `[ Confirm ]` button styled as a terminal command.

If `git config` returns nothing, fall back to empty input fields.

**Terminal outro:**
```
[SYSTEM]  Operator identity confirmed.
[SYSTEM]  Registering: Subash
[OK    ]  ■ OPERATOR MODULE — LOADED
```

### Phase 2 — DISPLAY CALIBRATION

**Terminal intro:**
```
──────────────────────────────────────────
[PHASE 2 of 5]  DISPLAY CALIBRATION
[SYSTEM]  Scanning display subsystems...
[SYSTEM]  4 display profiles available.
[SYSTEM]  Select your visual identity.
```

**UI Panel:** Grid of 4 theme cards (cz-dark, cyberpunk, nord, dracula). Each card shows a live preview swatch — accent color, background, text sample. Selecting one applies it instantly to the entire onboarding screen (including the terminal text behind the panel). Below the theme grid, a row of 5 font options (JetBrains Mono, Fira Code, Inter, Space Grotesk, IBM Plex Mono) that also live-preview on the terminal text.

**Terminal outro:**
```
[SYSTEM]  Display profile applied.
[OK    ]  ■ DISPLAY MODULE — LOADED
```

### Phase 3 — AUDIO SUBSYSTEM

**Terminal intro:**
```
──────────────────────────────────────────
[PHASE 3 of 5]  AUDIO SUBSYSTEM
[SYSTEM]  Audio subsystem check...
[SYSTEM]  Sound engine ready.
```

**UI Panel:** Toggle switch for sounds on/off. If enabled, 4 style cards (electronic, minimal, warm, retro). Tapping each plays a short preview sound. Quick phase — most users will pick and move on.

**Terminal outro:**
```
[SYSTEM]  Audio subsystem configured.
[OK    ]  ■ AUDIO MODULE — LOADED
```

### Phase 4 — NEURAL LINK (AI Integration)

**Terminal intro:**
```
──────────────────────────────────────────
[PHASE 4 of 5]  NEURAL LINK
[SYSTEM]  Scanning for AI runtimes...
[SCAN ]  . . .
[SCAN ]  Claude Code ── DETECTED
[SYSTEM]  Neural link available.
[SYSTEM]  This will connect Phantom's dependency
          graph directly to your AI runtime.
[SYSTEM]  Authorization required.
```

**UI Panel:** Brief explanation of what phantom-ai does (1-2 sentences + small diagram: "your code → dependency graph → Claude"). Three consent toggles:

1. **Register MCP server** (recommended) — "Adds phantom-ai to ~/.mcp.json so Claude can use your dependency graph"
2. **Project instructions** (recommended) — "Adds guidance to ~/.claude/projects/ so Claude checks dependencies before editing"
3. **Pre-edit hook** (optional) — "Adds a reminder hook so Claude doesn't skip the graph"

Each toggle shows the exact file path that will be modified.

If Claude Code is not detected (`which claude` fails), show toggles dimmed with "Install Claude Code to enable" — settings are stored and applied later when Claude becomes available.

**Terminal outro:**
```
[SYSTEM]  Neural link authorization received.
[OK    ]  ■ NEURAL LINK — 2/3 MODULES ENABLED
```

### Phase 5 — SYSTEM ONLINE

No user interaction. Pure performance.

```
[SYSTEM]  Finalizing configuration...
[WRITE]  Operator profile ·········· OK
[WRITE]  Display calibration ······· OK
[WRITE]  Audio subsystem ··········· OK
[WRITE]  Neural link ··············· OK

[██████████████████████████████] 100%

[SYSTEM]  All systems nominal.

  ╔══════════════════════════════════╗
  ║                                  ║
  ║    P H A N T O M   O S          ║
  ║                                  ║
  ║    ── S Y S T E M  O N L I N E  ║
  ║                                  ║
  ╚══════════════════════════════════╝

```

Ceremony sound plays (if sounds enabled). 2s hold, then fade to main app.

**During this phase, the system:**
1. Batch-writes all preference keys via `PUT /preferences/:key`
2. Calls `applyClaudeIntegration()` if any Claude toggles were enabled
3. Sets `onboarding_completed` timestamp as the final write

## Sound Map

| Moment | Sound | Timing |
|--------|-------|--------|
| Ambient hum | Low drone, continuous | Starts frame 0, fades at Phase 5 |
| Line typing | Soft keystroke clicks | Per character, 30-40ms |
| `[SCAN]` lines | Radar/sonar ping | On line appear |
| `[OK]` / module loaded | Power-up chime | On line complete |
| Progress bar filling | Building intensity tone | Continuous during fill |
| Phase transition separator | Whoosh/transition sweep | Between phases |
| "DETECTED" reveals | Dramatic reveal hit | On the word |
| SYSTEM ONLINE | Bass drop + reverb tail | The big moment |
| Ceremony fanfare | Full ceremony sound | Final 2s hold |

Sound effects reuse the existing ceremony sounds engine (`useCeremonySounds` hook) where possible. New one-shot sounds (scan ping, typing clicks, whoosh) are added to the sounds asset pipeline.

## Component Architecture

### New Files

| File | Purpose |
|------|---------|
| `apps/desktop/src/renderer/components/onboarding/OnboardingFlow.tsx` | Root orchestrator — manages phase state, local config accumulator |
| `apps/desktop/src/renderer/components/onboarding/BootTerminal.tsx` | Typewriter terminal renderer — takes a script of lines with timing/sound cues |
| `apps/desktop/src/renderer/components/onboarding/phases/OperatorPhase.tsx` | Phase 1 UI panel — name input with git pre-fill |
| `apps/desktop/src/renderer/components/onboarding/phases/DisplayPhase.tsx` | Phase 2 — theme grid + font picker with live preview |
| `apps/desktop/src/renderer/components/onboarding/phases/AudioPhase.tsx` | Phase 3 — sound toggle + style picker with previews |
| `apps/desktop/src/renderer/components/onboarding/phases/NeuralLinkPhase.tsx` | Phase 4 — Claude AI consent toggles with file path disclosure |
| `apps/desktop/src/renderer/components/onboarding/phases/SystemOnlinePhase.tsx` | Phase 5 — batch write prefs, final animation sequence |
| `apps/desktop/src/renderer/components/onboarding/boot-scripts.ts` | All terminal line scripts with timing, sound cues, phase transitions |
| `apps/desktop/src/renderer/components/onboarding/useBootAudio.ts` | Hook for ambient hum + one-shot sound effects during boot |
| `packages/server/src/services/claude-integration.ts` | Server-side consent-based MCP registration, project-scoped CLAUDE.md/hooks writing |

### Modified Files

| File | Change |
|------|--------|
| `apps/desktop/src/renderer/App.tsx` | Gate on `onboarding_completed` pref — show `<OnboardingFlow />` or main shell |
| `apps/desktop/src/renderer/components/SettingsPage.tsx` | Add "Re-initialize System" button that clears `onboarding_completed` |
| `packages/server/src/index.ts` | Gate `registerPhantomMcpGlobal()` behind `claude_mcp_enabled` preference check |
| `packages/server/src/services/mcp-config.ts` | Add `registerPhantomMcpForProject()` for project-scoped `~/.claude/projects/` config |

### OnboardingFlow Component Tree

```
OnboardingFlow
├── state: { phase: 0-5, config: {...accumulated choices} }
├── BootTerminal (always rendered, behind phase panels)
│   ├── Renders lines from boot-scripts.ts
│   ├── Fires sound cues via useBootAudio
│   └── Emits onPhaseReady(n) when intro text finishes
│
├── When onPhaseReady fires → slide in the phase panel:
│   ├── OperatorPhase → onComplete({name, gitName, gitEmail})
│   ├── DisplayPhase → onComplete({theme, font}) + live-applies theme
│   ├── AudioPhase → onComplete({sounds, style})
│   ├── NeuralLinkPhase → onComplete({mcp, hooks, instructions})
│   └── SystemOnlinePhase → batch-writes all prefs, triggers finale
│
└── On Phase 5 complete → set onboarding_completed, render main app
```

### BootTerminal Line Format

```ts
type BootLine = {
  text: string;
  delay: number;        // ms pause BEFORE this line
  typeSpeed?: number;    // ms per char (default 35)
  sound?: 'scan' | 'ok' | 'reveal' | 'whoosh' | 'bass' | 'typing';
  flash?: boolean;       // brief screen flash on this line
  glow?: 'cyan' | 'gold'; // line glows accent color after typing
  progress?: number;     // if set, render as progress bar filling to this %
};

type BootScript = {
  prePhase: BootLine[];       // initial boot sequence
  phases: {
    intro: BootLine[];        // terminal lines before panel appears
    outro: BootLine[];        // terminal lines after panel completes
  }[];
  finale: BootLine[];         // Phase 5 system online sequence
};
```

## New API Endpoint

`GET /api/git-identity` — returns the local git config identity for Phase 1 pre-fill.

```json
{
  "name": "Subash Karki",
  "email": "subash.karki@cloudzero.com"
}
```

Server implementation: shell exec `git config user.name` and `git config user.email`. Returns empty strings if not configured.

## Claude Integration Service

`packages/server/src/services/claude-integration.ts`

```ts
export async function applyClaudeIntegration(opts: {
  mcp: boolean;
  instructions: boolean;
  hooks: boolean;
  projectPath: string;
}): Promise<void>
```

**What it writes (all outside the repo):**

| Toggle | Target | Content |
|--------|--------|---------|
| MCP server | `~/.mcp.json` + `~/.claude/settings.json` enabledMcpjsonServers | Existing `registerPhantomMcpGlobal()` logic |
| Instructions | `~/.claude/projects/<sanitized-path>/CLAUDE.md` | Phantom AI usage instructions for Claude |
| Hooks | `~/.claude/projects/<sanitized-path>/settings.json` | PreToolUse hook for Edit/Write reminder |

The sanitized path uses Claude Code's convention: replace `/` with `-`, strip leading `-`.

**Uninstall:** Each toggle has a corresponding removal function. The "Re-initialize System" flow in Settings can also clear all Claude integration files.

## Server Boot Change

Current (`index.ts:282`):
```ts
registerPhantomMcpGlobal(); // runs unconditionally
```

New:
```ts
const mcpEnabled = db.select(...)
  .from(userPreferences)
  .where(eq(userPreferences.key, 'claude_mcp_enabled'))
  .get();

if (mcpEnabled?.value === 'true') {
  registerPhantomMcpGlobal();
}
// If no preference exists (fresh install), skip — onboarding will set it
```

## Styling

- Full-screen black background (`#000` or `--phantom-bg-primary`)
- Terminal text uses the user's chosen font (falls back to JetBrains Mono before Phase 2)
- Text color: `--phantom-accent-cyan` for `[SYSTEM]` prefix, white for content
- `[OK]` lines glow `--phantom-status-success` briefly
- `[SCAN]` lines use `--phantom-accent-gold`
- Phase panels use Mantine components with `--phantom-*` token styling
- Panel slide-in: CSS transform translateY with 300ms ease-out
- Panel dissolve: opacity fade 200ms

## Edge Cases

- **User closes app mid-onboarding:** `onboarding_completed` is not set, so onboarding restarts from Phase 1 on next launch. This is intentional — it's a boot sequence.
- **Git not configured:** Phase 1 falls back to empty input fields. No git identity shown.
- **Claude Code not installed:** Phase 4 shows toggles dimmed. Preferences are still stored. When Claude is later installed and server restarts, it reads `claude_mcp_enabled` and registers then.
- **Re-initialize from Settings:** Clears `onboarding_completed`, reruns the full flow. All existing prefs serve as defaults for the input fields.
- **Multiple projects:** Claude integration writes to project-scoped `~/.claude/projects/<path>/`. Each project gets its own consent state. The MCP global registration is shared (one phantom-ai server for all projects).
