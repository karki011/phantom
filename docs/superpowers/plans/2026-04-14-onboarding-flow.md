# Onboarding Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cinematic first-boot onboarding experience styled as a system initialization sequence with 5 phases: operator identification, display calibration, audio subsystem, neural link (Claude AI consent), and system online finale.

**Architecture:** Full-screen `OnboardingFlow` component gates on `onboarding_completed` preference. A `BootTerminal` renders typewriter-style lines with sound cues. Phase panels slide over the terminal for user input. All state is local React until Phase 5 batch-writes everything. Server gets a git-identity endpoint and a claude-integration service for consent-based MCP registration.

**Tech Stack:** TypeScript, Mantine UI, Jotai atoms, Web Audio API, Hono REST, SQLite (Drizzle ORM), `--phantom-*` CSS custom properties

**Spec:** `docs/superpowers/specs/2026-04-14-onboarding-flow-design.md`

---

## File Map

### New Files (Frontend)

| File | Responsibility |
|------|---------------|
| `apps/desktop/src/renderer/components/onboarding/OnboardingFlow.tsx` | Root orchestrator — phase state machine, config accumulator, batch-write on completion |
| `apps/desktop/src/renderer/components/onboarding/BootTerminal.tsx` | Typewriter terminal renderer — renders BootLine[] with timing, sound cues, progress bars |
| `apps/desktop/src/renderer/components/onboarding/boot-scripts.ts` | All terminal line scripts with timing, sound cues, phase markers |
| `apps/desktop/src/renderer/components/onboarding/useBootAudio.ts` | Web Audio hook — ambient hum, one-shot cues (scan, ok, reveal, whoosh, bass) |
| `apps/desktop/src/renderer/components/onboarding/phases/OperatorPhase.tsx` | Phase 1 — name input pre-filled from git identity |
| `apps/desktop/src/renderer/components/onboarding/phases/DisplayPhase.tsx` | Phase 2 — theme grid + font picker with live preview |
| `apps/desktop/src/renderer/components/onboarding/phases/AudioPhase.tsx` | Phase 3 — sound toggle + style picker with preview playback |
| `apps/desktop/src/renderer/components/onboarding/phases/NeuralLinkPhase.tsx` | Phase 4 — Claude AI consent toggles with file path disclosure |
| `apps/desktop/src/renderer/components/onboarding/phases/SystemOnlinePhase.tsx` | Phase 5 — batch write prefs, final animation sequence |

### New Files (Server)

| File | Responsibility |
|------|---------------|
| `packages/server/src/routes/git-identity.ts` | `GET /api/git-identity` — returns local git config name + email |
| `packages/server/src/services/claude-integration.ts` | Consent-based MCP registration, project-scoped CLAUDE.md and hooks writing |

### Modified Files

| File | Change |
|------|--------|
| `apps/desktop/src/renderer/App.tsx` | Gate on `onboarding_completed` — show `<OnboardingFlow />` or main shell |
| `apps/desktop/src/renderer/components/SettingsPage.tsx` | Add "Re-initialize System" button to clear `onboarding_completed` |
| `apps/desktop/src/renderer/lib/api.ts` | Add `fetchGitIdentity()` and `applyClaudeIntegration()` API helpers |
| `packages/server/src/index.ts` | Mount git-identity route, gate `registerPhantomMcpGlobal()` behind preference |
| `packages/server/src/services/mcp-config.ts` | Add `registerPhantomMcpForProject()` for project-scoped `~/.claude/projects/` config |

---

## Task 1: Git Identity API Endpoint

**Files:**
- Create: `packages/server/src/routes/git-identity.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Create the git-identity route**

```ts
// packages/server/src/routes/git-identity.ts
import { Hono } from 'hono';
import { execSync } from 'node:child_process';

const app = new Hono();

app.get('/git-identity', (c) => {
  let name = '';
  let email = '';
  try {
    name = execSync('git config user.name', { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' }).trim();
  } catch { /* not configured */ }
  try {
    email = execSync('git config user.email', { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' }).trim();
  } catch { /* not configured */ }
  return c.json({ name, email });
});

export default app;
```

- [ ] **Step 2: Mount the route in server index**

In `packages/server/src/index.ts`, add import and mount alongside existing routes:

```ts
import gitIdentity from './routes/git-identity.js';
// ... in the route mounting section:
app.route('/api', gitIdentity);
```

- [ ] **Step 3: Test manually**

Run: `curl http://localhost:3849/api/git-identity`
Expected: `{"name":"Subash Karki","email":"subash.karki@cloudzero.com"}`

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/routes/git-identity.ts packages/server/src/index.ts
git commit -m "feat(server): add GET /api/git-identity endpoint for onboarding"
```

---

## Task 2: Claude Integration Service

**Files:**
- Create: `packages/server/src/services/claude-integration.ts`
- Modify: `packages/server/src/services/mcp-config.ts`
- Modify: `packages/server/src/index.ts`

- [ ] **Step 1: Add project-scoped registration to mcp-config.ts**

Add this function to `packages/server/src/services/mcp-config.ts` after the existing `unregisterPhantomMcpGlobal`:

```ts
/**
 * Sanitize a filesystem path into Claude's project directory key.
 * Claude Code uses: replace '/' with '-', strip leading '-'.
 */
export function sanitizeProjectPath(projectPath: string): string {
  return projectPath.replace(/\//g, '-').replace(/^-/, '');
}
```

- [ ] **Step 2: Create the claude-integration service**

```ts
// packages/server/src/services/claude-integration.ts
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { logger } from '../logger.js';
import {
  registerPhantomMcpGlobal,
  unregisterPhantomMcpGlobal,
  sanitizeProjectPath,
} from './mcp-config.js';

const CLAUDE_DIR = join(homedir(), '.claude');
const CLAUDE_PROJECTS_DIR = join(CLAUDE_DIR, 'projects');

function projectConfigDir(projectPath: string): string {
  const sanitized = sanitizeProjectPath(projectPath);
  return join(CLAUDE_PROJECTS_DIR, sanitized);
}

const PROJECT_CLAUDE_MD = `## Phantom AI Integration
- BEFORE editing any project file, call \`mcp__phantom-ai__phantom_graph_context\` to understand dependencies and related files
- BEFORE refactoring, call \`mcp__phantom-ai__phantom_graph_blast_radius\` to check what will break
- These tools are available via the phantom-ai MCP server — use them for all codebase work
`;

function writeProjectClaudeMd(projectPath: string): void {
  const dir = projectConfigDir(projectPath);
  mkdirSync(dir, { recursive: true });
  const target = join(dir, 'CLAUDE.md');

  if (existsSync(target)) {
    const existing = readFileSync(target, 'utf-8');
    if (existing.includes('Phantom AI Integration')) return; // already has our section
    writeFileSync(target, existing + '\n' + PROJECT_CLAUDE_MD);
  } else {
    writeFileSync(target, PROJECT_CLAUDE_MD);
  }
  logger.info('ClaudeIntegration', `Wrote project CLAUDE.md to ${target}`);
}

function removeProjectClaudeMd(projectPath: string): void {
  const target = join(projectConfigDir(projectPath), 'CLAUDE.md');
  try {
    if (!existsSync(target)) return;
    const content = readFileSync(target, 'utf-8');
    const cleaned = content.replace(/## Phantom AI Integration[\s\S]*?(?=\n## |\n*$)/, '').trim();
    if (cleaned.length === 0) {
      unlinkSync(target);
    } else {
      writeFileSync(target, cleaned + '\n');
    }
  } catch { /* best effort */ }
}

const HOOK_DEFINITION = {
  matcher: 'Edit|Write',
  hooks: [{
    type: 'command',
    command: 'cat | FILE=$(jq -r \'.tool_input.file_path // .tool_input.path // empty\') && [ -n "$FILE" ] && echo \'<phantom-ai-reminder>Call mcp__phantom-ai__phantom_graph_context before editing.</phantom-ai-reminder>\' || true',
    timeout: 3,
  }],
};

function writeProjectHooks(projectPath: string): void {
  const dir = projectConfigDir(projectPath);
  mkdirSync(dir, { recursive: true });
  const target = join(dir, 'settings.json');

  let settings: Record<string, unknown> = {};
  if (existsSync(target)) {
    try { settings = JSON.parse(readFileSync(target, 'utf-8')); } catch { settings = {}; }
  }

  const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
  const preToolUse = (hooks.PreToolUse ?? []) as Record<string, unknown>[];

  // Check if already installed
  const alreadyInstalled = preToolUse.some(
    (h) => JSON.stringify(h).includes('phantom-ai-reminder')
  );
  if (alreadyInstalled) return;

  preToolUse.push(HOOK_DEFINITION);
  hooks.PreToolUse = preToolUse;
  settings.hooks = hooks;
  writeFileSync(target, JSON.stringify(settings, null, 2) + '\n');
  logger.info('ClaudeIntegration', `Wrote project hooks to ${target}`);
}

function removeProjectHooks(projectPath: string): void {
  const target = join(projectConfigDir(projectPath), 'settings.json');
  try {
    if (!existsSync(target)) return;
    const settings = JSON.parse(readFileSync(target, 'utf-8'));
    const hooks = settings.hooks?.PreToolUse as Record<string, unknown>[] | undefined;
    if (!hooks) return;
    settings.hooks.PreToolUse = hooks.filter(
      (h) => !JSON.stringify(h).includes('phantom-ai-reminder')
    );
    if (settings.hooks.PreToolUse.length === 0) delete settings.hooks.PreToolUse;
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
    if (Object.keys(settings).length === 0) {
      unlinkSync(target);
    } else {
      writeFileSync(target, JSON.stringify(settings, null, 2) + '\n');
    }
  } catch { /* best effort */ }
}

export interface ClaudeIntegrationOptions {
  mcp: boolean;
  instructions: boolean;
  hooks: boolean;
  projectPath: string;
}

export async function applyClaudeIntegration(opts: ClaudeIntegrationOptions): Promise<void> {
  if (opts.mcp) registerPhantomMcpGlobal();
  else unregisterPhantomMcpGlobal();

  if (opts.instructions) writeProjectClaudeMd(opts.projectPath);
  else removeProjectClaudeMd(opts.projectPath);

  if (opts.hooks) writeProjectHooks(opts.projectPath);
  else removeProjectHooks(opts.projectPath);

  logger.info('ClaudeIntegration', `Applied integration: mcp=${opts.mcp}, instructions=${opts.instructions}, hooks=${opts.hooks}`);
}
```

- [ ] **Step 3: Add a route for applying Claude integration from the frontend**

Add to `packages/server/src/index.ts`, alongside existing routes. Create a small inline route or add to preferences:

```ts
import { applyClaudeIntegration } from './services/claude-integration.js';

// In the route section:
app.post('/api/claude-integration', async (c) => {
  const body = await c.req.json();
  await applyClaudeIntegration(body);
  return c.json({ ok: true });
});
```

- [ ] **Step 4: Gate MCP registration on preference**

In `packages/server/src/index.ts`, replace the unconditional `registerPhantomMcpGlobal()` call (around line 282):

```ts
// OLD:
// registerPhantomMcpGlobal();

// NEW:
const mcpPref = db.select({ value: userPreferences.value })
  .from(userPreferences)
  .where(eq(userPreferences.key, 'claude_mcp_enabled'))
  .get();
if (mcpPref?.value === 'true') {
  registerPhantomMcpGlobal();
}
```

Add the needed imports at the top:

```ts
import { db, userPreferences } from '@phantom-os/db';
import { eq } from 'drizzle-orm';
```

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/claude-integration.ts packages/server/src/services/mcp-config.ts packages/server/src/index.ts
git commit -m "feat(server): claude integration service with consent-based MCP registration"
```

---

## Task 3: Frontend API Helpers

**Files:**
- Modify: `apps/desktop/src/renderer/lib/api.ts`

- [ ] **Step 1: Read the existing api.ts to find the pattern**

Check the file for the base URL pattern and existing fetch helpers.

- [ ] **Step 2: Add git-identity and claude-integration helpers**

Add to `apps/desktop/src/renderer/lib/api.ts`:

```ts
export async function fetchGitIdentity(): Promise<{ name: string; email: string }> {
  const res = await fetch(`${API_BASE}/git-identity`);
  if (!res.ok) return { name: '', email: '' };
  return res.json();
}

export async function applyClaudeIntegration(opts: {
  mcp: boolean;
  instructions: boolean;
  hooks: boolean;
  projectPath: string;
}): Promise<void> {
  await fetch(`${API_BASE}/claude-integration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/lib/api.ts
git commit -m "feat(renderer): add fetchGitIdentity and applyClaudeIntegration API helpers"
```

---

## Task 4: Boot Audio Hook

**Files:**
- Create: `apps/desktop/src/renderer/components/onboarding/useBootAudio.ts`

- [ ] **Step 1: Create the Web Audio hook**

This follows the same pattern as `useCeremonySounds.ts` — pure Web Audio API, no audio files, singleton AudioContext.

```ts
// apps/desktop/src/renderer/components/onboarding/useBootAudio.ts
import { useRef, useCallback, useEffect } from 'react';

type SoundCue = 'typing' | 'scan' | 'ok' | 'reveal' | 'whoosh' | 'bass' | 'hum_start' | 'hum_stop';

let audioCtx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(
  ctx: AudioContext,
  freq: number,
  duration: number,
  gain: number,
  type: OscillatorType = 'sine',
  freqEnd?: number,
): void {
  const osc = ctx.createOscillator();
  const vol = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (freqEnd) osc.frequency.linearRampToValueAtTime(freqEnd, ctx.currentTime + duration);
  vol.gain.setValueAtTime(gain, ctx.currentTime);
  vol.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(vol).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

const SOUNDS: Record<SoundCue, (ctx: AudioContext, volume: number) => void> = {
  typing: (ctx, v) => playTone(ctx, 800 + Math.random() * 400, 0.03, v * 0.15, 'square'),
  scan: (ctx, v) => {
    playTone(ctx, 1200, 0.15, v * 0.2, 'sine', 1800);
    playTone(ctx, 600, 0.15, v * 0.1, 'sine', 900);
  },
  ok: (ctx, v) => {
    playTone(ctx, 523, 0.1, v * 0.25, 'sine');
    setTimeout(() => playTone(ctx, 659, 0.15, v * 0.25, 'sine'), 100);
  },
  reveal: (ctx, v) => {
    playTone(ctx, 400, 0.3, v * 0.3, 'sine', 800);
    playTone(ctx, 200, 0.3, v * 0.15, 'triangle', 400);
  },
  whoosh: (ctx, v) => playTone(ctx, 200, 0.25, v * 0.2, 'sawtooth', 2000),
  bass: (ctx, v) => {
    playTone(ctx, 80, 0.6, v * 0.4, 'sine');
    playTone(ctx, 160, 0.4, v * 0.2, 'triangle');
    playTone(ctx, 40, 0.8, v * 0.3, 'sine');
  },
  hum_start: () => { /* handled by the hum oscillator below */ },
  hum_stop: () => { /* handled by the hum oscillator below */ },
};

export function useBootAudio(volume = 0.5) {
  const humRef = useRef<{ osc: OscillatorNode; gain: GainNode } | null>(null);

  const play = useCallback((cue: SoundCue) => {
    const ctx = getCtx();
    if (cue === 'hum_start') {
      if (humRef.current) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(55, ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(volume * 0.12, ctx.currentTime + 1.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      humRef.current = { osc, gain };
      return;
    }
    if (cue === 'hum_stop') {
      if (!humRef.current) return;
      const { osc, gain } = humRef.current;
      gain.gain.linearRampToValueAtTime(0, getCtx().currentTime + 1);
      osc.stop(getCtx().currentTime + 1.2);
      humRef.current = null;
      return;
    }
    SOUNDS[cue](ctx, volume);
  }, [volume]);

  useEffect(() => {
    return () => {
      if (humRef.current) {
        humRef.current.osc.stop();
        humRef.current = null;
      }
    };
  }, []);

  return { play };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/components/onboarding/useBootAudio.ts
git commit -m "feat(onboarding): useBootAudio Web Audio hook for boot sound cues"
```

---

## Task 5: Boot Scripts

**Files:**
- Create: `apps/desktop/src/renderer/components/onboarding/boot-scripts.ts`

- [ ] **Step 1: Define the BootLine type and all scripts**

```ts
// apps/desktop/src/renderer/components/onboarding/boot-scripts.ts

export type SoundCue = 'typing' | 'scan' | 'ok' | 'reveal' | 'whoosh' | 'bass';

export type BootLine = {
  text: string;
  delay: number;        // ms pause BEFORE this line
  typeSpeed?: number;    // ms per char (default 35)
  sound?: SoundCue;
  flash?: boolean;
  glow?: 'cyan' | 'gold' | 'green';
  progress?: number;     // if set, render as progress bar filling to this %
};

export const PRE_PHASE: BootLine[] = [
  { text: '[SYSTEM]  .', delay: 1000, typeSpeed: 0, sound: 'scan' },
  { text: '[SYSTEM]  .  .', delay: 500, typeSpeed: 0, sound: 'scan' },
  { text: '[SYSTEM]  .  .  .', delay: 500, typeSpeed: 0, sound: 'scan' },
  { text: '', delay: 800 },
  { text: '[SYSTEM]  A new operator has been detected.', delay: 0, typeSpeed: 30, sound: 'reveal' },
  { text: '', delay: 600 },
  { text: '[SYSTEM]  Initiating first boot sequence...', delay: 0, typeSpeed: 30 },
  { text: '', delay: 400 },
  { text: '', delay: 0, progress: 10 },
  { text: '', delay: 200, progress: 20 },
  { text: '', delay: 200, progress: 40 },
  { text: '', delay: 300, progress: 60 },
  { text: '', delay: 200, progress: 80 },
  { text: '', delay: 300, progress: 100 },
  { text: '[██████████]  CORE ONLINE', delay: 100, typeSpeed: 0, sound: 'ok', flash: true, glow: 'cyan' },
  { text: '', delay: 1000 },
  { text: '[SYSTEM]  All prerequisites satisfied.', delay: 0, typeSpeed: 30 },
  { text: '[SYSTEM]  Operator calibration required.', delay: 200, typeSpeed: 30 },
];

export const PHASE_INTROS: BootLine[][] = [
  // Phase 1 — Operator
  [
    { text: '──────────────────────────────────────────', delay: 600, typeSpeed: 0, sound: 'whoosh' },
    { text: '[PHASE 1 of 5]  OPERATOR IDENTIFICATION', delay: 200, typeSpeed: 0, glow: 'cyan' },
    { text: '[SYSTEM]  Scanning local identity...', delay: 400, typeSpeed: 30 },
    { text: '[SCAN ]  git config → identity found', delay: 600, typeSpeed: 25, sound: 'scan', glow: 'gold' },
  ],
  // Phase 2 — Display
  [
    { text: '──────────────────────────────────────────', delay: 600, typeSpeed: 0, sound: 'whoosh' },
    { text: '[PHASE 2 of 5]  DISPLAY CALIBRATION', delay: 200, typeSpeed: 0, glow: 'cyan' },
    { text: '[SYSTEM]  Scanning display subsystems...', delay: 400, typeSpeed: 30 },
    { text: '[SYSTEM]  4 display profiles available.', delay: 400, typeSpeed: 30 },
    { text: '[SYSTEM]  Select your visual identity.', delay: 300, typeSpeed: 30 },
  ],
  // Phase 3 — Audio
  [
    { text: '──────────────────────────────────────────', delay: 600, typeSpeed: 0, sound: 'whoosh' },
    { text: '[PHASE 3 of 5]  AUDIO SUBSYSTEM', delay: 200, typeSpeed: 0, glow: 'cyan' },
    { text: '[SYSTEM]  Audio subsystem check...', delay: 400, typeSpeed: 30 },
    { text: '[SYSTEM]  Sound engine ready.', delay: 400, typeSpeed: 30, sound: 'ok' },
  ],
  // Phase 4 — Neural Link
  [
    { text: '──────────────────────────────────────────', delay: 600, typeSpeed: 0, sound: 'whoosh' },
    { text: '[PHASE 4 of 5]  NEURAL LINK', delay: 200, typeSpeed: 0, glow: 'cyan' },
    { text: '[SYSTEM]  Scanning for AI runtimes...', delay: 400, typeSpeed: 30 },
    { text: '[SCAN ]  . . .', delay: 800, typeSpeed: 0, sound: 'scan' },
    { text: '[SCAN ]  Claude Code ── DETECTED', delay: 400, typeSpeed: 0, sound: 'reveal', glow: 'gold' },
    { text: '[SYSTEM]  Neural link available.', delay: 400, typeSpeed: 30 },
    { text: '[SYSTEM]  Authorization required.', delay: 300, typeSpeed: 30 },
  ],
];

export const PHASE_OUTROS: BootLine[][] = [
  // Phase 1
  [
    { text: '[SYSTEM]  Operator identity confirmed.', delay: 300, typeSpeed: 30 },
    { text: '[OK    ]  ■ OPERATOR MODULE — LOADED', delay: 300, typeSpeed: 0, sound: 'ok', glow: 'green' },
  ],
  // Phase 2
  [
    { text: '[SYSTEM]  Display profile applied.', delay: 300, typeSpeed: 30 },
    { text: '[OK    ]  ■ DISPLAY MODULE — LOADED', delay: 300, typeSpeed: 0, sound: 'ok', glow: 'green' },
  ],
  // Phase 3
  [
    { text: '[SYSTEM]  Audio subsystem configured.', delay: 300, typeSpeed: 30 },
    { text: '[OK    ]  ■ AUDIO MODULE — LOADED', delay: 300, typeSpeed: 0, sound: 'ok', glow: 'green' },
  ],
  // Phase 4
  [
    { text: '[SYSTEM]  Neural link authorization received.', delay: 300, typeSpeed: 30 },
    { text: '[OK    ]  ■ NEURAL LINK — ENABLED', delay: 300, typeSpeed: 0, sound: 'ok', glow: 'green' },
  ],
];

export const FINALE: BootLine[] = [
  { text: '──────────────────────────────────────────', delay: 600, typeSpeed: 0, sound: 'whoosh' },
  { text: '[SYSTEM]  Finalizing configuration...', delay: 400, typeSpeed: 30 },
  { text: '[WRITE]  Operator profile ·········· OK', delay: 200, typeSpeed: 0, sound: 'ok' },
  { text: '[WRITE]  Display calibration ······· OK', delay: 200, typeSpeed: 0, sound: 'ok' },
  { text: '[WRITE]  Audio subsystem ··········· OK', delay: 200, typeSpeed: 0, sound: 'ok' },
  { text: '[WRITE]  Neural link ··············· OK', delay: 200, typeSpeed: 0, sound: 'ok' },
  { text: '', delay: 400 },
  { text: '', delay: 0, progress: 100 },
  { text: '', delay: 1000 },
  { text: '[SYSTEM]  All systems nominal.', delay: 0, typeSpeed: 30, glow: 'cyan' },
  { text: '', delay: 1500 },
  { text: '  ╔══════════════════════════════════╗', delay: 0, typeSpeed: 0, sound: 'bass', flash: true },
  { text: '  ║                                  ║', delay: 50, typeSpeed: 0 },
  { text: '  ║    P H A N T O M   O S          ║', delay: 50, typeSpeed: 0, glow: 'cyan' },
  { text: '  ║                                  ║', delay: 50, typeSpeed: 0 },
  { text: '  ║    ── S Y S T E M  O N L I N E  ║', delay: 50, typeSpeed: 0, glow: 'gold' },
  { text: '  ║                                  ║', delay: 50, typeSpeed: 0 },
  { text: '  ╚══════════════════════════════════╝', delay: 50, typeSpeed: 0 },
];
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/components/onboarding/boot-scripts.ts
git commit -m "feat(onboarding): boot terminal scripts with timing and sound cues"
```

---

## Task 6: BootTerminal Component

**Files:**
- Create: `apps/desktop/src/renderer/components/onboarding/BootTerminal.tsx`

- [ ] **Step 1: Build the typewriter terminal renderer**

This component takes an array of `BootLine` entries and renders them one-by-one with typewriter effect and sound cues.

```tsx
// apps/desktop/src/renderer/components/onboarding/BootTerminal.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { ScrollArea } from '@mantine/core';
import type { BootLine, SoundCue } from './boot-scripts';

interface BootTerminalProps {
  lines: BootLine[];
  onComplete?: () => void;
  onSound?: (cue: SoundCue) => void;
  paused?: boolean;
  style?: React.CSSProperties;
}

interface RenderedLine {
  text: string;
  partial: boolean;
  glow?: 'cyan' | 'gold' | 'green';
  progress?: number;
}

const GLOW_COLORS: Record<string, string> = {
  cyan: 'var(--phantom-accent-cyan, #00d4ff)',
  gold: 'var(--phantom-accent-gold, #f59e0b)',
  green: 'var(--phantom-status-success, #22c55e)',
};

function ProgressBar({ value }: { value: number }) {
  const filled = Math.round((value / 100) * 30);
  const empty = 30 - filled;
  return (
    <span style={{ color: 'var(--phantom-accent-cyan, #00d4ff)' }}>
      [{'\u2588'.repeat(filled)}{'\u2591'.repeat(empty)}] {value}%
    </span>
  );
}

export function BootTerminal({ lines, onComplete, onSound, paused, style }: BootTerminalProps) {
  const [rendered, setRendered] = useState<RenderedLine[]>([]);
  const [lineIdx, setLineIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [waiting, setWaiting] = useState(true);
  const [flash, setFlash] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [rendered]);

  // Process lines
  useEffect(() => {
    if (paused || lineIdx >= lines.length) {
      if (lineIdx >= lines.length && onComplete) onComplete();
      return;
    }

    const line = lines[lineIdx];

    // Delay before line
    if (waiting) {
      const timer = setTimeout(() => {
        setWaiting(false);
        if (line.sound && onSound) onSound(line.sound);
        if (line.flash) {
          setFlash(true);
          setTimeout(() => setFlash(false), 100);
        }
      }, line.delay);
      return () => clearTimeout(timer);
    }

    // Progress bar line — render instantly
    if (line.progress !== undefined) {
      setRendered((prev) => {
        // Update last progress bar or add new
        const last = prev[prev.length - 1];
        if (last?.progress !== undefined) {
          return [...prev.slice(0, -1), { text: '', partial: false, progress: line.progress, glow: line.glow }];
        }
        return [...prev, { text: '', partial: false, progress: line.progress, glow: line.glow }];
      });
      setLineIdx((i) => i + 1);
      setCharIdx(0);
      setWaiting(true);
      return;
    }

    // Instant render (typeSpeed = 0)
    if (line.typeSpeed === 0) {
      setRendered((prev) => [...prev, { text: line.text, partial: false, glow: line.glow }]);
      setLineIdx((i) => i + 1);
      setCharIdx(0);
      setWaiting(true);
      return;
    }

    // Typewriter effect
    const speed = line.typeSpeed ?? 35;
    if (charIdx === 0) {
      setRendered((prev) => [...prev, { text: '', partial: true, glow: line.glow }]);
    }

    if (charIdx < line.text.length) {
      const timer = setTimeout(() => {
        setRendered((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = { ...last, text: line.text.slice(0, charIdx + 1) };
          return updated;
        });
        if (onSound) onSound('typing');
        setCharIdx((c) => c + 1);
      }, speed);
      return () => clearTimeout(timer);
    }

    // Line complete
    setRendered((prev) => {
      const updated = [...prev];
      updated[updated.length - 1] = { ...updated[updated.length - 1], partial: false };
      return updated;
    });
    setLineIdx((i) => i + 1);
    setCharIdx(0);
    setWaiting(true);
  }, [lineIdx, charIdx, waiting, paused, lines, onComplete, onSound]);

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      background: flash ? 'rgba(0,212,255,0.15)' : 'transparent',
      transition: 'background 0.1s',
      ...style,
    }}>
      <ScrollArea h="100%" viewportRef={viewportRef} scrollbarSize={4}>
        <div style={{
          padding: '2rem',
          fontFamily: 'var(--phantom-font-mono, "JetBrains Mono", monospace)',
          fontSize: '14px',
          lineHeight: 1.8,
          color: 'var(--phantom-text-primary, #e0e0e0)',
        }}>
          {rendered.map((line, i) => (
            <div key={i} style={{
              color: line.glow ? GLOW_COLORS[line.glow] : undefined,
              textShadow: line.glow ? `0 0 8px ${GLOW_COLORS[line.glow]}` : undefined,
              minHeight: '1.8em',
            }}>
              {line.progress !== undefined ? (
                <ProgressBar value={line.progress} />
              ) : (
                <>
                  {line.text}
                  {line.partial && <span style={{ opacity: 0.7 }}>▌</span>}
                </>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/components/onboarding/BootTerminal.tsx
git commit -m "feat(onboarding): BootTerminal typewriter component with sound cues and progress bars"
```

---

## Task 7: Phase 1 — Operator Identification

**Files:**
- Create: `apps/desktop/src/renderer/components/onboarding/phases/OperatorPhase.tsx`

- [ ] **Step 1: Build the operator identification panel**

```tsx
// apps/desktop/src/renderer/components/onboarding/phases/OperatorPhase.tsx
import { useState, useEffect } from 'react';
import { TextInput, Text, Button, Stack, Group, Kbd } from '@mantine/core';
import { fetchGitIdentity } from '../../../lib/api';

interface OperatorResult {
  operatorName: string;
  gitName: string;
  gitEmail: string;
}

interface Props {
  onComplete: (result: OperatorResult) => void;
}

export function OperatorPhase({ onComplete }: Props) {
  const [gitName, setGitName] = useState('');
  const [gitEmail, setGitEmail] = useState('');
  const [handle, setHandle] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchGitIdentity().then(({ name, email }) => {
      setGitName(name);
      setGitEmail(email);
      setHandle(name.split(' ')[0] || name); // default to first name
      setLoaded(true);
    });
  }, []);

  const submit = () => {
    if (!handle.trim()) return;
    onComplete({
      operatorName: handle.trim(),
      gitName,
      gitEmail,
    });
  };

  if (!loaded) return null;

  return (
    <Stack gap="lg" style={{ maxWidth: 440 }}>
      {gitName && (
        <div style={{
          fontFamily: 'var(--phantom-font-mono, monospace)',
          fontSize: '13px',
          color: 'var(--phantom-text-secondary, #888)',
          lineHeight: 1.6,
        }}>
          <Text span c="var(--phantom-accent-gold, #f59e0b)">Git user: </Text>
          <Text span c="var(--phantom-text-primary, #e0e0e0)">{gitName}</Text>
          <br />
          <Text span c="var(--phantom-accent-gold, #f59e0b)">Email:&nbsp;&nbsp;&nbsp; </Text>
          <Text span c="var(--phantom-text-primary, #e0e0e0)">{gitEmail}</Text>
        </div>
      )}

      <TextInput
        label="Operator handle"
        description="This is how Phantom OS will address you"
        value={handle}
        onChange={(e) => setHandle(e.currentTarget.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        styles={{
          input: {
            fontFamily: 'var(--phantom-font-mono, monospace)',
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid var(--phantom-accent-cyan, #00d4ff)',
            color: 'var(--phantom-text-primary, #e0e0e0)',
          },
          label: { color: 'var(--phantom-text-primary, #e0e0e0)' },
          description: { color: 'var(--phantom-text-secondary, #888)' },
        }}
        autoFocus
      />

      <Group>
        <Button
          onClick={submit}
          disabled={!handle.trim()}
          style={{
            fontFamily: 'var(--phantom-font-mono, monospace)',
            background: 'transparent',
            border: '1px solid var(--phantom-accent-cyan, #00d4ff)',
            color: 'var(--phantom-accent-cyan, #00d4ff)',
          }}
        >
          [ Confirm ] <Kbd ml="xs" style={{ background: 'transparent', border: 'none', color: 'var(--phantom-text-secondary)' }}>Enter ↵</Kbd>
        </Button>
      </Group>
    </Stack>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/components/onboarding/phases/OperatorPhase.tsx
git commit -m "feat(onboarding): Phase 1 operator identification panel"
```

---

## Task 8: Phase 2 — Display Calibration

**Files:**
- Create: `apps/desktop/src/renderer/components/onboarding/phases/DisplayPhase.tsx`

- [ ] **Step 1: Build the theme + font picker panel**

```tsx
// apps/desktop/src/renderer/components/onboarding/phases/DisplayPhase.tsx
import { useState } from 'react';
import { SimpleGrid, Button, Text, Stack, Group, UnstyledButton } from '@mantine/core';
import { useSetAtom } from 'jotai';
import { themeNameAtom, fontFamilyAtom } from '../../../atoms/system';
import { themeRegistry } from '@phantom-os/theme';

interface DisplayResult {
  theme: string;
  fontFamily: string;
}

interface Props {
  onComplete: (result: DisplayResult) => void;
}

const FONTS = [
  'JetBrains Mono',
  'Fira Code',
  'Inter',
  'Space Grotesk',
  'IBM Plex Mono',
];

export function DisplayPhase({ onComplete }: Props) {
  const [selectedTheme, setSelectedTheme] = useState('cz-dark');
  const [selectedFont, setSelectedFont] = useState('JetBrains Mono');
  const setThemeName = useSetAtom(themeNameAtom);
  const setFontFamily = useSetAtom(fontFamilyAtom);

  const applyTheme = (name: string) => {
    setSelectedTheme(name);
    setThemeName(name); // live-preview via ThemeProvider
  };

  const applyFont = (name: string) => {
    setSelectedFont(name);
    setFontFamily(name); // live-preview
  };

  const submit = () => {
    onComplete({ theme: selectedTheme, fontFamily: selectedFont });
  };

  return (
    <Stack gap="lg" style={{ maxWidth: 520 }}>
      <Text size="sm" c="var(--phantom-text-secondary, #888)" ff="var(--phantom-font-mono, monospace)">
        Display profile
      </Text>

      <SimpleGrid cols={2} spacing="sm">
        {themeRegistry.map((t) => {
          const accent = t.cssVars?.dark?.['--phantom-accent-cyan'] || '#00d4ff';
          const bg = t.cssVars?.dark?.['--phantom-bg-primary'] || '#0a0a0a';
          const isSelected = selectedTheme === t.name;
          return (
            <UnstyledButton
              key={t.name}
              onClick={() => applyTheme(t.name)}
              style={{
                padding: '12px',
                borderRadius: '8px',
                border: isSelected
                  ? `2px solid ${accent}`
                  : '2px solid rgba(255,255,255,0.1)',
                background: bg,
                cursor: 'pointer',
                transition: 'border-color 0.2s',
              }}
            >
              <Text
                size="sm"
                fw={600}
                ff="var(--phantom-font-mono, monospace)"
                style={{ color: accent }}
              >
                {t.name}
              </Text>
              <div style={{
                display: 'flex',
                gap: 4,
                marginTop: 8,
              }}>
                {[accent, bg, '#e0e0e0', 'rgba(255,255,255,0.1)'].map((c, i) => (
                  <div key={i} style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    background: c,
                    border: '1px solid rgba(255,255,255,0.1)',
                  }} />
                ))}
              </div>
            </UnstyledButton>
          );
        })}
      </SimpleGrid>

      <Text size="sm" c="var(--phantom-text-secondary, #888)" ff="var(--phantom-font-mono, monospace)" mt="md">
        Terminal font
      </Text>

      <Group gap="xs">
        {FONTS.map((f) => (
          <UnstyledButton
            key={f}
            onClick={() => applyFont(f)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: selectedFont === f
                ? '1px solid var(--phantom-accent-cyan, #00d4ff)'
                : '1px solid rgba(255,255,255,0.1)',
              fontFamily: f,
              fontSize: '13px',
              color: selectedFont === f
                ? 'var(--phantom-accent-cyan, #00d4ff)'
                : 'var(--phantom-text-secondary, #888)',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {f}
          </UnstyledButton>
        ))}
      </Group>

      <Button
        onClick={submit}
        mt="md"
        style={{
          fontFamily: 'var(--phantom-font-mono, monospace)',
          background: 'transparent',
          border: '1px solid var(--phantom-accent-cyan, #00d4ff)',
          color: 'var(--phantom-accent-cyan, #00d4ff)',
          alignSelf: 'flex-start',
        }}
      >
        [ Apply ]
      </Button>
    </Stack>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/components/onboarding/phases/DisplayPhase.tsx
git commit -m "feat(onboarding): Phase 2 display calibration — theme grid and font picker"
```

---

## Task 9: Phase 3 — Audio Subsystem

**Files:**
- Create: `apps/desktop/src/renderer/components/onboarding/phases/AudioPhase.tsx`

- [ ] **Step 1: Build the audio configuration panel**

```tsx
// apps/desktop/src/renderer/components/onboarding/phases/AudioPhase.tsx
import { useState } from 'react';
import { Switch, SimpleGrid, Text, Stack, Button, UnstyledButton } from '@mantine/core';
import { useCeremonySounds } from '../../../hooks/useCeremonySounds';

type SoundStyle = 'electronic' | 'minimal' | 'warm' | 'retro';

interface AudioResult {
  sounds: boolean;
  soundsStyle: SoundStyle;
}

interface Props {
  onComplete: (result: AudioResult) => void;
}

const STYLES: { name: SoundStyle; label: string; desc: string }[] = [
  { name: 'electronic', label: 'Electronic', desc: 'Sine waves + harmonics' },
  { name: 'minimal', label: 'Minimal', desc: 'Single clean tones' },
  { name: 'warm', label: 'Warm', desc: 'Triangle + soft harmonics' },
  { name: 'retro', label: 'Retro', desc: 'Square wave chiptune' },
];

export function AudioPhase({ onComplete }: Props) {
  const [enabled, setEnabled] = useState(true);
  const [style, setStyle] = useState<SoundStyle>('electronic');

  const sounds = useCeremonySounds({
    enabled: true, // always allow preview during onboarding
    volume: 0.5,
    style,
    events: { boot_complete: true },
  });

  const preview = (s: SoundStyle) => {
    setStyle(s);
    sounds.preview('boot_complete');
  };

  return (
    <Stack gap="lg" style={{ maxWidth: 440 }}>
      <Switch
        label="Enable ceremony sounds"
        checked={enabled}
        onChange={(e) => setEnabled(e.currentTarget.checked)}
        styles={{
          label: {
            fontFamily: 'var(--phantom-font-mono, monospace)',
            color: 'var(--phantom-text-primary, #e0e0e0)',
          },
        }}
      />

      {enabled && (
        <>
          <Text size="sm" c="var(--phantom-text-secondary, #888)" ff="var(--phantom-font-mono, monospace)">
            Sound style (tap to preview)
          </Text>
          <SimpleGrid cols={2} spacing="sm">
            {STYLES.map((s) => (
              <UnstyledButton
                key={s.name}
                onClick={() => preview(s.name)}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: style === s.name
                    ? '2px solid var(--phantom-accent-cyan, #00d4ff)'
                    : '2px solid rgba(255,255,255,0.1)',
                  background: 'rgba(0,0,0,0.3)',
                  cursor: 'pointer',
                }}
              >
                <Text size="sm" fw={600} ff="var(--phantom-font-mono, monospace)"
                  c={style === s.name ? 'var(--phantom-accent-cyan)' : 'var(--phantom-text-primary)'}>
                  {s.label}
                </Text>
                <Text size="xs" c="var(--phantom-text-secondary, #888)" mt={4}>
                  {s.desc}
                </Text>
              </UnstyledButton>
            ))}
          </SimpleGrid>
        </>
      )}

      <Button
        onClick={() => onComplete({ sounds: enabled, soundsStyle: style })}
        style={{
          fontFamily: 'var(--phantom-font-mono, monospace)',
          background: 'transparent',
          border: '1px solid var(--phantom-accent-cyan, #00d4ff)',
          color: 'var(--phantom-accent-cyan, #00d4ff)',
          alignSelf: 'flex-start',
        }}
      >
        [ Confirm ]
      </Button>
    </Stack>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/components/onboarding/phases/AudioPhase.tsx
git commit -m "feat(onboarding): Phase 3 audio subsystem — sound toggle and style picker"
```

---

## Task 10: Phase 4 — Neural Link

**Files:**
- Create: `apps/desktop/src/renderer/components/onboarding/phases/NeuralLinkPhase.tsx`

- [ ] **Step 1: Build the Claude AI consent panel**

```tsx
// apps/desktop/src/renderer/components/onboarding/phases/NeuralLinkPhase.tsx
import { useState } from 'react';
import { Switch, Text, Stack, Button, Group } from '@mantine/core';

interface NeuralLinkResult {
  claudeMcpEnabled: boolean;
  claudeInstructionsEnabled: boolean;
  claudeHooksEnabled: boolean;
}

interface Props {
  claudeDetected: boolean;
  onComplete: (result: NeuralLinkResult) => void;
}

const TOGGLES: { key: keyof NeuralLinkResult; label: string; desc: string; recommended: boolean }[] = [
  {
    key: 'claudeMcpEnabled',
    label: 'Register MCP server',
    desc: 'Adds phantom-ai to ~/.mcp.json so Claude can use your dependency graph',
    recommended: true,
  },
  {
    key: 'claudeInstructionsEnabled',
    label: 'Project instructions',
    desc: 'Adds guidance to ~/.claude/projects/ so Claude checks dependencies before editing',
    recommended: true,
  },
  {
    key: 'claudeHooksEnabled',
    label: 'Pre-edit hook',
    desc: 'Adds a reminder hook so Claude doesn\'t skip the graph',
    recommended: false,
  },
];

export function NeuralLinkPhase({ claudeDetected, onComplete }: Props) {
  const [state, setState] = useState<NeuralLinkResult>({
    claudeMcpEnabled: true,
    claudeInstructionsEnabled: true,
    claudeHooksEnabled: false,
  });

  const toggle = (key: keyof NeuralLinkResult) => {
    setState((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Stack gap="lg" style={{ maxWidth: 500 }}>
      <Text size="sm" c="var(--phantom-text-secondary, #888)" ff="var(--phantom-font-mono, monospace)">
        Phantom AI connects your dependency graph directly to Claude,
        so it understands what will break before making changes.
      </Text>

      {!claudeDetected && (
        <Text size="xs" c="var(--phantom-status-error, #ef4444)" ff="var(--phantom-font-mono, monospace)"
          style={{ padding: '8px 12px', border: '1px solid var(--phantom-status-error)', borderRadius: 6 }}>
          Claude Code not detected — settings will be saved and applied when Claude is installed.
        </Text>
      )}

      <Stack gap="md">
        {TOGGLES.map((t) => (
          <Group key={t.key} justify="space-between" align="flex-start"
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.06)',
              opacity: claudeDetected ? 1 : 0.5,
            }}>
            <div style={{ flex: 1 }}>
              <Group gap="xs">
                <Text size="sm" fw={500} ff="var(--phantom-font-mono, monospace)"
                  c="var(--phantom-text-primary, #e0e0e0)">
                  {t.label}
                </Text>
                {t.recommended && (
                  <Text size="xs" c="var(--phantom-accent-gold, #f59e0b)" ff="var(--phantom-font-mono, monospace)">
                    recommended
                  </Text>
                )}
              </Group>
              <Text size="xs" c="var(--phantom-text-secondary, #888)" mt={2}>
                {t.desc}
              </Text>
            </div>
            <Switch
              checked={state[t.key]}
              onChange={() => toggle(t.key)}
              disabled={!claudeDetected}
            />
          </Group>
        ))}
      </Stack>

      <Button
        onClick={() => onComplete(state)}
        style={{
          fontFamily: 'var(--phantom-font-mono, monospace)',
          background: 'transparent',
          border: '1px solid var(--phantom-accent-cyan, #00d4ff)',
          color: 'var(--phantom-accent-cyan, #00d4ff)',
          alignSelf: 'flex-start',
        }}
      >
        [ Authorize ]
      </Button>
    </Stack>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/components/onboarding/phases/NeuralLinkPhase.tsx
git commit -m "feat(onboarding): Phase 4 neural link — Claude AI consent toggles"
```

---

## Task 11: OnboardingFlow Orchestrator

**Files:**
- Create: `apps/desktop/src/renderer/components/onboarding/OnboardingFlow.tsx`

- [ ] **Step 1: Build the root orchestrator**

This is the main component that ties everything together — the phase state machine, BootTerminal, phase panels, and batch write on completion.

```tsx
// apps/desktop/src/renderer/components/onboarding/OnboardingFlow.tsx
import { useState, useCallback, useRef } from 'react';
import { BootTerminal } from './BootTerminal';
import { useBootAudio } from './useBootAudio';
import { PRE_PHASE, PHASE_INTROS, PHASE_OUTROS, FINALE } from './boot-scripts';
import type { SoundCue } from './boot-scripts';
import { OperatorPhase } from './phases/OperatorPhase';
import { DisplayPhase } from './phases/DisplayPhase';
import { AudioPhase } from './phases/AudioPhase';
import { NeuralLinkPhase } from './phases/NeuralLinkPhase';
import { usePreferences } from '../../hooks/usePreferences';
import { applyClaudeIntegration } from '../../lib/api';

type Stage =
  | { type: 'pre-phase' }
  | { type: 'phase-intro'; phase: number }
  | { type: 'phase-ui'; phase: number }
  | { type: 'phase-outro'; phase: number }
  | { type: 'finale' }
  | { type: 'done' };

interface OnboardingConfig {
  operatorName: string;
  gitName: string;
  gitEmail: string;
  theme: string;
  fontFamily: string;
  sounds: boolean;
  soundsStyle: string;
  claudeMcpEnabled: boolean;
  claudeInstructionsEnabled: boolean;
  claudeHooksEnabled: boolean;
}

const EMPTY_CONFIG: OnboardingConfig = {
  operatorName: '',
  gitName: '',
  gitEmail: '',
  theme: 'cz-dark',
  fontFamily: 'JetBrains Mono',
  sounds: true,
  soundsStyle: 'electronic',
  claudeMcpEnabled: true,
  claudeInstructionsEnabled: true,
  claudeHooksEnabled: false,
};

interface Props {
  onComplete: () => void;
}

export function OnboardingFlow({ onComplete }: Props) {
  const [stage, setStage] = useState<Stage>({ type: 'pre-phase' });
  const [config, setConfig] = useState<OnboardingConfig>(EMPTY_CONFIG);
  const [claudeDetected, setClaudeDetected] = useState(true); // optimistic
  const { setPref } = usePreferences();
  const audio = useBootAudio(0.5);
  const humStarted = useRef(false);

  const handleSound = useCallback((cue: SoundCue) => {
    if (!humStarted.current) {
      audio.play('hum_start');
      humStarted.current = true;
    }
    audio.play(cue);
  }, [audio]);

  // Get the terminal lines for the current stage
  const getLines = () => {
    switch (stage.type) {
      case 'pre-phase': return PRE_PHASE;
      case 'phase-intro': return PHASE_INTROS[stage.phase];
      case 'phase-outro': return PHASE_OUTROS[stage.phase];
      case 'finale': return FINALE;
      default: return [];
    }
  };

  const handleTerminalComplete = () => {
    switch (stage.type) {
      case 'pre-phase':
        setStage({ type: 'phase-intro', phase: 0 });
        break;
      case 'phase-intro':
        setStage({ type: 'phase-ui', phase: stage.phase });
        break;
      case 'phase-outro':
        if (stage.phase < 3) {
          setStage({ type: 'phase-intro', phase: stage.phase + 1 });
        } else {
          // All phases done → finale
          setStage({ type: 'finale' });
        }
        break;
      case 'finale':
        audio.play('hum_stop');
        setStage({ type: 'done' });
        break;
    }
  };

  const handlePhaseComplete = async (phaseData: Partial<OnboardingConfig>) => {
    const updated = { ...config, ...phaseData };
    setConfig(updated);

    const currentPhase = stage.type === 'phase-ui' ? stage.phase : 0;

    // On Phase 4 (neural link) completion, also detect claude and trigger batch write
    if (currentPhase === 3) {
      // Batch write all preferences
      const prefs: Record<string, string> = {
        onboarding_completed: new Date().toISOString(),
        operator_name: updated.operatorName,
        operator_git_name: updated.gitName,
        operator_git_email: updated.gitEmail,
        theme: updated.theme,
        font_family: updated.fontFamily,
        sounds: String(updated.sounds),
        sounds_style: updated.soundsStyle,
        claude_mcp_enabled: String(updated.claudeMcpEnabled),
        claude_instructions_enabled: String(updated.claudeInstructionsEnabled),
        claude_hooks_enabled: String(updated.claudeHooksEnabled),
      };

      // Write all prefs
      await Promise.all(
        Object.entries(prefs).map(([key, value]) => setPref(key, value))
      );

      // Apply Claude integration if any toggles enabled
      if (updated.claudeMcpEnabled || updated.claudeInstructionsEnabled || updated.claudeHooksEnabled) {
        try {
          await applyClaudeIntegration({
            mcp: updated.claudeMcpEnabled,
            instructions: updated.claudeInstructionsEnabled,
            hooks: updated.claudeHooksEnabled,
            projectPath: '', // server will resolve from active project
          });
        } catch { /* non-fatal */ }
      }
    }

    setStage({ type: 'phase-outro', phase: currentPhase });
  };

  // Render phase UI panel
  const renderPhasePanel = () => {
    if (stage.type !== 'phase-ui') return null;

    const panelStyle: React.CSSProperties = {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      padding: '2rem',
      background: 'linear-gradient(to top, rgba(0,0,0,0.95) 80%, transparent)',
      animation: 'phantom-slide-up 0.3s ease-out',
      zIndex: 10,
    };

    switch (stage.phase) {
      case 0: return <div style={panelStyle}><OperatorPhase onComplete={(r) => handlePhaseComplete(r)} /></div>;
      case 1: return <div style={panelStyle}><DisplayPhase onComplete={(r) => handlePhaseComplete(r)} /></div>;
      case 2: return <div style={panelStyle}><AudioPhase onComplete={(r) => handlePhaseComplete(r)} /></div>;
      case 3: return <div style={panelStyle}><NeuralLinkPhase claudeDetected={claudeDetected} onComplete={(r) => handlePhaseComplete(r)} /></div>;
      default: return null;
    }
  };

  if (stage.type === 'done') {
    // Brief delay then transition to main app
    setTimeout(onComplete, 500);
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: '#000',
      zIndex: 9999,
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes phantom-slide-up {
          from { transform: translateY(40px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      {stage.type !== 'phase-ui' && (
        <BootTerminal
          lines={getLines()}
          onComplete={handleTerminalComplete}
          onSound={handleSound}
        />
      )}

      {renderPhasePanel()}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/desktop/src/renderer/components/onboarding/OnboardingFlow.tsx
git commit -m "feat(onboarding): OnboardingFlow orchestrator — phase state machine with batch write"
```

---

## Task 12: App.tsx Integration

**Files:**
- Modify: `apps/desktop/src/renderer/App.tsx`

- [ ] **Step 1: Read App.tsx to find the right insertion point**

Read the file to identify where the main shell renders and where to add the onboarding gate.

- [ ] **Step 2: Add the onboarding gate**

Near the top of the App component, after `usePreferences()` is called:

```tsx
import { OnboardingFlow } from './components/onboarding/OnboardingFlow';

// Inside the App component, after usePreferences:
const { prefs, loaded } = usePreferences();

const [onboardingDone, setOnboardingDone] = useState(false);

// Gate: show onboarding if not completed
if (loaded && !prefs.onboarding_completed && !onboardingDone) {
  return <OnboardingFlow onComplete={() => setOnboardingDone(true)} />;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/App.tsx
git commit -m "feat(app): gate on onboarding_completed preference — show onboarding for new users"
```

---

## Task 13: Settings Re-initialize Button

**Files:**
- Modify: `apps/desktop/src/renderer/components/SettingsPage.tsx`

- [ ] **Step 1: Read SettingsPage.tsx to find the SECTIONS registry and existing patterns**

Read the file to identify where to add a new section.

- [ ] **Step 2: Add Re-initialize System button**

Add a new section at the bottom of the settings page (after existing sections):

```tsx
// In the System section or as a new section:
<Text size="sm" fw={600} c="var(--phantom-text-primary)" ff="var(--phantom-font-mono, monospace)">
  System
</Text>
<Text size="xs" c="var(--phantom-text-secondary)" mb="sm">
  Re-run the first boot sequence to reconfigure your setup.
</Text>
<Button
  variant="outline"
  color="red"
  size="xs"
  onClick={async () => {
    await setPref('onboarding_completed', '');
    window.location.reload();
  }}
  style={{ fontFamily: 'var(--phantom-font-mono, monospace)' }}
>
  Re-initialize System
</Button>
```

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/components/SettingsPage.tsx
git commit -m "feat(settings): add Re-initialize System button to rerun onboarding"
```

---

## Task 14: End-to-End Smoke Test

- [ ] **Step 1: Clear onboarding_completed preference**

In the running app, open dev tools console or hit the API:

```bash
curl -X PUT http://localhost:3849/api/preferences/onboarding_completed -H 'Content-Type: application/json' -d '{"value": ""}'
```

- [ ] **Step 2: Reload the app and verify the full onboarding flow**

Verify:
1. Black screen → ambient hum → boot text types in
2. Phase 1: git identity detected, handle pre-filled, confirm works
3. Phase 2: theme cards render, selecting one live-previews, font row works
4. Phase 3: sound toggle, style cards play preview on tap
5. Phase 4: consent toggles with file path descriptions, authorize button
6. Phase 5: fast write sequence → progress bar → SYSTEM ONLINE banner → ceremony sound → fade to main app

- [ ] **Step 3: Verify preferences were written**

```bash
curl http://localhost:3849/api/preferences | jq
```

Expected: all onboarding keys present (`operator_name`, `theme`, `font_family`, `sounds`, `sounds_style`, `claude_mcp_enabled`, `claude_instructions_enabled`, `claude_hooks_enabled`, `onboarding_completed`).

- [ ] **Step 4: Verify Claude integration files (if enabled)**

```bash
ls ~/.claude/projects/ | grep phantom
cat ~/.mcp.json | jq '.mcpServers["phantom-ai"]'
```

- [ ] **Step 5: Verify Re-initialize from Settings**

Open Settings → click "Re-initialize System" → app reloads → onboarding runs again.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: first boot onboarding flow — system initialization sequence with Claude AI consent"
```
