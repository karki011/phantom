# Phantom Composer: Agent Status Overlay Design Spec

## Context

The Phantom Composer currently renders tool calls (Bash, Edit, Write, Agent, etc.) as individual chips in the message feed. When agents spawn background tasks (`run_in_background: true`), there is no unified view of:
- Which agents are currently spawned and their status
- How long each has been running
- Token consumption across active agents
- Whether an agent succeeded, failed, or is still running

This spec designs an overlay panel to surface spawned agent status at a glance.

---

## Current State (Phantom v2)

### Backend (Go)
- **Composer Service** (`internal/composer/service.go`):
  - Tool calls produce `Event` objects with `Type: "tool_use"`
  - Events include `ToolName`, `ToolInput` (JSON), `ToolUseID`
  - Tool result events arrive as `Type: "tool_result"` with truncated content
  - Status lifecycle per turn: "running" → "done" | "error" | "cancelled"
  - No special event type for agent spawning; agent is just a tool like any other

### Frontend (Solid.js + Vanilla Extract CSS)

- **ComposerToolSummary.ts**:
  - `extractToolSummary(toolName, inputJSON)` parses agent JSON:
    - `description` — user-facing task description
    - `model` — Haiku/Sonnet/Opus
    - `run_in_background` — boolean flag (currently only creates "bg" badge)
  - Agent case: `label = "${description} (${model})"`, `badge = "bg"` if background

- **ComposerToolStatus.css.ts**:
  - `statusDotRunning` — spinning 12px circle (accent color)
  - `statusDotSuccess` — static dot (green)
  - `statusDotError` — static dot (red)
  - `toolBadge` — small pill badge (accent color, 9px mono text)

---

## Design Options

### Option A: Floating Sidebar Panel (RECOMMENDED)

```
┌────────────────────────────────────────┬─────────────────────┐
│  Composer Feed                         │  Agents Running (4) │
│ [Agent Summary Chip]                  │ ┌─────────────────┐ │
│ [Bash Chip]                           │ │ setup config    │ │
│ [Edit Chip]                           │ │ ⟳ 4m 23s       │ │
│                                        │ │ 2.4K tokens    │ │
│                                        │ └─────────────────┘ │
│                                        │ ┌─────────────────┐ │
│                                        │ │ index search    │ │
│                                        │ │ ⟳ 1m 15s       │ │
│                                        │ │ 1.1K tokens    │ │
│                                        │ └─────────────────┘ │
│                                        │ ┌─────────────────┐ │
│                                        │ │ format results  │ │
│                                        │ │ ✓ 2m 5s        │ │
│                                        │ │ 890 tokens     │ │
│                                        │ └─────────────────┘ │
│                                        │ ┌─────────────────┐ │
│                                        │ │ generate report │ │
│                                        │ │ ✗ Error        │ │
│                                        │ │ Failed: timeout │ │
│                                        │ └─────────────────┘ │
│                                        └─────────────────────┘
└────────────────────────────────────────┴─────────────────────┘
```

#### Pros
- Non-intrusive; doesn't disrupt the message feed
- Clear visual hierarchy (running → done → error)
- Matches VS Code's "Running Tasks" panel
- Easy to integrate: side-by-side in ComposerPane

#### Cons
- Takes up horizontal space on smaller screens
- Requires state management for agent tracking

#### Implementation Complexity: **M**

---

### Option B: Bottom Drawer (Expandable)

```
├────────────────────────────────────────┤
│  Agents ▼ [4 total]                    │
├────────────────────────────────────────┤
│ [setup config ⟳] [index search ⟳]    │
│ [format results ✓] [generate report ✗]│
│ Total: 4.4K tokens | 2 running        │
└────────────────────────────────────────┘
```

#### Pros
- Familiar pattern (browser DevTools, Docker Desktop)
- Doesn't steal horizontal space

#### Cons
- Reduces vertical space for message feed
- Extra click to see agents

#### Implementation Complexity: **M–L**

---

### Option C: Inline Status Strip

```
│ Agents: [setup config ✓] [index search ⟳] […] ✕
├────────────────────────────────────────┤
│  Composer Feed
```

#### Pros
- Ultra-compact, always visible
- Minimal UI overhead

#### Cons
- Very limited info per agent
- Doesn't scale beyond 5–6 agents

#### Implementation Complexity: **S**

---

## RECOMMENDED: Option A + Light Mode

### Why?
1. **Aligns with Phantom patterns**: sidebar layouts are already used
2. **Information density**: name, model, status, elapsed, tokens all visible
3. **Extensible**: easy to add "retry", "copy output", etc.
4. **Familiar**: VS Code Task Runner precedent

### Key Features (MVP)
- Panel slides in from right when first agent spawns
- Cards show: description, status dot, elapsed time, token estimate
- Running agents at top; done/error below
- Click card to expand and see full result (500 char limit)
- Auto-collapse after 10s when all done (unless pinned)
- Pin button to keep open

---

## Data Model

```typescript
interface DeployedAgent {
  agentId: string;              // tool_use_id from Event
  description: string;           // from ToolInput.description
  model: 'haiku' | 'sonnet' | 'opus';
  isBackground: boolean;         // from ToolInput.run_in_background
  status: 'spawning' | 'running' | 'completed' | 'failed';
  startedAt: number;             // unix ms
  elapsedMs: number;             // computed by timer
  inputTokens?: number;
  outputTokens?: number;
  resultSummary?: string;        // truncated (200 chars)
  errorMessage?: string;
}
```

---

## CSS/Styling

### Reuse from Existing
- `statusDotRunning` — spinning dot for active agents
- `statusDotSuccess` — green dot for done
- `statusDotError` — red dot for failed
- `toolBadge` — repurpose for model badges

### New Styles Needed
- `agentCard` — flex column, padding sm, border 1px, bgTertiary
- `agentStatusLine` — flex row with icon + elapsed time (mono)
- `agentTokens` — right-aligned, 9px mono, muted
- `panelContainer` — width 280px, slide-in animation

### Color Palette
- Running: `vars.color.accent` (cyan)
- Done: `vars.color.success` (green)
- Error: `vars.color.danger` (red)
- Background: `vars.color.bgSecondary`

### Animations
- Panel: `translateX: 100% → 0`, 300ms
- Status dot: reuse existing spin keyframe (0.8s)
- Card expand: max-height 80px → 300px, 200ms
- Auto-fade: opacity 1 → 0.5 after 10s (if not pinned)

---

## Backend Requirements

**Good news: No changes needed.**

Current `Event` schema already carries:
- ToolInput with `description`, `model`, `run_in_background`
- ToolUseID for linking result back to agent
- Message delta events for token counts

MVP can estimate agent tokens as: (total turn tokens ÷ agent count).

---

## Implementation Phases

### Phase 1: Minimal (Days 4–5)
- Add `AgentStatusPanel.tsx` component
- Add `AgentStatusPanel.css.ts` styles
- Track agents in context by tool_use_id
- Display when first agent spawns
- Hide when all done

### Phase 2: Polish (Days 2–3)
- Expand/collapse per card
- Pin/unpin button
- Timer loop for elapsed time
- Token count display
- Error details

### Phase 3: Integration (Days 3–5)
- "Jump to feed" link
- "Retry agent" button
- Compare multiple runs side-by-side

---

## Example Lifecycle

```
User: "Run tests in parallel with analysis"
    ↓
Claude spawns 2 agents with run_in_background: true
    ↓
Frontend receives tool_use events:
  - agentId=abc, description="run pytest", model="sonnet"
  - agentId=def, description="analyze code", model="haiku"
    ↓
Panel appears with 2 running cards
    ↓
(30s later) tool_result for abc arrives:
  Card updates: ✓ run pytest | 0m 45s | 1.2K tokens
    ↓
(15s later) tool_result for def arrives:
  Card updates: ✓ analyze code | 1m 02s | 890 tokens
    ↓
Both done; panel fades after 10s
User can click card to see full output before fade
```

---

## Risk Mitigation

- ✅ No backend changes (data already available)
- ✅ Frontend state only (no perf risk)
- ✅ Can ship independently
- ✅ Graceful fallback (panel hidden if no agents)

---

## Acceptance Criteria

- [ ] Panel appears when agent spawns, hides when all done
- [ ] Cards show: name, status dot, elapsed time, token count
- [ ] Click to expand shows full result (truncated at 500 chars)
- [ ] Auto-collapse after 10s (unless pinned)
- [ ] Styled with Phantom theme vars
- [ ] Animations smooth (slide-in, expand, spin)
- [ ] Works with 1–20+ agents (scrollable)

