# Team Skills vs AI Engine — Architectural Comparison

**Author:** Subash Karki | **Date:** 2026-04-15

---

## TL;DR

| Dimension | Team Skills (Phantom Works) | AI Engine (`packages/ai-engine`) |
|---|---|---|
| **What it is** | Multi-agent orchestration framework for Claude Code sessions | Graph-backed code intelligence + adaptive reasoning engine |
| **Runs where** | Claude Code CLI (skills, hooks, Agent tool) | Phantom OS server process (MCP tools, REST API) |
| **Primary concern** | *Who* does the work and *how* they coordinate | *What* the codebase looks like and *which strategy* to reason with |
| **State format** | Markdown files, NDJSON event logs, JSON sessions | SQLite databases, in-memory graph, persisted nodes/edges |
| **Learning mechanism** | Human-curated learnings in `INDEX.md` with lifecycle tags | Automated: Jaccard similarity on past goals, strategy performance scores |
| **Anti-repetition** | Cortex scans `learnings/{domain}.md ## Corrections` before spawning agents | `prior-penalty.ts` applies -0.3 score penalty from `DecisionQuery` |

---

## 1. Core Purpose — Complementary, Not Competing

### Team Skills = **Orchestration Layer** (the "who" and "how")
- Manages a crew of 6 agent personas (Cortex, Spark, Sentinel, Prism, Oracle, Lens)
- Routes tasks as SOLO or CREW based on file count, risk, and domain complexity
- Enforces governance: contracts before code, verification after code, learnings captured
- Tracks sessions, decisions, and progress via event-sourced board

### AI Engine = **Intelligence Layer** (the "what" and "which")
- Builds a dependency graph of the entire codebase (10 node types, 12 edge types)
- Selects reasoning strategies adaptively (6 strategies with historical weight adjustment)
- Provides context, blast radius, and related file queries to any consumer
- Records decisions and outcomes in SQLite for continuous improvement

**Key insight:** Team Skills orchestrates *agents*. AI Engine orchestrates *reasoning about code*. They operate at different levels of abstraction.

---

## 2. Strategy / Routing Systems

### Team Skills — Task Routing
```
Input: task description + risk assessment
Output: SOLO route (1 Spark) or CREW route (N Sparks + specialists)

Routing logic (in _shared-crew.md):
  - ≤3 files, single concern, low risk → SOLO
  - 4+ files, multi-concern, medium+ risk → CREW
  
Decided by: Cortex (opus) using heuristics + learnings
```

### AI Engine — Strategy Selection
```
Input: TaskContext (goal, active files, complexity, risk, ambiguity, prior signals)
Output: Selected ReasoningStrategy (1 of 6)

Selection logic (registry.ts):
  - Each strategy returns activation score (0-1) based on context
  - Score × historical weight (0.5-1.5 from past performance)
  - Highest adjusted score wins; fallback to 'direct'
  
Decided by: StrategyRegistry algorithm (deterministic)

Strategies:
  1. Direct       — simple/low-risk passthrough
  2. TreeOfThought — 3-branch exploration for ambiguous tasks
  3. Debate       — advocate vs critic for high-risk decisions
  4. Advisor      — escalation to stronger model
  5. SelfRefine   — iterative confidence improvement
  6. GraphOfThought — dependency-aware decomposition
```

**Overlap:** Both classify tasks by complexity/risk and route accordingly.
**Difference:** Team routing picks *who* executes. AI Engine routing picks *how* to reason.

---

## 3. Knowledge / Learning Systems

### Team Skills — Human-Curated Knowledge
```
Storage: Markdown files in repos/{REPO}/learnings/
Domains: ui.md, data.md, auth.md, testing.md, crew.md, migration.md, tooling.md
Format: ## Patterns, ## Corrections, ## Habits per domain
Lifecycle: [proposed] → [validated:N] → promoted to global at 5+
Anti-repetition: Cortex scans ## Corrections, builds block, injects into agent prompts
Promotion: [validated:5+] entries → global/patterns/INDEX.md [scope:global]
```

### AI Engine — Automated Knowledge DB
```
Storage: SQLite at ~/.phantom-os/ai-engine/{projectId}.db
Tables: decisions, outcomes, patterns, strategy_performance
Learning: Automatic — every orchestrator.process() writes decision + outcome
Anti-repetition: Jaccard token similarity finds similar past goals, -0.3 penalty on failed strategies
Compaction: 30-day TTL pruning + pattern synthesis from aggregate data (≥5 occurrences)
```

**Overlap:** Both track what worked and what didn't to avoid repeating mistakes.
**Difference:** Team learnings require human curation (learn command, pause/wrap). AI Engine records automatically and uses statistical analysis.

---

## 4. Graph / Context Awareness

### Team Skills — No Native Graph
- Relies on `phantom_graph_context` MCP tool (which calls AI Engine!)
- Scout agents do ad-hoc codebase exploration via Explore/Grep/Glob
- No persistent model of code structure

### AI Engine — Full Dependency Graph
- Layer 1: File nodes + import/export edges (5 language parsers)
- Layer 2: AST-enriched function/class/component nodes + calls/renders/uses_hook edges
- Document layer: markdown/text linked to code via path references
- Queries: context (BFS with relevance decay), blast radius (reverse BFS), path finding
- Incremental updates via file watcher + content hashing
- Persisted to SQLite, LRU cached (max 3 projects in memory)

**Key finding:** Team Skills already consumes AI Engine via MCP tools. The graph is AI Engine's unique value.

---

## 5. Event / Communication Systems

### Team Skills — Event-Sourced Board
```
Events: TaskCreate/TaskUpdate captured by PostToolUse hook → NDJSON files
Board: Hono server materializes events → React dashboard with SSE
Session markers: [Cortex] SESSION:start/pause/wrap
Decision events: [Cortex] DECISION:route/outcome → decisions.ndjson
```

### AI Engine — Typed EventBus
```
Events: 10 typed events (graph:build:*, strategy:*, knowledge:*, orchestrator:*)
Consumers: Server forwards to SSE for UI indicators
No persistent event log (events are ephemeral)
```

**Overlap:** Both emit events for observability.
**Difference:** Team events are persisted (NDJSON) and form the board's source of truth. AI Engine events are ephemeral in-memory pub/sub.

---

## 6. What Each Has That the Other Doesn't

### Only in Team Skills (not in AI Engine)
- **Agent personas** with specialized roles and behavioral constraints
- **Contract templates** (feature, API, testing, UI) for governance
- **Session lifecycle** (start → pause → resume → wrap) with context preservation
- **Visual pipeline** (Lens: Figma extraction + Playwright verification)
- **Remote dispatch** (fire-and-forget to Anthropic cloud)
- **Live dashboard** (React board with SSE)
- **Superpowers integration** (6 skills mapped to 4 phases)
- **Evaluation rubric** for crew performance
- **Human-in-the-loop** planning approval via EnterPlanMode/ExitPlanMode

### Only in AI Engine (not in Team Skills)
- **Dependency graph** with 10 node types, 12 edge types, 5 language parsers
- **AST enrichment** (function/class/component extraction via TS compiler)
- **Reasoning strategies** (6 pluggable algorithms: direct, tree-of-thought, debate, advisor, self-refine, graph-of-thought)
- **Automated learning** (every decision recorded, statistical weight adjustment)
- **Blast radius calculation** (reverse BFS with impact scoring)
- **Document linking** (markdown/text ↔ code node relationships)
- **Incremental graph updates** (file watcher + content hashing + branch switch detection)
- **Pattern synthesis** (compactor extracts patterns from ≥5 similar decisions)
- **Multi-perspective evaluation** (confidence, token efficiency, context coverage, prior consistency)

---

## 7. Integration Points (Already Connected)

The two systems ARE already integrated via MCP:

```
Team Skills (Cortex/Spark) 
  → calls phantom_graph_context MCP tool
  → calls phantom_graph_blast_radius MCP tool
  → calls phantom_orchestrator_process MCP tool
  → AI Engine processes and returns results
```

This means:
- Cortex uses AI Engine's graph for codebase understanding during Phase B planning
- Spark agents can query blast radius before refactoring
- The orchestrator's strategy selection can inform how agents approach problems

---

## 8. Potential Synergies (Not Yet Realized)

| Opportunity | Description |
|---|---|
| **Feed team learnings into AI Engine** | Team's curated corrections could seed `decisions` table with high-confidence signals |
| **Use AI Engine strategies in team routing** | Instead of Cortex heuristics for SOLO/CREW, let AI Engine's adaptive scoring decide |
| **Persist AI Engine events to team board** | Forward `knowledge:decision:recorded` events to NDJSON for board visibility |
| **AI Engine-informed contracts** | Use blast radius + context queries to auto-generate contract scopes |
| **Strategy performance → team learnings** | When AI Engine detects a pattern (≥5 occurrences), promote to team learnings |
| **Team session context → AI Engine** | Feed session intent/goals as additional context for strategy selection |

---

## Summary Diagram

```
┌─────────────────────────────────────────────────┐
│              Team Skills (Phantom Works)          │
│  ┌─────────┐  ┌───────┐  ┌────────┐  ┌───────┐ │
│  │ Cortex  │→ │ Spark │→ │Sentinel│→ │ Prism │ │
│  │(plan)   │  │(code) │  │(verify)│  │(review)│ │
│  └────┬────┘  └───┬───┘  └────────┘  └───────┘ │
│       │           │                              │
│  Contracts  Learnings  Sessions  Board (NDJSON)  │
└───────┼───────────┼──────────────────────────────┘
        │           │
        ▼           ▼         ← MCP tools →
┌─────────────────────────────────────────────────┐
│              AI Engine (packages/ai-engine)       │
│  ┌─────────┐  ┌───────────┐  ┌────────────────┐ │
│  │  Graph  │→ │Orchestrator│→ │   Strategies   │ │
│  │(L1+L2)  │  │ (pipeline) │  │(6 algorithms)  │ │
│  └─────────┘  └─────┬─────┘  └────────────────┘ │
│                      │                            │
│  SQLite (knowledge)  EventBus  File Watcher       │
└──────────────────────────────────────────────────┘
```
