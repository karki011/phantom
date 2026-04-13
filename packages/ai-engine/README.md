# @phantom-os/ai-engine

Graph-backed adaptive AI agent system that intelligently routes user goals through specialized reasoning strategies based on real-time code context analysis. The engine learns from its own decisions over time and avoids repeating failed approaches.

**Author:** Subash Karki

---

## How It Works

```
Goal Input
  -> Graph Context Extraction
  -> Task Assessment (complexity / risk / ambiguity)
  -> Prior Decision Query (anti-repetition)
  -> Strategy Selection (historically weighted)
  -> Execution
  -> Evaluation & Auto-Refinement
  -> Knowledge Recording
  -> Result
```

The engine has four layers:

| Layer | Purpose | Source |
|-------|---------|-------|
| **Graph** | Two-layer code knowledge base + document ingestion | [`src/graph/`](src/graph/) |
| **Strategy** | 6 plugin-based reasoning strategies | [`src/strategies/`](src/strategies/) |
| **Orchestrator** | Pipeline coordination, assessment, evaluation | [`src/orchestrator/`](src/orchestrator/) |
| **Knowledge** | Per-project learning, anti-repetition, pattern discovery | [`src/knowledge/`](src/knowledge/) |

---

## Graph System

Builds a multi-layer knowledge graph of the codebase. See [`src/types/graph.ts`](src/types/graph.ts) for all type definitions.

**Layer 1 — File-level:** FileNodes and ModuleNodes connected by import/dependency edges. Built by [`GraphBuilder`](src/graph/builder.ts) via a two-pass approach.

**Layer 2 — AST-enriched:** Functions, classes, types, React components extracted by [`ASTEnricher`](src/graph/ast-enricher.ts) with line numbers, params, complexity metrics.

**Document Layer:** READMEs, ADRs, design docs ingested by [`DocumentBuilder`](src/graph/document-builder.ts) and linked to code files — giving strategies architectural rationale alongside code structure.

### Supported Languages

JavaScript/TypeScript, Python, Go, Rust, Java — see [`src/graph/parsers/`](src/graph/parsers/) for each parser.

### 10 Node Types

`file` `module` `function` `class` `type` `component` `document` `decision` `outcome` `pattern`

### 12 Edge Types

`imports` `depends_on` `exports` `co_changed` `calls` `implements` `renders` `uses_hook` `documents` `informed_by` `outcome_of` `exemplified_by`

### Key Components

- [`InMemoryGraph`](src/graph/in-memory-graph.ts) — O(1) node/edge lookup with bidirectional adjacency lists
- [`GraphQuery`](src/graph/query.ts) — Context selection, blast radius analysis, path finding
- [`GraphPersistence`](src/graph/persistence.ts) — SQLite serialization
- [`IncrementalUpdater`](src/graph/incremental.ts) + [`FileWatcher`](src/graph/file-watcher.ts) — Real-time graph sync

---

## Strategy System

Six reasoning strategies, each scored against the task context. The highest scorer wins. See [`src/types/strategy.ts`](src/types/strategy.ts) for the plugin interface.

| Strategy | When It Activates | Source |
|----------|------------------|--------|
| **Direct** | Simple + low risk | [`direct.ts`](src/strategies/direct.ts) |
| **Tree of Thought** | Ambiguous tasks | [`tree-of-thought.ts`](src/strategies/tree-of-thought.ts) |
| **Debate** | Critical/high risk | [`debate.ts`](src/strategies/debate.ts) |
| **Advisor** | Complex tasks needing escalation | [`advisor.ts`](src/strategies/advisor.ts) |
| **Self-Refine** | Near-final outputs (50-85% confidence) | [`self-refine.ts`](src/strategies/self-refine.ts) |
| **Graph of Thought** | Critical complexity, large blast radius | [`graph-of-thought.ts`](src/strategies/graph-of-thought.ts) |

Strategy selection is adaptive:
- Scores are weighted by historical success rate via [`PerformanceStore`](src/strategies/performance-store.ts)
- A -0.3 penalty is applied if the strategy previously failed on a similar goal ([`prior-penalty.ts`](src/strategies/prior-penalty.ts))
- Falls back to Direct if nothing scores above 0.1

---

## Orchestrator Pipeline

The [`Orchestrator`](src/orchestrator/orchestrator.ts) runs an 11-step pipeline: gather context, assess task, check priors, select strategy, execute, evaluate, auto-refine, record knowledge, return result.

- **Assessment** ([`assessor.ts`](src/orchestrator/assessor.ts)) — derives complexity from file count, risk from blast radius, ambiguity from goal keywords. Injects prior failure/success signals.
- **Evaluation** ([`evaluator.ts`](src/orchestrator/evaluator.ts)) — checks confidence, token efficiency, context coverage, completeness. Recommends accept/refine/escalate.
- **Multi-Perspective Evaluation** ([`multi-evaluator.ts`](src/orchestrator/multi-evaluator.ts)) — extends base evaluator with consistency checks against past decisions.

See [`src/orchestrator/types.ts`](src/orchestrator/types.ts) for `GoalInput`, `OrchestratorResult`, and `EvaluationResult`.

---

## Knowledge System

Inspired by [OmegaWiki](https://github.com/skyllwt/OmegaWiki)'s "everything writes back" pattern. Every orchestrator run records its decision, outcome, and strategy performance so the engine improves over time.

### Per-Project Storage

Each project gets its own SQLite database at `~/.phantom-os/ai-engine/{projectId}.db`. Worktrees share the parent project's DB. Managed by [`KnowledgeDB`](src/knowledge/knowledge-db.ts).

| Table | What It Stores |
|-------|---------------|
| `decisions` | Goal, strategy chosen, confidence, complexity, risk, files, duration |
| `outcomes` | Success/failure, evaluation score, failure reason |
| `patterns` | Emergent patterns distilled from repeated decisions (permanent) |
| `strategy_performance` | Per-strategy metrics for historical scoring |

### Anti-Repetition

[`DecisionQuery`](src/graph/decision-query.ts) finds past decisions with similar goals using Jaccard token similarity. The assessor injects `priorFailures` / `priorSuccess` signals into the task context, and each strategy deprioritizes itself if it previously failed on a similar goal.

### Compaction

[`Compactor`](src/orchestrator/compactor.ts) runs lazily on first `process()` call — synthesizes patterns from aggregate performance data, then prunes decisions older than 30 days. Patterns are permanent. Each project DB stays ~1-5MB.

### Knowledge Writer

[`KnowledgeWriter`](src/orchestrator/knowledge-writer.ts) records decisions + outcomes after every pipeline run. Non-blocking — errors are caught and logged, never thrown.

---

## Event System

10 typed events for observability and UI indicators. See [`src/types/events.ts`](src/types/events.ts) for definitions, [`EventBus`](src/events/event-bus.ts) for the pub/sub implementation.

**Graph events:** `build:start` `build:progress` `build:complete` `build:error` `update:start` `update:complete` `stale`

**Knowledge events:** `decision:recorded` `pattern:discovered` `compaction:complete`

---

## Testing

```bash
pnpm test          # 469 tests across 16 files
pnpm test:watch    # Watch mode
pnpm test:coverage # V8 coverage report
```

---

## File Structure

```
src/
  types/          # All type definitions (graph, strategy, events)
  graph/          # Graph storage, building, querying, parsing, documents
    parsers/      # Language-specific AST parsers (JS/TS, Python, Go, Rust, Java)
  strategies/     # 6 reasoning strategies + registry + performance store
  orchestrator/   # Pipeline, assessment, evaluation, knowledge writing
  knowledge/      # Per-project SQLite database manager
  events/         # Typed pub/sub event bus
  __tests__/      # 16 test files
```

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `@phantom-os/db` | Database abstraction |
| `@phantom-os/shared` | Shared constants |
| `better-sqlite3` | Per-project knowledge databases |
| `chokidar` | Filesystem watching |
| `typescript` | TypeScript compiler API for AST parsing |
