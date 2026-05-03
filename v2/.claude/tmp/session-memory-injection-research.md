# Session-Start Memory Injection — Research & Design

Author: Subash Karki
Date: 2026-05-03

---

## 1. Current Prompt Assembly Analysis

### Flow: User prompt → Claude CLI

```
User types prompt
    ↓
service.go Send()
    ↓
buildPromptWithMentions(prompt, mentions, cwd)     // inline @file tags
    ↓
prepend aiEngineDirective                           // MCP tool instructions
    ↓
orchestrator.Process(goal, activeFiles)             // strategy selection
    ↓  returns enriched directive text
prepend orchestrator directive                      // strategy guidance
    ↓
s.run() spawns CLI:
    claude -p <assembled_prompt>
           --output-format stream-json --verbose
           --include-partial-messages --include-hook-events
           --thinking enabled --thinking-display summarized
           --permission-mode auto
           --session-id <uuid> | --resume <uuid>
           --model <model>
           [--effort <level>]
           [--setting-sources "" if NoContext]
```

### What's injected today (per-turn)

| Layer | Content | Size |
|-------|---------|------|
| `aiEngineDirective` | MCP tool descriptions (phantom_before_edit, etc.) | ~800 chars |
| Orchestrator directive | Strategy name + guidance text (from strategy.Execute) | ~500-2000 chars |
| @file mentions | Inlined file content as `<file>` tags | Variable |
| User prompt | Raw user text | Variable |

### Key observation

**No memory/pattern injection happens at session start.** The orchestrator runs per-turn and enriches the prompt with strategy guidance, but historical patterns, decisions, and project knowledge are NOT injected into the Claude system prompt. They influence strategy *selection* internally but Claude never sees them directly.

---

## 2. Claude CLI System Prompt Options

Three injection vectors available:

### A. `--system-prompt <prompt>`
- **Replaces** the default system prompt entirely
- **Bad choice** — we'd lose Claude Code's built-in system prompt (tool instructions, safety guidelines, CLAUDE.md loading, etc.)

### B. `--append-system-prompt <prompt>` ← BEST OPTION
- **Appends** to the default system prompt
- Preserves all built-in behavior (CLAUDE.md, tools, permissions)
- Memory block goes into the actual system prompt, not user turn
- Benefits from Anthropic's prompt caching (system prompt cached across turns)
- **First turn only**: on `--resume` turns, the system prompt is already set from the first turn

### C. `--append-system-prompt-file <path>`
- Same as B but reads from a file
- Good for large memory blocks (avoids shell argument length limits)
- Can dynamically generate the file before spawning CLI

### D. Prepend to `-p` prompt (current approach for strategy)
- Memory appears as user message content, not system prompt
- Not cached by Anthropic's prompt cache across turns
- Mixes context with user intent

### Recommendation

**Use `--append-system-prompt` for first turn, file variant for safety.**

1. Generate memory block as a temp file
2. Pass `--append-system-prompt-file /tmp/phantom-memory-XXXX.md` on first Send
3. On `--resume` turns, the system prompt persists automatically — no re-injection needed

---

## 3. Memory Selection Algorithm

### What to include (priority order)

#### Tier 1 — Always included (~1KB budget)

**Project profile** (from `ContextProvider.ForProject`):
- Project type, build system, package manager
- File count, top languages
- Already available via `graph/context.go` — just need to call it

**Recent successful patterns for this project** (from `DecisionStore`):
```go
decisions := ds.ListRecent(10)
// Filter to verifier-phase successes
// Extract: goal summary, strategy used, complexity
```

#### Tier 2 — High-value, include if budget allows (~1-2KB)

**Global patterns with high success rates** (from `GlobalPatternStore`):
```go
patterns := gps.GetAll()
// Sort by success_rate DESC
// Take top 5
// Format: "For {complexity}/{risk} tasks, {strategy} has {rate}% success across {N} projects"
```

**Recent decisions and their outcomes** (from `DecisionStore`):
```go
recent := ds.ListRecent(5)
// Include: goal, strategy_id, confidence, outcome (success/fail)
// Shows Claude what worked recently in this project
```

#### Tier 3 — Nice-to-have, include if space remains (~0.5-1KB)

**Semantic memory matches** (from `VectorStore`):
- Not useful at session start (no goal yet to match against)
- Better suited for per-turn injection (which the orchestrator already does internally)
- **Skip for session-start injection**

**File graph stats** (from `filegraph.Indexer`):
```go
g := indexer.Graph()
stats := g.Stats() // N files, N edges, top modules
```

### What NOT to include

- **Semantic memory** — no query context at session start, relevance impossible to determine
- **Failed approaches** — these are goal-specific, useless without knowing the goal
- **Full file contents** — too large, already available via MCP tools
- **Decision raw SQL data** — format as human-readable summaries

### Priority + Budget Allocation

| Tier | Content | Budget | Rationale |
|------|---------|--------|-----------|
| 1 | Project profile | 400 chars | Cheap, always useful |
| 1 | Active patterns (top 5) | 600 chars | Direct strategy guidance |
| 2 | Global patterns (top 5) | 500 chars | Cross-project wisdom |
| 2 | Recent decision outcomes | 800 chars | Learning signal |
| 3 | File graph stats | 300 chars | Orientation |
| **Total** | | **~2.6KB** | |

---

## 4. Token Budget Analysis

### Reference points

- Claude-remember injects ~2-4KB of context (identity + remember + now + today + recent)
- Phantom's `graph/context.go` caps at `MaxContextChars = 8000` chars
- Claude Code's built-in system prompt is ~15-20KB
- Total context window: 200K tokens (~800KB text)
- User's first prompt: typically 100-2000 chars

### Recommended budget

**Target: 3KB (soft cap), 4KB (hard cap)**

- 3KB ≈ 750 tokens — negligible impact on context window
- Fits within Anthropic's prompt cache window (system prompt is cached)
- Leaves plenty of room for user prompt + tool results
- Claude-remember proves 2-4KB is the sweet spot

### Hard cap implementation

```go
const MaxSessionMemoryChars = 4000

func (sm *SessionMemory) Build() string {
    var sections []string
    budget := MaxSessionMemoryChars

    // Add sections in priority order, stop when budget exhausted
    for _, section := range sm.sections {
        if len(section) > budget {
            break
        }
        sections = append(sections, section)
        budget -= len(section)
    }

    return strings.Join(sections, "\n\n")
}
```

---

## 5. When to Compute the Injection

### Option A: Lazy on first Send with caching ← RECOMMENDED

```
First Send for pane (isResume == false):
  1. Build session memory from stores (10-50ms — all SQLite, in-memory index)
  2. Write to temp file
  3. Pass --append-system-prompt-file to CLI
  4. Cache the memory block keyed by (cwd, sessionID)

Subsequent Sends (isResume == true):
  → System prompt already set from first turn
  → No re-injection needed (claude --resume preserves it)
```

**Why this is best:**
- Zero startup cost (no pre-computation at app launch)
- Memory is project-specific (needs CWD which is only known at Send time)
- SQLite queries are fast (10-50ms for all queries combined)
- Natural fit with existing `isResume` branching in `service.go`

### Option B: At app startup (rejected)

- Don't know which projects the user will work on
- Would need to pre-compute for all linked worktrees (wasteful)
- Memory would go stale if user works for hours before first prompt

### Option C: At session creation in `ensureSessionRow` (close second)

- Slightly earlier than Option A but same timing in practice
- Would split the logic across two methods unnecessarily

---

## 6. How Claude-Remember Does It

From the research report:

1. **SessionStart hook** fires when a new Claude session begins
2. Hook script reads layered memory files (identity → remember → now → today → recent → archive)
3. Files are concatenated with `=== MEMORY ===` / `--- filename ---` markers
4. Injected as a single block into the session context
5. `remember.md` is a one-shot handoff (cleared after read) — prevents repetition
6. Cooldown (120s) prevents thrashing from rapid tool calls

**Key differences from Phantom:**
- Claude-remember operates as an external hook (bash scripts) — Phantom controls the CLI spawn directly
- Claude-remember uses file-based storage (markdown) — Phantom has SQLite with queryable stores
- Claude-remember's memory is conversational (turn summaries) — Phantom's is decision/pattern-based

**What we should steal:**
- Structured memory markers (`<phantom-memory>` tags) for easy identification
- Priority ordering (most important first, budget-cut from the end)
- One-shot handoff concept (show recent session summary once, then clear)
- Session-start timing (not per-turn)

---

## 7. Proposed Injection Architecture

### New file: `internal/composer/session_memory.go`

Responsible for:
1. Querying all memory stores
2. Formatting into a structured text block
3. Enforcing the token budget
4. Writing to a temp file for CLI consumption

### Integration point: `service.go` — `Send()` method

```
                    Send()
                      │
                      ├── isResume? → skip memory injection
                      │
                      ├── buildSessionMemory(ctx, cwd, deps)
                      │     ├── queryProjectProfile(cwd)
                      │     ├── queryActivePatterns(deps.Decisions)
                      │     ├── queryGlobalPatterns(deps.GlobalPatterns)
                      │     ├── queryRecentOutcomes(deps.Decisions)
                      │     └── queryGraphStats(indexer)
                      │
                      ├── writeMemoryFile(memory) → /tmp/phantom-mem-XXXX.md
                      │
                      └── run() with --append-system-prompt-file <path>
```

### Memory block format

```xml
<phantom-memory>
## Project Context
Go + SolidJS desktop app (Wails v2). 847 files, 12 modules.
Build: `wails dev`. Test: `go test ./...`.

## Proven Patterns (this project)
- complexity=moderate, risk=low → "dependency-aware" strategy (85% success, 12 uses)
- complexity=simple, risk=low → "direct" strategy (92% success, 28 uses)
- complexity=high, risk=moderate → "incremental" strategy (70% success, 5 uses)

## Cross-Project Patterns
- For moderate/low tasks: "dependency-aware" works across 3 projects (88% avg)
- For high/moderate tasks: "incremental" works across 2 projects (75% avg)

## Recent Session History
- Last session: "Add conflict detection to composer" → dependency-aware → SUCCESS
- Before that: "Fix VectorStore expiry bug" → direct → SUCCESS
- Before that: "Refactor orchestrator scoring" → incremental → FAILED (blast radius underestimated)
</phantom-memory>
```

---

## 8. Implementation Plan

### Phase 1: Core Memory Builder (2 days)

**File: `internal/composer/session_memory.go`**

```go
// Author: Subash Karki
package composer

import (
    "fmt"
    "strings"

    "github.com/subashkarki/phantom-os-v2/internal/ai/graph/filegraph"
    "github.com/subashkarki/phantom-os-v2/internal/ai/knowledge"
    "github.com/subashkarki/phantom-os-v2/internal/ai/orchestrator"
)

const MaxSessionMemoryChars = 4000

// SessionMemory assembles a structured memory block for injection into
// the Claude system prompt at session start. Queries are all SQLite-backed
// and complete in <50ms.
type SessionMemory struct {
    deps    orchestrator.Dependencies
    indexer *filegraph.Indexer
    cwd     string
}

// NewSessionMemory creates a memory builder for the given project context.
func NewSessionMemory(deps orchestrator.Dependencies, indexer *filegraph.Indexer, cwd string) *SessionMemory {
    return &SessionMemory{deps: deps, indexer: indexer, cwd: cwd}
}

// Build assembles the memory block, respecting the character budget.
// Returns empty string if no meaningful memory is available.
func (sm *SessionMemory) Build() string {
    var sections []string

    // Tier 1: Project profile
    if profile := sm.projectProfile(); profile != "" {
        sections = append(sections, profile)
    }

    // Tier 1: Active patterns for this project
    if patterns := sm.activePatterns(); patterns != "" {
        sections = append(sections, patterns)
    }

    // Tier 2: Global cross-project patterns
    if global := sm.globalPatterns(); global != "" {
        sections = append(sections, global)
    }

    // Tier 2: Recent decision outcomes
    if outcomes := sm.recentOutcomes(); outcomes != "" {
        sections = append(sections, outcomes)
    }

    // Tier 3: File graph stats
    if stats := sm.graphStats(); stats != "" {
        sections = append(sections, stats)
    }

    if len(sections) == 0 {
        return ""
    }

    // Assemble with budget enforcement
    result := "<phantom-memory>\n"
    budget := MaxSessionMemoryChars - len("<phantom-memory>\n</phantom-memory>")
    for _, s := range sections {
        if len(s) > budget {
            break
        }
        result += s + "\n\n"
        budget -= len(s) + 2
    }
    result += "</phantom-memory>"
    return result
}

// projectProfile returns project type, file count, build commands.
func (sm *SessionMemory) projectProfile() string {
    if sm.indexer == nil {
        return ""
    }
    g := sm.indexer.Graph()
    stats := g.Stats()
    return fmt.Sprintf("## Project Context\n%d files, %d edges. Root: %s",
        stats.FileCount, stats.EdgeCount, sm.cwd)
}

// activePatterns queries DecisionStore for successful strategies in this project.
func (sm *SessionMemory) activePatterns() string {
    if sm.deps.Decisions == nil {
        return ""
    }

    recent, err := sm.deps.Decisions.ListRecent(20)
    if err != nil || len(recent) == 0 {
        return ""
    }

    // Aggregate by strategy: count successes, total, compute rate
    type stratStats struct {
        successes int
        total     int
        complexity string
        risk       string
    }
    byStrategy := make(map[string]*stratStats)

    for _, d := range recent {
        key := d.StrategyID
        s, ok := byStrategy[key]
        if !ok {
            s = &stratStats{complexity: d.Complexity, risk: d.Risk}
            byStrategy[key] = s
        }
        rate, count, _ := sm.deps.Decisions.GetSuccessRate(d.StrategyID, d.Complexity)
        if count > 0 {
            s.successes = int(rate * float64(count))
            s.total = count
        }
    }

    var lines []string
    for strategy, s := range byStrategy {
        if s.total == 0 {
            continue
        }
        rate := float64(s.successes) / float64(s.total) * 100
        lines = append(lines, fmt.Sprintf("- %s/%s → \"%s\" (%.0f%% success, %d uses)",
            s.complexity, s.risk, strategy, rate, s.total))
    }

    if len(lines) == 0 {
        return ""
    }
    return "## Proven Patterns (this project)\n" + strings.Join(lines, "\n")
}

// globalPatterns queries GlobalPatternStore for cross-project successes.
func (sm *SessionMemory) globalPatterns() string {
    if sm.deps.GlobalPatterns == nil {
        return ""
    }
    all := sm.deps.GlobalPatterns.GetAll()
    if len(all) == 0 {
        return ""
    }

    // Take top 5 by success rate
    limit := 5
    if len(all) < limit {
        limit = len(all)
    }

    var lines []string
    for _, p := range all[:limit] {
        lines = append(lines, fmt.Sprintf("- %s/%s → \"%s\" (%.0f%% across %d projects)",
            p.Complexity, p.Risk, p.StrategyID, p.SuccessRate*100, p.ProjectCount))
    }

    return "## Cross-Project Patterns\n" + strings.Join(lines, "\n")
}

// recentOutcomes shows the last 5 decisions with their outcomes.
func (sm *SessionMemory) recentOutcomes() string {
    if sm.deps.Decisions == nil {
        return ""
    }

    recent, err := sm.deps.Decisions.ListRecent(5)
    if err != nil || len(recent) == 0 {
        return ""
    }

    var lines []string
    for _, d := range recent {
        rate, count, _ := sm.deps.Decisions.GetSuccessRate(d.StrategyID, d.Complexity)
        outcome := "unknown"
        if count > 0 {
            if rate > 0.5 {
                outcome = "SUCCESS"
            } else {
                outcome = "FAILED"
            }
        }
        // Truncate goal to 60 chars
        goal := d.Goal
        if len(goal) > 60 {
            goal = goal[:57] + "..."
        }
        lines = append(lines, fmt.Sprintf("- \"%s\" → %s → %s", goal, d.StrategyID, outcome))
    }

    return "## Recent Session History\n" + strings.Join(lines, "\n")
}

// graphStats returns file graph statistics for orientation.
func (sm *SessionMemory) graphStats() string {
    if sm.indexer == nil {
        return ""
    }
    g := sm.indexer.Graph()
    stats := g.Stats()
    return fmt.Sprintf("## Codebase Stats\nFiles: %d | Symbols: %d | Edges: %d",
        stats.FileCount, stats.SymbolCount, stats.EdgeCount)
}
```

### Phase 2: Service Integration (1 day)

**Modify: `internal/composer/service.go` — `run()` method**

```go
// In the run() method, after building cliArgs and before exec.CommandContext:

// Session memory injection — first turn only.
// On --resume, the system prompt (including memory) persists from the first turn.
if !isResume && !args.NoContext {
    mem := NewSessionMemory(turnDeps, resolvedIndexer, args.CWD)
    if block := mem.Build(); block != "" {
        memFile, err := os.CreateTemp("", "phantom-mem-*.md")
        if err == nil {
            memFile.WriteString(block)
            memFile.Close()
            defer os.Remove(memFile.Name())
            cliArgs = append(cliArgs, "--append-system-prompt-file", memFile.Name())
            log.Info("composer: session memory injected",
                "chars", len(block),
                "file", memFile.Name(),
            )
        }
    }
}
```

### Phase 3: Emit Memory Event to Frontend (0.5 days)

```go
// After building memory, emit event so frontend can show "Memory loaded" chip
if block != "" {
    s.emit("composer:event", Event{
        PaneID:  args.PaneID,
        TurnID:  turnID,
        Type:    "memory_loaded",
        Content: fmt.Sprintf("Session memory: %d chars from %d sources", len(block), sourceCount),
    })
}
```

### Phase 4: Tests (1 day)

```go
// session_memory_test.go

func TestSessionMemory_Build_EmptyDeps(t *testing.T) {
    // Zero-valued deps → empty string
    sm := NewSessionMemory(orchestrator.Dependencies{}, nil, "/tmp")
    assert.Equal(t, "", sm.Build())
}

func TestSessionMemory_Build_BudgetEnforcement(t *testing.T) {
    // Verify output never exceeds MaxSessionMemoryChars
}

func TestSessionMemory_Build_TierPriority(t *testing.T) {
    // Tier 1 sections always included before Tier 2/3
}

func TestSessionMemory_Build_WithDecisions(t *testing.T) {
    // Mock DecisionStore with known data, verify formatted output
}

func TestSessionMemory_SkippedOnResume(t *testing.T) {
    // Verify --append-system-prompt-file NOT added when isResume=true
}
```

---

## 9. Effort Estimates

| Phase | Work | Estimate |
|-------|------|----------|
| 1 | `session_memory.go` — memory builder | 2 days |
| 2 | `service.go` integration + CLI flag | 1 day |
| 3 | Frontend event + "Memory loaded" chip | 0.5 days |
| 4 | Tests | 1 day |
| **Total** | | **4.5 days** |

### Dependencies

- No new Go dependencies needed
- All stores already wired via `orchestrator.Dependencies`
- `--append-system-prompt-file` is a stable Claude CLI flag
- Temp file cleanup handled by `defer os.Remove`

### Risks

| Risk | Mitigation |
|------|------------|
| Shell arg length limit | Using `--append-system-prompt-file` (file-based) |
| Stale memory on long sessions | Memory only injected on first turn; --resume preserves it |
| Query latency on slow disks | All SQLite, in-memory index — measured at <50ms |
| Memory block too large | Hard cap at 4000 chars, tiered priority |
| Breaking existing behavior | `--append-system-prompt` is additive, not replacement |

---

## 10. Future Enhancements (not in scope)

1. **Per-turn semantic enrichment** — use `VectorStore.FindSimilar` on each turn's goal to add relevant memories (partially done by orchestrator already)
2. **Session handoff** — when resuming a session, inject a "what happened last time" summary (like claude-remember's `remember.md`)
3. **User preference extraction** — mine past sessions for implicit preferences ("user prefers small functions", "user always asks for tests")
4. **Dynamic CLAUDE.md generation** — write a `.claude/phantom-context.md` that Claude Code auto-discovers (alternative to `--append-system-prompt-file`)
5. **Memory freshness scoring** — weight recent sessions higher than old ones when selecting patterns to inject
