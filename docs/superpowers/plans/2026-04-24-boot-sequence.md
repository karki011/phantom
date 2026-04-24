# Boot Sequence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace terminal-typewriter boot with a canvas particle burst + real system health checks, under 5 seconds, responsive.

**Architecture:** Full-viewport `<canvas>` overlay renders particles that burst from center and converge into grid formation. DOM-layer confirmation lines print system scan results underneath. Forward-only state machine (BURST→CONVERGE→CONFIRM→DISMISS) gates on Wails backend readiness. Props match existing BootCeremony API so app.tsx swap is trivial.

**Tech Stack:** SolidJS 1.9, vanilla-extract, Canvas 2D API, Wails Go bindings

**Note:** No test runner exists in v2/frontend. Verification uses `tsc --noEmit` (typecheck) and manual visual inspection via `pnpm dev`. Adding test infrastructure is out of scope.

---

## File Map

| File | Responsibility |
|------|---------------|
| `v2/frontend/src/screens/boot/particle-math.ts` | Pure math: particle creation, grid targets, spring physics, responsive scaling |
| `v2/frontend/src/screens/boot/boot-screen.css.ts` | Vanilla-extract styles for all boot screen elements |
| `v2/frontend/src/screens/boot/scan-system.ts` | System scan runner with Wails binding + graceful fallback |
| `v2/frontend/src/screens/boot/ParticleCanvas.tsx` | Canvas component: particle rendering + animation loop |
| `v2/frontend/src/screens/boot/ConfirmationPanel.tsx` | DOM component: scan result lines with timed reveal |
| `v2/frontend/src/screens/boot/BootScreen.tsx` | Orchestrator: state machine, scan runner, composition |
| `v2/frontend/src/screens/boot/index.ts` | Barrel export (modify) |
| `v2/frontend/src/app.tsx` | Swap BootCeremony → BootScreen (modify) |

---

### Task 1: Particle Math Module

**Files:**
- Create: `v2/frontend/src/screens/boot/particle-math.ts`

- [ ] **Step 1: Create particle-math.ts with all pure functions**

```typescript
export type BootPhase = 'BURST' | 'CONVERGE' | 'CONFIRM' | 'DISMISS';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  opacity: number;
  targetX: number;
  targetY: number;
}

const SPRING_STIFFNESS = 12;
const SPRING_DAMPING = 0.82;
const DISMISS_FORCE = 3;
const DISMISS_FADE = 2.5;

export function createParticles(count: number): Particle[] {
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 2.5;
    return {
      x: 0.5,
      y: 0.5,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      opacity: 1,
      targetX: 0.5,
      targetY: 0.5,
    };
  });
}

export function computeGridTargets(count: number): Array<{ x: number; y: number }> {
  const cols = Math.ceil(Math.sqrt(count * 1.5));
  const rows = Math.ceil(count / cols);
  const padding = 0.2;
  const xStep = (1 - 2 * padding) / Math.max(cols - 1, 1);
  const yStep = (1 - 2 * padding) / Math.max(rows - 1, 1);
  const targets: Array<{ x: number; y: number }> = [];

  for (let r = 0; r < rows && targets.length < count; r++) {
    for (let c = 0; c < cols && targets.length < count; c++) {
      targets.push({ x: padding + c * xStep, y: padding + r * yStep });
    }
  }
  return targets;
}

export function updateParticles(
  particles: Particle[],
  phase: BootPhase,
  dt: number,
): void {
  for (const p of particles) {
    switch (phase) {
      case 'BURST': {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.97;
        p.vy *= 0.97;
        break;
      }
      case 'CONVERGE':
      case 'CONFIRM': {
        const dx = p.targetX - p.x;
        const dy = p.targetY - p.y;
        p.vx = (p.vx + dx * SPRING_STIFFNESS * dt) * SPRING_DAMPING;
        p.vy = (p.vy + dy * SPRING_STIFFNESS * dt) * SPRING_DAMPING;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        break;
      }
      case 'DISMISS': {
        const dx = p.x - 0.5;
        const dy = p.y - 0.5;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
        p.vx += (dx / dist) * DISMISS_FORCE * dt;
        p.vy += (dy / dist) * DISMISS_FORCE * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.opacity = Math.max(0, p.opacity - DISMISS_FADE * dt);
        break;
      }
    }
  }
}

export function computeParticleCount(w: number, h: number): number {
  return Math.min(400, Math.max(80, Math.floor((w * h) / 5000)));
}

export function computeParticleRadius(dpr: number): number {
  return Math.max(1.5, 2.5 * dpr);
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd /Users/subash.karki/phantom-os/v2/frontend && npx tsc --noEmit`
Expected: No errors related to particle-math.ts

- [ ] **Step 3: Commit**

```bash
git add v2/frontend/src/screens/boot/particle-math.ts
git commit -m "feat(boot): add particle math module — spring physics, grid targets, responsive scaling"
```

---

### Task 2: Boot Screen Styles

**Files:**
- Create: `v2/frontend/src/screens/boot/boot-screen.css.ts`

- [ ] **Step 1: Create boot-screen.css.ts with all styles**

```typescript
import { style, keyframes, globalStyle } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

const fadeOut = keyframes({
  from: { opacity: 1 },
  to: { opacity: 0 },
});

const pulse = keyframes({
  '0%, 100%': { opacity: 0.4 },
  '50%': { opacity: 1 },
});

const lineSlideIn = keyframes({
  from: { opacity: 0, transform: 'translateY(4px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  background: '#000',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
});

export const overlayDismiss = style([
  overlay,
  {
    animation: `${fadeOut} 500ms ease-out forwards`,
    pointerEvents: 'none',
  },
]);

export const canvas = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
});

export const confirmationPanel = style({
  position: 'relative',
  zIndex: 1,
  marginTop: vars.space.xl,
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  fontFamily: vars.font.mono,
  fontSize: `clamp(0.75rem, 1.2vw, 1rem)`,
  color: vars.color.textSecondary,
  minWidth: '280px',
  maxWidth: '520px',
  width: '90vw',
});

export const scanLine = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  animation: `${lineSlideIn} 200ms ease-out both`,
  whiteSpace: 'nowrap',
});

export const statusDotSuccess = style({
  color: vars.color.success,
});

export const statusDotWarning = style({
  color: vars.color.warning,
});

export const statusDotOffline = style({
  color: vars.color.textDisabled,
});

export const scanLabel = style({
  color: vars.color.textPrimary,
});

export const scanDetail = style({
  color: vars.color.textSecondary,
  marginLeft: 'auto',
});

export const pulsing = style({
  animation: `${pulse} 2s ease-in-out infinite`,
});

export const nominalLine = style({
  position: 'relative',
  zIndex: 1,
  marginTop: vars.space.lg,
  fontFamily: vars.font.mono,
  fontSize: `clamp(0.75rem, 1.2vw, 1rem)`,
  color: vars.color.warning,
  textAlign: 'center',
  animation: `${lineSlideIn} 300ms ease-out both`,
});
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd /Users/subash.karki/phantom-os/v2/frontend && npx tsc --noEmit`
Expected: No errors related to boot-screen.css.ts

- [ ] **Step 3: Commit**

```bash
git add v2/frontend/src/screens/boot/boot-screen.css.ts
git commit -m "feat(boot): add boot screen styles — overlay, particles, confirmation panel, animations"
```

---

### Task 3: System Scan Runner

**Files:**
- Create: `v2/frontend/src/screens/boot/scan-system.ts`

- [ ] **Step 1: Create scan-system.ts with types, runner, and fallbacks**

```typescript
export type ScanStatus = 'success' | 'warning' | 'offline';

export interface ScanResult {
  label: string;
  detail: string;
  status: ScanStatus;
}

interface BootScanData {
  operator: string;
  nodeVersion: string;
  bunVersion: string;
  claudeSessions: number;
  claudeProjects: number;
  mcpChannels: number;
  githubAuth: boolean;
  awsConfigured: boolean;
  gcpConfigured: boolean;
}

const App = () => (window as any).go?.['app']?.App;

function formatScans(d: BootScanData): ScanResult[] {
  const runtimes = [
    d.nodeVersion ? `Node ${d.nodeVersion}` : null,
    d.bunVersion ? `Bun ${d.bunVersion}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const cloudBridges = [
    d.awsConfigured ? 'AWS' : null,
    d.gcpConfigured ? 'GCP' : null,
  ].filter(Boolean);

  return [
    {
      label: 'Operator',
      detail: d.operator ? `${d.operator} ─── confirmed` : '─── offline',
      status: d.operator ? 'success' : 'offline',
    },
    {
      label: 'Runtimes',
      detail: runtimes ? `${runtimes} ─── operational` : '─── offline',
      status: runtimes ? 'success' : 'offline',
    },
    {
      label: 'Claude',
      detail:
        d.claudeSessions > 0
          ? `${d.claudeSessions} sessions · ${d.claudeProjects} projects ─── loaded`
          : '─── offline',
      status: d.claudeSessions > 0 ? 'success' : 'offline',
    },
    {
      label: 'MCP channels',
      detail:
        d.mcpChannels > 0
          ? `${d.mcpChannels} active ─── online`
          : '─── offline',
      status: d.mcpChannels > 0 ? 'success' : 'offline',
    },
    {
      label: 'GitHub uplink',
      detail: d.githubAuth ? '─── authenticated' : '─── offline',
      status: d.githubAuth ? 'success' : 'offline',
    },
    {
      label: 'Cloud bridges',
      detail:
        cloudBridges.length > 0
          ? `${cloudBridges.join(', ')} ─── standing by`
          : '─── offline',
      status: cloudBridges.length > 0 ? 'warning' : 'offline',
    },
  ];
}

function defaultScans(): ScanResult[] {
  return [
    { label: 'Operator', detail: '─── standing by', status: 'warning' },
    { label: 'Runtimes', detail: '─── standing by', status: 'warning' },
    { label: 'Claude', detail: '─── standing by', status: 'warning' },
    { label: 'MCP channels', detail: '─── standing by', status: 'warning' },
    { label: 'GitHub uplink', detail: '─── standing by', status: 'warning' },
    { label: 'Cloud bridges', detail: '─── standing by', status: 'warning' },
  ];
}

export async function runSystemScans(): Promise<ScanResult[]> {
  try {
    const app = App();
    if (!app?.BootScan) return defaultScans();
    const data: BootScanData = await app.BootScan();
    return data ? formatScans(data) : defaultScans();
  } catch {
    return defaultScans();
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd /Users/subash.karki/phantom-os/v2/frontend && npx tsc --noEmit`
Expected: No errors related to scan-system.ts

- [ ] **Step 3: Commit**

```bash
git add v2/frontend/src/screens/boot/scan-system.ts
git commit -m "feat(boot): add system scan runner — Wails binding with graceful fallback"
```

---

### Task 4: ParticleCanvas Component

**Files:**
- Create: `v2/frontend/src/screens/boot/ParticleCanvas.tsx`

- [ ] **Step 1: Create ParticleCanvas.tsx**

```tsx
import { onMount, onCleanup } from 'solid-js';
import type { BootPhase } from './particle-math';
import {
  createParticles,
  computeGridTargets,
  updateParticles,
  computeParticleCount,
  computeParticleRadius,
} from './particle-math';
import { canvas } from './boot-screen.css';

interface ParticleCanvasProps {
  phase: () => BootPhase;
}

export function ParticleCanvas(props: ParticleCanvasProps) {
  let ref!: HTMLCanvasElement;

  onMount(() => {
    const ctx = ref.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let w = 0;
    let h = 0;
    let particles = createParticles(80);
    let targets = computeGridTargets(80);
    let radius = computeParticleRadius(dpr);

    function resize() {
      const rect = ref.parentElement!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      ref.width = w * dpr;
      ref.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = computeParticleCount(w, h);
      if (Math.abs(count - particles.length) > 20) {
        particles = createParticles(count);
        targets = computeGridTargets(count);
        particles.forEach((p, i) => {
          p.targetX = targets[i].x;
          p.targetY = targets[i].y;
        });
      }
      radius = computeParticleRadius(dpr);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(ref.parentElement!);
    resize();

    particles = createParticles(computeParticleCount(w, h));
    targets = computeGridTargets(particles.length);
    particles.forEach((p, i) => {
      p.targetX = targets[i].x;
      p.targetY = targets[i].y;
    });

    let lastTime = performance.now();
    let animId = 0;

    function loop(time: number) {
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;

      updateParticles(particles, props.phase(), dt);

      ctx!.clearRect(0, 0, w, h);
      for (const p of particles) {
        if (p.opacity <= 0) continue;
        const px = p.x * w;
        const py = p.y * h;

        ctx!.globalAlpha = p.opacity * 0.25;
        ctx!.beginPath();
        ctx!.arc(px, py, radius * 3, 0, Math.PI * 2);
        const grad = ctx!.createRadialGradient(
          px, py, radius,
          px, py, radius * 3,
        );
        grad.addColorStop(0, 'rgba(0, 212, 255, 0.4)');
        grad.addColorStop(1, 'rgba(0, 212, 255, 0)');
        ctx!.fillStyle = grad;
        ctx!.fill();

        ctx!.globalAlpha = p.opacity;
        ctx!.beginPath();
        ctx!.arc(px, py, radius, 0, Math.PI * 2);
        ctx!.fillStyle = '#00d4ff';
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;

      animId = requestAnimationFrame(loop);
    }

    animId = requestAnimationFrame(loop);

    onCleanup(() => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    });
  });

  return <canvas ref={ref} class={canvas} />;
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd /Users/subash.karki/phantom-os/v2/frontend && npx tsc --noEmit`
Expected: No errors related to ParticleCanvas.tsx

- [ ] **Step 3: Commit**

```bash
git add v2/frontend/src/screens/boot/ParticleCanvas.tsx
git commit -m "feat(boot): add ParticleCanvas — responsive canvas with burst/converge/dissolve animation"
```

---

### Task 5: ConfirmationPanel Component

**Files:**
- Create: `v2/frontend/src/screens/boot/ConfirmationPanel.tsx`

- [ ] **Step 1: Create ConfirmationPanel.tsx**

```tsx
import { createSignal, createEffect, onCleanup, For, untrack } from 'solid-js';
import type { ScanResult } from './scan-system';
import {
  confirmationPanel,
  scanLine,
  scanLabel,
  scanDetail,
  statusDotSuccess,
  statusDotWarning,
  statusDotOffline,
  pulsing,
} from './boot-screen.css';

interface ConfirmationPanelProps {
  lines: () => ScanResult[];
  active: () => boolean;
  onAllShown: () => void;
}

function dotClass(status: ScanResult['status']): string {
  switch (status) {
    case 'success':
      return statusDotSuccess;
    case 'warning':
      return statusDotWarning;
    default:
      return statusDotOffline;
  }
}

export function ConfirmationPanel(props: ConfirmationPanelProps) {
  const [visibleCount, setVisibleCount] = createSignal(0);

  createEffect(() => {
    if (!props.active()) return;
    const total = untrack(() => props.lines().length);
    if (total === 0) return;

    let count = 0;
    const interval = setInterval(() => {
      count++;
      setVisibleCount(count);
      if (count >= total) {
        clearInterval(interval);
        props.onAllShown();
      }
    }, 300);

    onCleanup(() => clearInterval(interval));
  });

  const visibleLines = () => props.lines().slice(0, visibleCount());

  return (
    <div class={confirmationPanel}>
      <For each={visibleLines()}>
        {(line) => (
          <div class={scanLine}>
            <span class={dotClass(line.status)}>●</span>
            <span class={scanLabel}>{line.label}</span>
            <span
              class={`${scanDetail}${line.status === 'warning' ? ` ${pulsing}` : ''}`}
            >
              {line.detail}
            </span>
          </div>
        )}
      </For>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd /Users/subash.karki/phantom-os/v2/frontend && npx tsc --noEmit`
Expected: No errors related to ConfirmationPanel.tsx

- [ ] **Step 3: Commit**

```bash
git add v2/frontend/src/screens/boot/ConfirmationPanel.tsx
git commit -m "feat(boot): add ConfirmationPanel — timed scan result lines with status indicators"
```

---

### Task 6: BootScreen Orchestrator

**Files:**
- Create: `v2/frontend/src/screens/boot/BootScreen.tsx`

- [ ] **Step 1: Create BootScreen.tsx with state machine**

```tsx
import { createSignal, createEffect, onMount, Show } from 'solid-js';
import type { BootPhase } from './particle-math';
import type { ScanResult } from './scan-system';
import { runSystemScans } from './scan-system';
import { ParticleCanvas } from './ParticleCanvas';
import { ConfirmationPanel } from './ConfirmationPanel';
import {
  overlay,
  overlayDismiss,
  nominalLine,
} from './boot-screen.css';

interface BootScreenProps {
  ready: () => boolean;
  onComplete: () => void;
}

export function BootScreen(props: BootScreenProps) {
  const [phase, setPhase] = createSignal<BootPhase>('BURST');
  const [scanResults, setScanResults] = createSignal<ScanResult[]>([]);
  const [confirmsDone, setConfirmsDone] = createSignal(false);
  const [showNominal, setShowNominal] = createSignal(false);

  const confirmLines = (): ScanResult[] => [
    ...scanResults(),
    {
      label: 'System Core',
      detail: props.ready() ? '─── connected' : '─── reconnecting...',
      status: props.ready() ? 'success' : 'warning',
    },
  ];

  onMount(async () => {
    setTimeout(() => setPhase('CONVERGE'), 100);
    setTimeout(() => setPhase('CONFIRM'), 1000);

    const results = await runSystemScans();
    setScanResults(results);
  });

  createEffect(() => {
    if (phase() === 'CONFIRM' && confirmsDone() && props.ready()) {
      setShowNominal(true);
      setTimeout(() => setPhase('DISMISS'), 800);
    }
  });

  createEffect(() => {
    if (phase() === 'DISMISS') {
      setTimeout(() => props.onComplete(), 500);
    }
  });

  return (
    <div class={phase() === 'DISMISS' ? overlayDismiss : overlay}>
      <ParticleCanvas phase={phase} />
      <Show when={phase() === 'CONFIRM' || phase() === 'DISMISS'}>
        <ConfirmationPanel
          lines={confirmLines}
          active={() => phase() === 'CONFIRM'}
          onAllShown={() => setConfirmsDone(true)}
        />
        <Show when={showNominal()}>
          <div class={nominalLine}>All systems nominal</div>
        </Show>
      </Show>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd /Users/subash.karki/phantom-os/v2/frontend && npx tsc --noEmit`
Expected: No errors related to BootScreen.tsx

- [ ] **Step 3: Commit**

```bash
git add v2/frontend/src/screens/boot/BootScreen.tsx
git commit -m "feat(boot): add BootScreen orchestrator — state machine with real system scans"
```

---

### Task 7: Wire Into App

**Files:**
- Modify: `v2/frontend/src/screens/boot/index.ts`
- Modify: `v2/frontend/src/app.tsx`

- [ ] **Step 1: Update barrel export**

In `v2/frontend/src/screens/boot/index.ts`, add the BootScreen export alongside the existing BootCeremony export (keep BootCeremony for now — spec says retire later, don't delete):

```typescript
export { BootCeremony } from './BootCeremony';
export { BootScreen } from './BootScreen';
```

- [ ] **Step 2: Swap import in app.tsx**

In `v2/frontend/src/app.tsx`, find the BootCeremony import and usage:

Change the import:
```typescript
// Before:
import { BootCeremony } from './screens/boot';
// After:
import { BootScreen } from './screens/boot';
```

Change the JSX usage — find:
```tsx
<BootCeremony ready={ready} onComplete={() => setBootCeremonyDone(true)} />
```

Replace with:
```tsx
<BootScreen ready={ready} onComplete={() => setBootCeremonyDone(true)} />
```

The props interface is identical (`ready: () => boolean`, `onComplete: () => void`) so no other changes are needed.

- [ ] **Step 3: Verify typecheck passes**

Run: `cd /Users/subash.karki/phantom-os/v2/frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Visual verification**

Run: `cd /Users/subash.karki/phantom-os/v2/frontend && pnpm dev`
Expected:
1. Black screen appears immediately
2. Cyan particles burst outward from center (~100ms)
3. Particles converge into grid formation (~900ms)
4. Confirmation lines appear one by one below center (300ms each)
5. Lines show "standing by" (amber) if Go BootScan binding not implemented, or real data if it is
6. System Core line shows "reconnecting..." then flips to "connected" when backend ready
7. "All systems nominal" appears in gold
8. Fade out, desktop revealed
9. Total time: under 5 seconds

- [ ] **Step 5: Commit**

```bash
git add v2/frontend/src/screens/boot/index.ts v2/frontend/src/app.tsx
git commit -m "feat(boot): wire BootScreen into app — replace BootCeremony with particle burst boot"
```

---

### Task 8 (Backend): Go BootScan Binding

> **Note:** This task crosses into the Go backend layer. It is optional for the boot to function — without it, all scan lines show "standing by" in amber. Implement when ready to light up real data.

**Files:**
- Create: `v2/internal/app/boot_scan.go`

- [ ] **Step 1: Create BootScan method on the App struct**

Find the App struct definition in `v2/internal/app/` and add this method. Adjust the struct receiver name to match existing code:

```go
package app

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type BootScanResult struct {
	Operator       string `json:"operator"`
	NodeVersion    string `json:"nodeVersion"`
	BunVersion     string `json:"bunVersion"`
	ClaudeSessions int    `json:"claudeSessions"`
	ClaudeProjects int    `json:"claudeProjects"`
	MCPChannels    int    `json:"mcpChannels"`
	GithubAuth     bool   `json:"githubAuth"`
	AWSConfigured  bool   `json:"awsConfigured"`
	GCPConfigured  bool   `json:"gcpConfigured"`
}

func (a *App) BootScan() (*BootScanResult, error) {
	home, _ := os.UserHomeDir()
	r := &BootScanResult{}

	if out, err := exec.Command("git", "config", "--global", "user.name").Output(); err == nil {
		r.Operator = strings.TrimSpace(string(out))
	}

	if out, err := exec.Command("node", "--version").Output(); err == nil {
		r.NodeVersion = strings.TrimSpace(strings.TrimPrefix(string(out), "v"))
	}

	if out, err := exec.Command("bun", "--version").Output(); err == nil {
		r.BunVersion = strings.TrimSpace(string(out))
	}

	claudeDir := filepath.Join(home, ".claude", "projects")
	if entries, err := os.ReadDir(claudeDir); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				r.ClaudeProjects++
			}
		}
		r.ClaudeSessions = r.ClaudeProjects
	}

	settingsPath := filepath.Join(home, ".claude", "settings.json")
	if data, err := os.ReadFile(settingsPath); err == nil {
		var settings map[string]any
		if json.Unmarshal(data, &settings) == nil {
			if mcp, ok := settings["mcpServers"].(map[string]any); ok {
				r.MCPChannels = len(mcp)
			}
		}
	}

	ghPath := filepath.Join(home, ".config", "gh", "hosts.yml")
	if _, err := os.Stat(ghPath); err == nil {
		r.GithubAuth = true
	}

	awsPath := filepath.Join(home, ".aws", "credentials")
	if _, err := os.Stat(awsPath); err == nil {
		r.AWSConfigured = true
	}

	gcpDir := filepath.Join(home, ".config", "gcloud")
	if _, err := os.Stat(gcpDir); err == nil {
		r.GCPConfigured = true
	}

	return r, nil
}
```

- [ ] **Step 2: Rebuild and verify**

Run: `cd /Users/subash.karki/phantom-os/v2 && go build ./...`
Expected: Build succeeds with no errors

- [ ] **Step 3: Visual verification**

Run the app and confirm scan lines now show real data (operator name, runtime versions, session counts, etc.) instead of "standing by."

- [ ] **Step 4: Commit**

```bash
git add v2/internal/app/boot_scan.go
git commit -m "feat(boot): add Go BootScan binding — real system health checks for boot sequence"
```
