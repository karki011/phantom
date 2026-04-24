# PhantomOS Boot Sequence — Design Spec

**Author:** Subash Karki  
**Date:** 2026-04-24  
**Status:** Approved  
**Target:** V2 (SolidJS + vanilla-extract + solid-motionone)

---

## Overview

Replace the current terminal-typewriter boot with a **canvas particle burst** boot that runs real system-level health checks. The boot confirms operator identity and system readiness in under 5 seconds, gating on Go backend availability.

**Emotional tone:** Raw power, confirmation mode — the system already knows the operator, it's running preflight.

---

## Boot Timeline

| Time | Phase | What happens |
|------|-------|-------------|
| T+0.0s | `BURST` | Black screen. Canvas mounts at full viewport. 200-400 particles explode outward from center. |
| T+0.1s | `CONVERGE` | Particles receive target positions (PhantomOS grid formation). Spring physics pulls them into shape over ~800ms. |
| T+1.0s | `CONFIRM` | Confirmation lines begin printing in DOM layer below center. One line every ~300ms. Real scan data populates each line. |
| T+3.5s | `DISMISS` | Triggered when: all confirmation lines rendered AND System Core responds. Particles dissolve outward (reverse burst). Overlay fades to transparent (500ms). Desktop revealed. `onComplete()` fires. |

**Total duration:** Under 5 seconds. If System Core (Go backend) takes longer, the last confirmation line pulses "reconnecting..." until ready — no dead air, no crash.

---

## State Machine

```
BURST → CONVERGE → CONFIRM → DISMISS
```

Four states, forward-only. No loops, no branching. Each state transition is time-based except `CONFIRM → DISMISS`, which gates on backend readiness.

---

## Component Architecture

```
<BootScreen>                    ← Full-viewport overlay, z-index top
  <ParticleCanvas />            ← Canvas element, responsive
  <ConfirmationPanel />         ← DOM layer, scan result lines
  <SystemCoreGate />            ← Invisible, polls BE, signals ready
</BootScreen>
```

### ParticleCanvas

- HTML5 `<canvas>` overlay filling the viewport
- Retina support: canvas dimensions = `window.innerWidth * devicePixelRatio` x `window.innerHeight * devicePixelRatio`, CSS size = `100vw x 100vh`
- `ResizeObserver` recalculates on window resize
- All particle positions stored as 0.0–1.0 ratios (center = 0.5, 0.5), converted to pixels at render time
- Particle count scales with screen area: `Math.min(400, Math.floor((width * height) / 5000))`
- Particle radius: `Math.max(1.5, 2.5 * devicePixelRatio)`
- Burst radius: `Math.min(width, height) * 0.4`
- Convergence target: grid formation (evenly spaced dot matrix centered on screen). A custom sigil shape can replace this later by swapping the target position array.
- Particle color: accent cyan `#00d4ff` with glow (radial gradient per particle)
- Animation loop via `requestAnimationFrame`, cleanup on unmount

**Particle lifecycle:**
1. **Spawn** at center (0.5, 0.5) with random velocity vector
2. **Burst** outward for ~100ms
3. **Converge** toward target position via spring physics (stiffness + damping)
4. **Hold** in formation during CONFIRM phase
5. **Dissolve** outward on DISMISS (velocity reverses, opacity fades)

### ConfirmationPanel

- Positioned below canvas center using flexbox
- Font size: `clamp(0.75rem, 1.2vw, 1rem)`
- Monospace font (inherit from PhantomOS design tokens)
- Lines appear one at a time, every ~300ms, no typewriter per-character delay
- Each line has a status indicator dot (●) colored by result:
  - Green `#22c55e` — confirmed/operational/online
  - Amber `#f59e0b` — standing by / degraded
  - Muted `#64748b` — offline / not found
- Final "All systems nominal" line uses gold `#f59e0b`

### SystemCoreGate

- Invisible component, no DOM output
- On mount: sends HTTP GET to Go backend health endpoint (port from env config)
- Retries every 500ms until response received
- Exposes a SolidJS signal: `ready()` → boolean
- BootScreen reads `ready()` to gate the CONFIRM → DISMISS transition

---

## System Scans

All scans execute in parallel at boot mount via `Promise.allSettled`. No scan blocks another. Results render in fixed display order regardless of completion order.

| Scan | Method | Display |
|------|--------|---------|
| Operator identity | `git config --global user.name` | `● Operator: Subash Karki ─── confirmed` |
| Runtimes | Check `node --version`, `bun --version` existence | `● Runtimes: Node 22 · Bun 1.2 ─── operational` |
| Claude sessions | Read `~/.claude/projects/` dir, count subdirs | `● Claude: 47 sessions · 12 projects ─── loaded` |
| MCP channels | Read `~/.claude/settings.json`, count mcpServers keys | `● MCP channels: 6 active ─── online` |
| GitHub uplink | Check `~/.config/gh/hosts.yml` exists | `● GitHub uplink ─── authenticated` |
| Cloud bridges | Check `~/.aws/credentials`, `~/.config/gcloud/` exist | `● Cloud bridges: AWS ─── standing by` |
| System Core | HTTP GET to Go backend health endpoint | `● System Core ─── connected` |

**Failure handling:** If any scan fails, its line shows the label with "─── offline" in muted color. Boot continues. Only System Core is a hard gate.

**No project-specific data** — at boot time no project is selected. Git branch, PRs, test status come later when the user picks a workspace.

---

## Responsive Strategy

| Concern | Solution |
|---------|----------|
| Canvas sharpness | `devicePixelRatio` scaling on canvas dimensions |
| Particle density | Count scales with viewport area, capped at 400 |
| Particle size | `Math.max(1.5, 2.5 * dpr)` — visible on all displays |
| Burst spread | `Math.min(w, h) * 0.4` — proportional to smallest dimension |
| Text readability | `clamp(0.75rem, 1.2vw, 1rem)` font sizing |
| Live resize | `ResizeObserver` recalculates canvas + particle targets |
| Position system | All coordinates as 0.0–1.0 ratios, pixel conversion at render |

---

## Audio

**Deferred.** No audio in initial implementation. Architecture supports adding a `useBootAudio` hook later that can fire a bass hit at T+0.0s and a low hum during CONVERGE/CONFIRM. The `BootScreen` state machine exposes phase transitions as signals that an audio layer can subscribe to.

---

## Graceful Degradation

| Scenario | Behavior |
|----------|----------|
| All scans fail | Boot proceeds, all lines show "offline" in muted color |
| System Core takes >5s | Last line pulses "System Core ─── reconnecting..." — boot holds, never crashes |
| Canvas not supported | Fall back to CSS-only fade-in (unlikely in Electron, safety net) |
| Window resize during boot | `ResizeObserver` recalculates, particles reposition smoothly |

---

## Files to Create/Modify

**New files (in `v2/frontend/src/screens/boot/`):**
- `BootScreen.tsx` — Top-level component, state machine, orchestration
- `ParticleCanvas.tsx` — Canvas rendering, particle physics
- `ConfirmationPanel.tsx` — DOM scan result display
- `SystemCoreGate.tsx` — Backend health polling
- `scan-system.ts` — Parallel system scan runner (all scan logic)
- `particle-math.ts` — Spring physics, position calculations, responsive scaling
- `boot-screen.css.ts` — vanilla-extract styles

**Modify:**
- `v2/frontend/src/app.tsx` — Replace current `BootCeremony` import with new `BootScreen`

**Retire (keep for reference, don't delete yet):**
- `BootCeremony.tsx`, `boot-script.ts`, `boot-ceremony.css.ts` — old terminal typewriter boot

---

## Out of Scope

- Audio (deferred to future iteration)
- Project-specific data in boot (no project selected at boot time)
- Onboarding flow changes (OnboardingFlow remains separate, unchanged)
- Custom sigil/logo design (use existing PhantomOS branding or placeholder grid formation)
- WebGL/WebGPU (canvas 2D is sufficient for 200-400 particles)
