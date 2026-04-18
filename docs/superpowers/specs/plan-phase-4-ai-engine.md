# Phase 4: Full AI Engine Port + Enhancements

**Author:** Subash Karki
**Date:** 2026-04-18
**Parent Spec:** `2026-04-18-phantomos-v2-design.md`
**Status:** Draft
**Dependencies:** Phase 1 (SQLite via sqlc), Phase 0 (Wails shell)

---

## Goal

Port the entire v1 TypeScript AI engine (`@phantom-os/ai-engine`) to Go with exact feature parity (Phase 4a), then layer on new capabilities — tiered pipeline, smart model routing, parallel strategy execution, and an AI Playground UI (Phase 4b). The Go engine must pass equivalent test coverage to v1 and integrate with the v2 SQLite layer (sqlc-generated code, modernc.org/sqlite).

---

## Prerequisites

- Phase 0 complete (Wails v2 shell, Solid.js frontend renders)
- Phase 1 complete (SQLite with sqlc, project detector, terminal manager)
- `go.mod` initialized with dependencies: `modernc.org/sqlite`, `github.com/fsnotify/fsnotify`, `github.com/sourcegraph/conc`, `github.com/charmbracelet/log`
- sqlc configured and generating typed Go from SQL queries

---

## Phase 4a — Exact Parity Port

### v1 Inventory (what must be ported)

| v1 Component | v1 File(s) | Lines | Complexity |
|---|---|---|---|
| **Types** (graph, strategy, events) | `types/graph.ts`, `types/strategy.ts`, `types/events.ts` | ~225 | Low |
| **Event Bus** | `events/event-bus.ts` | ~40 | Low |
| **In-Memory Graph** | `graph/in-memory-graph.ts` | ~430 | High |
| **Graph Builder** (Layer 1) | `graph/builder.ts` | ~545 | High |
| **Graph Query** | `graph/query.ts` | ~240 | Medium |
| **AST Enricher** (Layer 2) | `graph/ast-enricher.ts` | ~1015 | Very High |
| **Incremental Updater** | `graph/incremental.ts` | ~215 | Medium |
| **Graph Persistence** (SQLite) | `graph/persistence.ts` | ~335 | Medium |
| **File Watcher** | `graph/file-watcher.ts` | ~330 | Medium |
| **Document Builder** | `graph/document-builder.ts` | ~210 | Medium |
| **Decision Query** | `graph/decision-query.ts` | ~195 | Medium |
| **Parser Registry** | `graph/parsers/registry.ts` | ~65 | Low |
| **5 Language Parsers** | `graph/parsers/{javascript,python,go,rust,java}.ts` | ~400 total | Medium |
| **Parser Types** | `graph/parsers/types.ts` | ~35 | Low |
| **Knowledge DB** | `knowledge/knowledge-db.ts` | ~150 | Medium |
| **Decision Repository** | `knowledge/repositories/decision-repository.ts` | ~220 | Medium |
| **Pattern Repository** | `knowledge/repositories/pattern-repository.ts` | ~115 | Low |
| **Performance Repository** | `knowledge/repositories/performance-repository.ts` | ~160 | Medium |
| **Strategy Registry** | `strategies/registry.ts` | ~155 | Medium |
| **Direct Strategy** | `strategies/direct.ts` | ~70 | Low |
| **Advisor Strategy** | `strategies/advisor.ts` | ~80 | Low |
| **Self-Refine Strategy** | `strategies/self-refine.ts` | ~100 | Low |
| **Tree-of-Thought Strategy** | `strategies/tree-of-thought.ts` | ~220 | Medium |
| **Debate Strategy** | `strategies/debate.ts` | ~240 | Medium |
| **Graph-of-Thought Strategy** | `strategies/graph-of-thought.ts` | ~360 | High |
| **Performance Store** | `strategies/performance-store.ts` | ~60 | Low |
| **Prior Penalty** | `strategies/prior-penalty.ts` | ~35 | Low |
| **Orchestrator** | `orchestrator/orchestrator.ts` | ~360 | Very High |
| **Task Assessor** | `orchestrator/assessor.ts` | ~115 | Medium |
| **Evaluator** | `orchestrator/evaluator.ts` | ~85 | Low |
| **Multi-Perspective Evaluator** | `orchestrator/multi-evaluator.ts` | ~95 | Medium |
| **Knowledge Writer** | `orchestrator/knowledge-writer.ts` | ~130 | Medium |
| **Compactor** | `orchestrator/compactor.ts` | ~120 | Medium |
| **Orchestrator Types** | `orchestrator/types.ts` | ~60 | Low |

**Total: ~6,460 lines of TypeScript across 33 source files + 17 test files.**

---

### Tasks — Phase 4a

#### 4a.1 — Go Type Definitions

Port all v1 type definitions to Go structs and interfaces.

1. **Graph types** — `internal/ai/graph/types.go`
   - Port `NodeType` as string constants (`NodeTypeFile = "file"`, etc.)
   - Port `BaseNode`, `FileNode`, `ModuleNode`, `FunctionNode`, `ClassNode`, `TypeDefinitionNode`, `ComponentNode`, `DecisionNode`, `OutcomeNode`, `PatternNode`, `DocumentNode` as Go structs
   - Port `GraphNode` as interface: `type GraphNode interface { NodeID() string; NodeType() NodeType; ProjectID() string }`
   - Port `EdgeType` constants, `GraphEdge` struct
   - Port `GraphStats`, `ContextResult`, `BlastRadiusResult`
   - Map `Record<string, unknown>` to `map[string]any`
   - Map `Map<string, number>` to `map[string]float64`

2. **Strategy types** — `internal/ai/strategies/types.go`
   - Port `TaskComplexity`, `TaskRisk` as typed string constants
   - Port `PriorFailureSignal`, `PriorSuccessSignal`, `TaskContext`
   - Port `ActivationScore`, `StrategyInput`, `StrategyOutput`
   - Port `StrategyRole` constants
   - Define `Strategy` interface (matches v2 design spec):
     ```go
     type Strategy interface {
         ID() string
         Name() string
         Version() string
         Description() string
         Role() StrategyRole  // optional — empty string for no role
         ShouldActivate(ctx TaskContext) ActivationScore
         Execute(ctx context.Context, input StrategyInput) (StrategyOutput, error)
     }
     ```
   - Port `StrategyRegistryEntry`

3. **Event types** — `internal/ai/events/types.go`
   - Port `GraphBuildPhase`, all `GraphEventType` constants
   - Port all 10 event structs (`GraphBuildStartEvent`, `GraphBuildProgressEvent`, etc.)
   - Port `GraphEvent` as interface with `EventType() string` method
   - Port `GraphEventListener` as `func(GraphEvent)`

4. **Orchestrator types** — `internal/ai/orchestrator/types.go`
   - Port `GoalInput`, `OrchestratorResult`, `EvaluationResult`

#### 4a.2 — Event Bus

5. **Event Bus** — `internal/ai/events/bus.go`
   - Port `EventBus` class to Go struct with `sync.RWMutex` for goroutine safety
   - `On(eventType, listener) func()` — returns unsubscribe function
   - `OnAll(listener) func()`
   - `Emit(event)` — fire listeners under read lock
   - `RemoveAll()`
   - v1 uses `Set<listener>` — Go uses `map[*func]struct{}` or slice
   - **Key difference from v1:** Must be goroutine-safe (v1 was single-threaded)

#### 4a.3 — In-Memory Graph

6. **In-Memory Graph** — `internal/ai/graph/graph.go`
   - Port the full adjacency list implementation from `in-memory-graph.ts`
   - `nodes map[string]GraphNode`, `edges map[string]*GraphEdge`
   - `adjacency map[string]map[string]struct{}` (outgoing edge IDs per node)
   - `reverseAdjacency map[string]map[string]struct{}` (incoming edge IDs per node)
   - `filesByPath map[string]string` — keyed as `projectId:path`
   - `modulesByName map[string]string`
   - `nodesByProject map[string]map[string]struct{}`
   - `nodesByProjectAndType map[string]map[string]struct{}`
   - All mutation methods: `AddNode`, `AddEdge`, `RemoveNode`, `RemoveEdge`
   - All lookup methods: `GetNode`, `GetEdge`, `GetFileByPathInProject`, `GetFileByPath` (legacy), `GetModuleByName`
   - Edge queries: `GetOutgoingEdges`, `GetIncomingEdges`
   - Traversal: `GetNeighbors(nodeId, depth)` — BFS following both directions
   - Filtered queries: `GetNodesByType`, `GetNodesByProject`, `GetNodesByProjectAndType`
   - Bulk: `GetAllNodes`, `GetAllEdges`, `Clear`
   - Stats getter
   - **Concurrency:** Protect with `sync.RWMutex` — reads take read lock, mutations take write lock

7. **Tests** — `internal/ai/graph/graph_test.go`
   - Port all tests from `__tests__/in-memory-graph.test.ts`
   - Add concurrency test: parallel reads + writes

#### 4a.4 — Language Parsers

8. **Parser interface** — `internal/ai/graph/parsers/types.go`
   - Port `ParsedImport`, `ParsedExport`, `ParseResult`, `LanguageParser` interface

9. **JavaScript/TypeScript parser** — `internal/ai/graph/parsers/javascript.go`
   - Port regex-based import/export parsing from `javascript.ts`
   - Extensions: `ts`, `tsx`, `js`, `jsx`, `mjs`, `cjs`
   - Patterns: `import ... from '...'`, `export ... from '...'`, `require('...')`, export declarations
   - Port comment stripping (block + line comments)
   - Use Go `regexp` package (compile once as package-level vars)

10. **Python parser** — `internal/ai/graph/parsers/python.go`
    - Port from `python.ts`
    - Patterns: `import foo`, `from foo import bar`, `from . import bar` (relative)
    - Handle multi-module form: `import os, sys, json`

11. **Go parser** — `internal/ai/graph/parsers/go_parser.go` (avoid `go.go` name conflict)
    - Port from `go.ts`
    - Patterns: `import "pkg"`, `import ( "pkg1" "pkg2" )`
    - Use Go's `go/parser` and `go/ast` for native-quality parsing instead of regex (enhancement over v1)

12. **Rust parser** — `internal/ai/graph/parsers/rust.go`
    - Port from `rust.ts`
    - Patterns: `use crate::`, `use self::`, `use super::`, `mod foo;`, `extern crate`

13. **Java parser** — `internal/ai/graph/parsers/java.go`
    - Port from `java.ts`
    - Patterns: `import com.foo.Bar;`, `import static ...`, `package ...`

14. **Parser Registry** — `internal/ai/graph/parsers/registry.go`
    - Port from `registry.ts`
    - `Register(parser)`, `GetParser(extension)`, `GetSupportedExtensions()`
    - Pre-registers all 5 built-in parsers in `NewParserRegistry()`

15. **Parser Tests** — `internal/ai/graph/parsers/parsers_test.go`
    - Port all tests from `__tests__/parsers.test.ts`
    - Table-driven tests for each language parser

#### 4a.5 — Graph Builder (Layer 1)

16. **Graph Builder** — `internal/ai/graph/builder.go`
    - Port the two-pass build algorithm from `builder.ts`
    - Pass 1: Walk source files, create `FileNode`s (content hash via MD5)
    - Pass 2: Parse imports, resolve specifiers, create edges
    - Port `walkSourceFiles` — recursive directory walk, skip dirs, follow symlinks safely
    - Port `resolveRelativeImport` with language-aware extension resolution strategies
    - Port `extractPackageName` with language-aware package name extraction
    - Port `addRelativeImportEdge`, `addBareSpecifierEdge`
    - Port `buildFile` for single-file incremental updates
    - Port `SOURCE_EXTENSIONS`, `SKIP_DIRS`, `RESOLUTION_STRATEGIES` maps
    - **Go improvement:** Use `filepath.WalkDir` for directory traversal (more idiomatic)
    - **Go improvement:** Use `os.ReadDir` instead of `readdir` for better performance

17. **Builder Tests** — `internal/ai/graph/builder_test.go`
    - Port from `__tests__/builder.test.ts`
    - Test with temp directory fixtures

#### 4a.5b — Graph Build Enhancements (v2 Performance)

These tasks implement the 10 graph build improvements described in the master spec (section 5.1). They build on the parity builder (4a.5) and replace the regex parsers (4a.4) with tree-sitter.

18a. **Parallel Walk + Read + Parse** — `internal/ai/graph/builder.go` (enhance existing)
    - Replace sequential `filepath.WalkDir` with parallel directory walking via `sourcegraph/conc` goroutine pool
    - Fan out file reads and parses across bounded worker pool (default: `runtime.NumCPU()` workers)
    - Collect results into channel, build graph from aggregated parse results
    - Target: full build of 2k files in <500ms

18b. **Content Hash Cache + Mtime Validation** — `internal/ai/graph/cache.go` (new file)
    - `ContentHashCache` struct: `map[string]FileEntry` where `FileEntry = {path, contentHash, mtime, lastParsed}`
    - On build: check mtime first (fast path), fall back to MD5 content hash if mtime matches but staleness suspected
    - `Validate()` — startup fast-validation: compare mtimes against cache, return list of stale files
    - `MarkClean(path, hash, mtime)`, `IsStale(path) bool`
    - Persisted alongside graph in SQLite `graph_meta` table (serialized as JSON)
    - Target: startup cached graph validation in <200ms

18c. **Tree-sitter Integration** — `internal/ai/graph/treesitter.go` (new file)
    - Import `github.com/smacker/go-tree-sitter` with language grammars: TypeScript, JavaScript, Python, Go, Rust, Java, C, C++
    - `TreeSitterParser` struct implementing `LanguageParser` interface from `parsers/types.go`
    - Parse source file → tree-sitter AST → extract functions, classes, types, imports, exports
    - Replace regex parsers in registry when tree-sitter grammar is available (fallback to regex for unsupported languages)
    - Shared instance: expose `GetTree(path, source) *sitter.Tree` for Monaco syntax highlighting reuse
    - Grammar loading: lazy-load grammars on first use, cache compiled grammars in memory

18d. **Per-Project Graph Sharding** — `internal/ai/graph/shard.go` (new file)
    - `ShardManager` struct: manages multiple `InMemoryGraph` instances, one per project ID
    - `GetShard(projectID) *InMemoryGraph` — loads from SQLite cache if not in memory
    - `EvictShard(projectID)` — remove from memory (persists to SQLite first)
    - `ActiveShards() []string` — list currently loaded shards
    - Memory pressure handling: evict least-recently-used shards when total node count exceeds threshold (configurable, default 50k nodes)
    - Only active project shards stay in memory — inactive projects load on demand

18e. **Pre-computed Reverse Dependency Index** — `internal/ai/graph/reverse_index.go` (new file)
    - `ReverseIndex` struct: `map[string][]string` mapping node ID → list of dependent node IDs (files that import this file)
    - Built incrementally: updated on every `AddEdge`/`RemoveEdge` call in `InMemoryGraph`
    - `GetDirectDependents(nodeID) []string` — O(1) lookup
    - `GetTransitiveDependents(nodeID, maxDepth) []string` — BFS over reverse index
    - Blast radius query uses reverse index instead of graph traversal → target <1ms
    - Persisted as part of graph cache in SQLite

18f. **Graph Enhancement Tests** — `internal/ai/graph/cache_test.go`, `treesitter_test.go`, `shard_test.go`, `reverse_index_test.go`
    - Content hash cache: test mtime fast path, stale detection, persistence round-trip
    - Tree-sitter: test parse accuracy for each supported language against golden fixtures
    - Sharding: test load/evict/LRU behavior, concurrent shard access
    - Reverse index: test O(1) lookup, incremental update on edge add/remove, transitive dependents

#### 4a.6 — Graph Query

18. **Graph Query** — `internal/ai/graph/query.go`
    - Port `getContext(filePath, depth)` — BFS with distance-based relevance scoring
    - Port `getBlastRadius(filePath)` — direct (incoming `imports`) + transitive dependents
    - Port `getRelatedFiles(filePaths, depth)` — union of neighbor sets
    - Port `getStats(projectId)`
    - Port `findPath(from, to)` — BFS shortest path

19. **Query Tests** — `internal/ai/graph/query_test.go`
    - Port from `__tests__/query.test.ts`

#### 4a.7 — AST Enricher (Layer 2)

20. **AST Enricher** — `internal/ai/graph/enricher.go`
    - Port the full TS AST enrichment from `ast-enricher.ts`
    - **Go approach:** Use `go/parser` + `go/ast` for Go files natively. For TypeScript/JSX files, use regex-based extraction (the v1 approach uses the TS compiler API which doesn't exist in Go)
    - Port function extraction: named declarations, arrow functions, function expressions
    - Port class extraction: methods, properties, implements clauses
    - Port type extraction: interfaces, type aliases, enums
    - Port component detection: uppercase name + JSX body → ComponentNode
    - Port prop extraction, hook extraction from function bodies
    - Port edge creation: CALLS, USES_HOOK, RENDERS, IMPLEMENTS
    - Port cyclomatic complexity calculation (count branch points)
    - Port `buildNameLookup` for cross-file resolution
    - **Note:** The v1 AST enricher is TypeScript-specific (uses `ts.createSourceFile`). In Go, we must use a regex/heuristic approach for TS/JS or embed a lightweight parser. The Go parser can use `go/ast` natively for Go files. This is the most complex single file to port.

21. **Enricher Tests** — `internal/ai/graph/enricher_test.go`
    - Port from `__tests__/ast-enricher.test.ts`
    - Test with embedded source strings (no filesystem)

#### 4a.8 — Document Builder

22. **Document Builder** — `internal/ai/graph/document.go`
    - Port `buildDocs(projectId, rootDir)` from `document-builder.ts`
    - Walk for `.md` and `.txt` files (max depth 4)
    - Extract title from first `#` heading, sections from all headings
    - Extract file path references from backtick code spans and prose
    - Create `DocumentNode` + `documents` edges to referenced code files
    - Port `PRIORITY_DOCS` set

23. **Document Builder Tests** — `internal/ai/graph/document_test.go`
    - Port from `__tests__/document-builder.test.ts`

#### 4a.9 — Incremental Updater

24. **Incremental Updater** — `internal/ai/graph/incremental.go`
    - Port debounced change queue from `incremental.ts`
    - `QueueChange(change FileChange)` — add to pending, reset debounce timer
    - `Flush()` — deduplicate by path (keep last), process all changes
    - Hash-based change detection: compare MD5 content hash before rebuilding
    - Port `removeFile`, `hasFileChanged`, `handleBranchSwitch`, `checkStaleness`
    - **Go change:** Use `time.AfterFunc` for debounce timer, `sync.Mutex` for pending changes
    - **Go change:** Serialize flushes via channel or mutex (v1 uses promise tail)

25. **Incremental Tests** — `internal/ai/graph/incremental_test.go`
    - Port from `__tests__/incremental.test.ts`

#### 4a.10 — File Watcher

26. **File Watcher** — `internal/ai/graph/watcher.go`
    - Port from `file-watcher.ts` — replace chokidar with `fsnotify/fsnotify`
    - Watch rootDir for source file changes, feed to IncrementalUpdater
    - Port `isIgnoredPath` for filtering
    - Port git HEAD watcher: detect `.git/HEAD` changes for branch switches
    - Port `resolveGitHeadPath` — handle standard git dir, worktree `.git` file, missing `.git`
    - Port EMFILE recovery: switch to polling mode on file descriptor exhaustion
    - Port throttled error logging
    - **Go change:** `fsnotify` provides events directly (no polling mode built-in). Implement polling fallback manually or accept the limitation.
    - **Go change:** Use `context.Context` for lifecycle management instead of manual start/stop

27. **Watcher Tests** — `internal/ai/graph/watcher_test.go`
    - Port from `__tests__/file-watcher.test.ts`
    - Test with temp directories and fsnotify

#### 4a.11 — Graph Persistence (SQLite)

28. **SQL Schema** — `internal/db/migrations/004_graph_tables.up.sql`
    - Port the `graph_nodes`, `graph_edges`, `graph_meta` tables from v1
    - Exact column names preserved for migration compatibility
    - Add indexes matching v1 schema

29. **SQL Queries** — `internal/db/queries/graph.sql`
    - Write sqlc-annotated queries for:
      - `SaveNodes` (batch upsert via individual INSERTs in a transaction)
      - `LoadNodes(projectId)`, `LoadEdges(projectId)`
      - `SaveEdges` (batch upsert)
      - `SaveMeta`, `LoadMeta`, `LoadAllMeta`
      - `DeleteProject(projectId)` — cascading delete nodes, edges, meta

30. **Graph Persistence** — `internal/ai/graph/persistence.go`
    - Port from `persistence.ts`
    - Use sqlc-generated code instead of raw SQL
    - Port `safeStringify` → Go `encoding/json.Marshal` with cycle detection (or just use `json.Marshal` since Go structs don't have circular references by default)
    - `SaveNodes(nodes)` — transactional batch upsert
    - `LoadNodes(projectId)` — deserialize from metadata column
    - `SaveEdges(edges)`, `LoadEdges(projectId)`
    - `SaveMeta(stats)`, `LoadMeta(projectId)`, `LoadAllMeta()`
    - `DeleteProject(projectId)`

31. **Persistence Tests** — `internal/ai/graph/persistence_test.go`
    - Port from `__tests__/persistence.test.ts`
    - Use in-memory SQLite for tests

#### 4a.12 — Knowledge DB

32. **Knowledge DB Schema** — `internal/db/migrations/005_knowledge_tables.up.sql`
    - Port the `decisions`, `outcomes`, `patterns`, `strategy_performance` tables
    - Port all indexes from v1 `knowledge-db.ts` migrations

33. **Knowledge SQL Queries** — `internal/db/queries/knowledge.sql`
    - sqlc queries for all repository operations (see tasks 34-36)

34. **Decision Repository** — `internal/ai/knowledge/decision_repo.go`
    - Port from `decision-repository.ts`
    - `FindRecent(limit) []DecisionRecord`
    - `FindOutcomes(decisionIDs) map[string]OutcomeRecord`
    - `InsertDecision(params)`, `InsertOutcome(params)`
    - `DeleteOutcomesForOldDecisions(cutoff)`, `DeleteOldDecisions(cutoff) int`

35. **Pattern Repository** — `internal/ai/knowledge/pattern_repo.go`
    - Port from `pattern-repository.ts`
    - `FindPerformanceGroups(projectId, minDecisions) []StrategyPerformanceGroup`
    - `UpsertPattern(params)`

36. **Performance Repository** — `internal/ai/knowledge/performance_repo.go`
    - Port from `performance-repository.ts`
    - `GetPerformance(strategyId, complexity) *PerformanceRecord`
    - `GetBestStrategy(complexity, risk) *BestStrategy`
    - `InsertPerformance(params)`
    - `DeleteOldPerformance(cutoff)`

37. **Knowledge DB Manager** — `internal/ai/knowledge/db.go`
    - Port from `knowledge-db.ts`
    - Per-project database at `~/.phantom-os/ai-engine/{projectId}.db`
    - Open with WAL mode, busy timeout, foreign keys
    - Run migrations on creation
    - **Go change:** Use `modernc.org/sqlite` (pure Go) instead of `better-sqlite3`
    - **Go change:** sqlc generates typed Go instead of raw SQL strings

38. **Knowledge Tests** — `internal/ai/knowledge/knowledge_test.go`
    - Port from `__tests__/knowledge-system.test.ts` and `__tests__/repositories.test.ts`

#### 4a.13 — Decision Query

39. **Decision Query** — `internal/ai/graph/decision_query.go`
    - Port from `decision-query.ts`
    - `FindSimilarDecisions(goal, minSimilarity, limit) []PriorDecision`
    - `GetOutcomes(decisionIDs) map[string]PriorOutcome`
    - `GetFailedApproaches(goal) []PriorFailure`
    - `GetSuccessfulApproaches(goal) []PriorSuccess`
    - Port Jaccard similarity: tokenize (lowercase, remove stop words), intersection/union
    - Port stop words list

#### 4a.14 — All 6 Strategies

40. **Prior Penalty utility** — `internal/ai/strategies/prior_penalty.go`
    - Port from `prior-penalty.ts`
    - `ApplyPriorFailurePenalty(base, strategyID, context) ActivationScore`
    - `FAILURE_PENALTY = 0.3`

41. **Direct Strategy** — `internal/ai/strategies/direct.go`
    - Port from `direct.ts`
    - Simple pass-through: graph context IS the result
    - Activation: high for simple/low-risk, low otherwise
    - Confidence scales with file count: `min(0.95, 0.5 + filesUsed * 0.05)`

42. **Advisor Strategy** — `internal/ai/strategies/advisor.go`
    - Port from `advisor.ts`
    - Role: `escalator`
    - Activation: high for high-risk, complex, ambiguous, or large blast radius
    - Structures advisor prompt as JSON for upstream LLM call

43. **Self-Refine Strategy** — `internal/ai/strategies/self_refine.go`
    - Port from `self-refine.ts`
    - Role: `refiner`
    - Activation: high when previous outputs exist with moderate confidence (0.5-0.85)
    - Improvement delta: `min(0.95, lastConfidence + 0.15)`

44. **Tree-of-Thought Strategy** — `internal/ai/strategies/tree_of_thought.go`
    - Port from `tree-of-thought.ts`
    - Generate 3 branches (direct, conservative, refactoring)
    - Score each: feasibility, risk, effort → combined score
    - Select highest combined, format alternatives
    - Port `BranchScore`, `ThoughtBranch` types
    - Port `scoreBranch` with risk multiplier and blast radius risk

45. **Debate Strategy** — `internal/ai/strategies/debate.go`
    - Port from `debate.ts`
    - Configurable `numRounds` (default 2)
    - Build advocate points (for) and critic points (against)
    - Enrich critic with prior failure knowledge
    - Run rounds, judge synthesis
    - Port confidence calculation

46. **Graph-of-Thought Strategy** — `internal/ai/strategies/graph_of_thought.go`
    - Port from `graph-of-thought.ts`
    - Decompose goal into `ThoughtNode`s with dependencies
    - Build dependency edges from file-level graph edges
    - Topological sort, identify parallel groups
    - Synthesize execution plan
    - Port cycle detection (`wouldCreateCycle`)
    - Port independence ratio → confidence calculation

47. **Strategy Tests** — `internal/ai/strategies/strategies_test.go`
    - Port from `__tests__/strategies.test.ts` and `__tests__/advanced-strategies.test.ts` and `__tests__/anti-repetition.test.ts`
    - Table-driven tests per strategy

#### 4a.15 — Strategy Registry & Performance Store

48. **Strategy Registry** — `internal/ai/strategies/registry.go`
    - Port from `registry.ts`
    - `Register(strategy, priority)`, `Unregister(id)`, `Enable(id)`, `Disable(id)`
    - `Select(context) Strategy` — score all enabled, sort by score DESC then priority DESC, fallback to direct
    - `SelectAll(context) []ScoredStrategy` — for observability
    - `GetAll()`, `Get(id)`, `GetByRole(role)`
    - Historical weight integration when `PerformanceStore` is attached
    - `MIN_ACTIVATION_THRESHOLD = 0.1`

49. **Strategy Performance Store** — `internal/ai/strategies/performance_store.go`
    - Port from `performance-store.ts`
    - `GetPerformance(strategyId, complexity) *PerformanceRecord`
    - `GetBestStrategy(complexity, risk) *BestStrategy`
    - `GetHistoricalWeight(strategyId, complexity) float64` — maps success rate [0,1] to weight [0.5,1.5]

#### 4a.16 — Orchestrator

50. **Task Assessor** — `internal/ai/orchestrator/assessor.go`
    - Port from `assessor.ts`
    - `Assess(input, graphContext, blastRadius) TaskContext`
    - Port complexity assessment: <=2 files simple, <=8 moderate, <=20 complex, else critical
    - Port risk assessment: <=3 blast low, <=10 medium, <=25 high, else critical
    - Port ambiguity detection: question marks, ambiguity words (`should`, `maybe`, `not sure`, `consider`, `perhaps`, `might`)
    - Inject prior failures/successes from DecisionQuery when attached

51. **Evaluator** — `internal/ai/orchestrator/evaluator.go`
    - Port from `evaluator.ts`
    - 4 checks: confidence (>=0.5), token efficiency (per-complexity limits), context coverage (result length >10), completeness (non-empty)
    - Token limits: simple=10k, moderate=25k, complex=50k, critical=100k
    - Recommendation: `accept` if all pass + confidence >0.8, `escalate` if critical fail, else `refine`

52. **Multi-Perspective Evaluator** — `internal/ai/orchestrator/multi_evaluator.go`
    - Port from `multi-evaluator.ts`
    - Extends base Evaluator with history-aware checks
    - Prior success boost, prior failure flag, consistency check (confidence delta <0.3)
    - Recalculate recommendation with additional checks

53. **Knowledge Writer** — `internal/ai/orchestrator/knowledge_writer.go`
    - Port from `knowledge-writer.ts`
    - `Record(result, evaluation)` — non-blocking, errors caught and logged
    - Insert decision, outcome, strategy performance in one pass
    - Emit `knowledge:decision:recorded` event
    - **Go change:** Use `crypto/rand` for UUID generation instead of `node:crypto.randomUUID()`

54. **Compactor** — `internal/ai/orchestrator/compactor.go`
    - Port from `compactor.ts`
    - `Run()` — idempotent, safe to call repeatedly
    - Synthesize patterns from strategy performance data (groups with >=5 decisions)
    - Prune old decisions + outcomes older than 30 days (TTL_MS)
    - Prune old performance records
    - Emit `knowledge:compaction:complete` and `knowledge:pattern:discovered` events

55. **Orchestrator** — `internal/ai/orchestrator/orchestrator.go`
    - Port the full pipeline from `orchestrator.ts`
    - **Request-scoped decision query cache** — port `RequestScopedDecisionQuery` as a per-process() cache wrapper. Key: `goal|minSimilarity|limit`
    - Process pipeline (11 steps):
      1. Clear per-request cache
      2. Lazy compaction (run once on first call)
      3. Gather context — merge from all active files
      4. Blast radius — primary file
      5. Related files
      6. Assess task
      7. Select strategy
      8. Get alternatives (observability)
      9. Execute strategy
      10. Evaluate — auto-refine if evaluator recommends `refine` (lookup by role tag, not ID)
      11. Record decision + outcome via KnowledgeWriter
    - `ProcessWithRetry(input, maxRetries)` — escalate hints on `escalate` recommendation
    - Port `gatherContext` — merge context from multiple active files, keep highest relevance per file
    - Port `buildStrategyInput` — map files to `{path, relevance}`, edges to `{source, target, type}`

56. **Orchestrator Tests** — `internal/ai/orchestrator/orchestrator_test.go`
    - Port from `__tests__/orchestrator.test.ts`
    - Port from `__tests__/multi-evaluator.test.ts`
    - Test full pipeline, auto-refine path, escalation path, knowledge recording

#### 4a.17 — Integration Wiring

57. **Engine facade** — `internal/ai/engine.go`
    - Single entry point: `NewEngine(db, projectId, rootDir) *Engine`
    - Initializes all components: EventBus, InMemoryGraph, GraphBuilder, GraphQuery, ASTEnricher, DocumentBuilder, IncrementalUpdater, FileWatcher, KnowledgeDB, all repositories, DecisionQuery, StrategyRegistry (registers all 6 strategies), PerformanceStore, Orchestrator (with KnowledgeWriter, Compactor, DecisionQuery)
    - Public methods: `BuildGraph()`, `Process(goal GoalInput) OrchestratorResult`, `GetContext(file)`, `GetBlastRadius(file)`, `GetRelatedFiles(files)`, `GetStats()`
    - `Start()` — starts file watcher, checks staleness
    - `Stop()` — stops file watcher, closes knowledge DB

58. **Wails bindings** — `internal/app/bindings_ai.go`
    - Expose engine methods as Wails bindings:
      - `AIProcess(goal, activeFiles, projectId) OrchestratorResult`
      - `AIGetContext(file, projectId) ContextResult`
      - `AIGetBlastRadius(file, projectId) BlastRadiusResult`
      - `AIBuildGraph(projectId) error`
      - `AIGetStrategies() []StrategyInfo`

---

## Phase 4b — New Features

### Tasks — Phase 4b

#### 4b.1 — Tiered Pipeline

59. **Complexity Classifier** — `internal/ai/tier.go`
    - Classify incoming requests into 4 tiers based on heuristics:
      - **Skip:** Command matches trivial patterns (`ls`, `pwd`, `git status`, `echo`, `cat`)
      - **Fast:** Goal is short (<50 chars), no ambiguity words, <=2 active files
      - **Standard:** Moderate complexity (3-8 files, no critical signals)
      - **Full:** Complex/critical (>8 files, or ambiguous, or high blast radius, or hints.isCritical)
    - Returns `Tier` enum: `TierSkip`, `TierFast`, `TierStandard`, `TierFull`
    - Configurable thresholds via `config.yaml`

60. **Tiered Engine** — `internal/ai/tiered_engine.go`
    - Wraps the base `Engine` and applies tier-based pipeline:
      - **Skip:** Return immediately with no pipeline, optionally route to Haiku for formatting
      - **Fast:** Direct strategy only, skip graph context, no evaluation. Target: <50ms
      - **Standard:** Context + assess + direct strategy + evaluation. Target: <200ms
      - **Full:** All strategies compete (via registry.SelectAll), full evaluation, auto-refine. Target: <500ms
    - Log tier selection to `model_routing_log` table

61. **Tier Config** — update `~/.phantom-os/config.yaml` schema
    - `ai.default_tier: auto | skip | fast | standard | full`
    - `ai.tier_thresholds.trivial_patterns: [...]`
    - `ai.tier_thresholds.fast_max_files: 2`
    - `ai.tier_thresholds.standard_max_files: 8`

#### 4b.2 — Smart Model Routing

62. **Model Router** — `internal/ai/router.go`
    - Route to appropriate Claude model based on tier + strategy:
      - **Planning/architecture decisions:** Opus (advisor strategy, complex assessment)
      - **Implementation/code generation:** Sonnet (direct, self-refine, tree-of-thought)
      - **Quick formatting/trivial:** Haiku (skip tier, simple formatting)
    - Configurable via `config.yaml`:
      ```yaml
      ai.model_routing:
        planning: opus
        implementation: sonnet
        quick: haiku
      ```
    - Logs routing decisions to `model_routing_log` table for observability

63. **Model Routing Log** — `internal/db/migrations/006_model_routing.up.sql`
    - Table: `model_routing_log(id, project_id, goal, tier, strategy_id, model, duration_ms, created_at)`
    - sqlc queries for insert + query

64. **Strategy Performance Enhancement** — `internal/db/migrations/007_strategy_perf_model.up.sql`
    - Add `model TEXT` column to `strategy_performance` table
    - Update sqlc queries to include model in insert/query

#### 4b.3 — Parallel Strategy Execution

65. **Parallel Executor** — `internal/ai/parallel.go`
    - Use `sourcegraph/conc` for structured concurrency
    - In Full tier: run top-N strategies in parallel (default N=3)
    - Debate strategy: run advocate and critic perspectives as parallel goroutines
    - Graph-of-Thought: execute independent thought nodes in parallel (parallel groups from topological sort)
    - Collect results, select best by confidence
    - Cancel remaining goroutines when best result found (context cancellation)
    - Error handling: if one strategy panics, others continue. Use `conc.WaitGroup` for panic recovery

66. **Parallel Debate** — update `internal/ai/strategies/debate.go`
    - Split debate rounds into goroutines:
      - Goroutine 1: Build advocate position
      - Goroutine 2: Build critic position
      - Sync: Run rounds sequentially (they depend on both positions)
    - Use `conc.WaitGroup` for goroutine management

67. **Parallel Graph-of-Thought** — update `internal/ai/strategies/graph_of_thought.go`
    - After topological sort, execute parallel groups concurrently
    - Each group's nodes run as goroutines via `conc.Pool`
    - Wait for group completion before starting next group

#### 4b.4 — AI Playground UI (Solid.js)

68. **AI Playground Component** — `frontend/src/components/system/AIPlayground.tsx`
    - Solid.js component for strategy debugging and visualization
    - **Input panel:** Goal text input, active files multi-select, project selector, hint toggles (ambiguous, critical, complexity override)
    - **Pipeline visualization:**
      - Tier classification display (Skip/Fast/Standard/Full)
      - Model routing decision display
      - Strategy activation scores as horizontal bar chart (all 6 strategies)
      - Selected strategy highlighted
    - **Execution details:**
      - Task context: complexity, risk, ambiguity, blast radius, file count
      - Graph context: file list with relevance scores
      - Strategy output: raw JSON viewer (collapsible)
      - Evaluation result: checks list with pass/fail badges
      - Recommendation badge (accept/refine/escalate)
    - **History panel:**
      - Recent decisions from knowledge DB
      - Filter by strategy, complexity, risk
      - Success rate per strategy (mini chart)
    - **Timing display:**
      - Pipeline total duration
      - Per-step breakdown (graph context, assess, execute, evaluate)
    - Wire to Wails bindings: `AIProcess`, `AIGetStrategies`
    - Use Kobalte for accessible dialogs/tooltips, Vanilla Extract for styling

69. **Playground signals** — `frontend/src/signals/ai.ts`
    - Solid signals for playground state:
      - `createSignal<PlaygroundInput>` — current input
      - `createSignal<OrchestratorResult | null>` — latest result
      - `createSignal<StrategyInfo[]>` — registered strategies
      - `createSignal<boolean>` — loading state

70. **Playground Wails bindings** — update `frontend/src/wails/bindings.ts`
    - Add typed wrappers for AI engine bindings
    - Event subscription for `ai:process:complete`

---

## Acceptance Criteria

### Phase 4a — Parity

- [ ] All 6 strategies produce identical activation scores for the same `TaskContext` inputs as v1 (golden test with fixtures)
- [ ] In-memory graph: add/remove/query operations match v1 behavior for a reference project
- [ ] All 5 language parsers produce identical `ParseResult` for reference source files
- [ ] Graph builder produces identical node/edge counts for a reference project directory
- [ ] Orchestrator full pipeline: for a set of reference `GoalInput`s, the selected strategy and evaluation recommendation match v1
- [ ] Knowledge DB: decisions, outcomes, patterns, strategy_performance tables match v1 schema
- [ ] Compactor: TTL pruning and pattern synthesis produce equivalent results
- [ ] Decision query: Jaccard similarity returns equivalent results for reference goal pairs
- [ ] Graph persistence: save + load round-trip preserves all node/edge data
- [ ] File watcher: detects file add/change/unlink and triggers incremental graph update
- [ ] AST enricher: extracts functions, classes, components, types, and creates CALLS/RENDERS/USES_HOOK/IMPLEMENTS edges
- [ ] Document builder: ingests `.md` files and creates `documents` edges to referenced code files
- [ ] All operations are goroutine-safe (no data races under `go test -race`)
- [ ] Test coverage >= 80% on all packages under `internal/ai/`
- [ ] No v1 features missing — inventory checklist fully checked off

### Phase 4b — Enhancements

- [ ] Tiered pipeline correctly classifies 20+ reference commands into the right tier
- [ ] Fast tier completes in <50ms (no LLM round-trip)
- [ ] Model routing logs decisions to `model_routing_log` table
- [ ] Parallel strategy execution: Full tier runs top-3 strategies concurrently, selects best
- [ ] Debate strategy: advocate + critic build concurrently (measurable speedup over sequential)
- [ ] Graph-of-Thought: parallel groups execute concurrently
- [ ] AI Playground: renders in Wails app, accepts input, displays full pipeline result
- [ ] AI Playground: shows all 6 strategy scores, selected strategy, evaluation checks
- [ ] No goroutine leaks (verify with runtime profiling)
- [ ] Config-driven: tier thresholds and model routing configurable via `config.yaml`

---

## Estimated Effort

| Phase | Scope | Effort |
|---|---|---|
| **4a.1-4a.4** | Types, event bus, in-memory graph, parsers | 4-5 days |
| **4a.5-4a.8** | Graph builder, query, AST enricher, document builder | 5-7 days |
| **4a.9-4a.11** | Incremental updater, file watcher, persistence | 3-4 days |
| **4a.12-4a.13** | Knowledge DB, repositories, decision query | 3-4 days |
| **4a.14-4a.15** | All 6 strategies, registry, performance store | 3-4 days |
| **4a.16-4a.17** | Orchestrator, integration wiring, bindings | 4-5 days |
| **Phase 4a total** | | **22-29 days (~3-4 weeks)** |
| **4b.1-4b.2** | Tiered pipeline, model routing | 3-4 days |
| **4b.3** | Parallel strategy execution | 2-3 days |
| **4b.4** | AI Playground Solid.js UI | 3-4 days |
| **Phase 4b total** | | **8-11 days (~1.5-2 weeks)** |
| **Phase 4 total** | | **30-40 days (~4.5-6 weeks)** |

---

## Go Project Structure (Phase 4 files)

```
internal/
├── ai/
│   ├── engine.go                          # Engine facade (4a.17)
│   ├── tiered_engine.go                   # Tiered pipeline wrapper (4b.1)
│   ├── tier.go                            # Complexity classifier (4b.1)
│   ├── router.go                          # Model routing (4b.2)
│   ├── parallel.go                        # Parallel executor (4b.3)
│   ├── events/
│   │   ├── types.go                       # Event types (4a.1)
│   │   └── bus.go                         # Event bus (4a.2)
│   ├── graph/
│   │   ├── types.go                       # Graph types (4a.1)
│   │   ├── graph.go                       # In-memory graph (4a.3)
│   │   ├── graph_test.go                  # Graph tests (4a.3)
│   │   ├── builder.go                     # Layer 1 builder + parallel walk/read/parse (4a.5, 4a.5b)
│   │   ├── builder_test.go
│   │   ├── cache.go                       # Content hash cache + mtime validation (4a.5b)
│   │   ├── cache_test.go
│   │   ├── treesitter.go                  # go-tree-sitter integration (4a.5b)
│   │   ├── treesitter_test.go
│   │   ├── shard.go                       # Per-project graph sharding (4a.5b)
│   │   ├── shard_test.go
│   │   ├── reverse_index.go              # Pre-computed blast radius index (4a.5b)
│   │   ├── reverse_index_test.go
│   │   ├── query.go                       # Query API (4a.6)
│   │   ├── query_test.go
│   │   ├── enricher.go                    # AST enricher (4a.7)
│   │   ├── enricher_test.go
│   │   ├── document.go                    # Document builder (4a.8)
│   │   ├── document_test.go
│   │   ├── incremental.go                 # Incremental updater (4a.9)
│   │   ├── incremental_test.go
│   │   ├── watcher.go                     # File watcher (4a.10)
│   │   ├── watcher_test.go
│   │   ├── persistence.go                 # SQLite persistence (4a.11)
│   │   ├── persistence_test.go
│   │   ├── decision_query.go              # Decision similarity (4a.13)
│   │   └── parsers/
│   │       ├── types.go                   # Parser interface (4a.4)
│   │       ├── registry.go                # Parser registry (4a.4)
│   │       ├── javascript.go              # JS/TS parser (4a.4)
│   │       ├── python.go                  # Python parser (4a.4)
│   │       ├── go_parser.go               # Go parser (4a.4)
│   │       ├── rust.go                    # Rust parser (4a.4)
│   │       ├── java.go                    # Java parser (4a.4)
│   │       └── parsers_test.go
│   ├── strategies/
│   │   ├── types.go                       # Strategy types (4a.1)
│   │   ├── prior_penalty.go               # Prior failure penalty (4a.14)
│   │   ├── direct.go                      # Direct strategy (4a.14)
│   │   ├── advisor.go                     # Advisor strategy (4a.14)
│   │   ├── self_refine.go                 # Self-refine strategy (4a.14)
│   │   ├── tree_of_thought.go             # Tree-of-thought (4a.14)
│   │   ├── debate.go                      # Debate strategy (4a.14)
│   │   ├── graph_of_thought.go            # Graph-of-thought (4a.14)
│   │   ├── registry.go                    # Strategy registry (4a.15)
│   │   ├── performance_store.go           # Performance store (4a.15)
│   │   └── strategies_test.go
│   ├── orchestrator/
│   │   ├── types.go                       # Pipeline types (4a.1)
│   │   ├── assessor.go                    # Task assessor (4a.16)
│   │   ├── evaluator.go                   # Base evaluator (4a.16)
│   │   ├── multi_evaluator.go             # Multi-perspective evaluator (4a.16)
│   │   ├── knowledge_writer.go            # Knowledge writer (4a.16)
│   │   ├── compactor.go                   # Compactor (4a.16)
│   │   ├── orchestrator.go                # Full pipeline (4a.16)
│   │   └── orchestrator_test.go
│   └── knowledge/
│       ├── db.go                          # Knowledge DB manager (4a.12)
│       ├── decision_repo.go               # Decision repository (4a.12)
│       ├── pattern_repo.go                # Pattern repository (4a.12)
│       ├── performance_repo.go            # Performance repository (4a.12)
│       └── knowledge_test.go
├── app/
│   └── bindings_ai.go                     # Wails AI bindings (4a.17)
└── db/
    ├── migrations/
    │   ├── 004_graph_tables.up.sql        # Graph schema (4a.11)
    │   ├── 005_knowledge_tables.up.sql    # Knowledge schema (4a.12)
    │   ├── 006_model_routing.up.sql       # Routing log (4b.2)
    │   └── 007_strategy_perf_model.up.sql # Perf enhancement (4b.2)
    └── queries/
        ├── graph.sql                      # Graph sqlc queries (4a.11)
        └── knowledge.sql                  # Knowledge sqlc queries (4a.12)

frontend/
└── src/
    ├── components/system/
    │   └── AIPlayground.tsx               # AI Playground UI (4b.4)
    └── signals/
        └── ai.ts                          # AI signals (4b.4)
```

---

## Key Design Decisions

### TS → Go Translation Patterns

| TypeScript Pattern | Go Equivalent |
|---|---|
| `class Foo implements Bar` | `type Foo struct {}` + `func (f *Foo) Method()` satisfying `Bar` interface |
| `Map<string, T>` | `map[string]T` |
| `Set<string>` | `map[string]struct{}` |
| `Promise<T>` / `async` | Return `(T, error)`, use goroutines for concurrency |
| `Record<string, unknown>` | `map[string]any` |
| `null \| undefined` | Pointer types `*T` or zero values |
| `EventEmitter` pattern | Channel-based or callback-based with `sync.RWMutex` |
| `setTimeout` / debounce | `time.AfterFunc`, `time.Timer` |
| `better-sqlite3` sync | `modernc.org/sqlite` with sqlc-generated code |
| `randomUUID()` | `crypto/rand` + `github.com/google/uuid` |
| `chokidar` file watcher | `fsnotify/fsnotify` |
| `ts.createSourceFile` | `go/parser` for Go files; regex for TS/JS |
| `JSON.stringify` | `encoding/json.Marshal` |
| `import/export` | Package-level functions and types |

### AST Enricher Strategy

The v1 AST enricher uses the TypeScript compiler API (`ts.createSourceFile`) which provides perfect AST parsing for TS/JS files. In Go, we have two options:

1. **Regex + heuristic approach** (chosen for launch) — Parse function/class/component/type declarations using patterns. Covers 90%+ of cases. Fast, no external dependencies.
2. **Tree-sitter** (deferred to v2.x) — Use `go-tree-sitter` with language grammars for multi-language AST parsing. Higher accuracy but adds WASM/native dependency.

For Go source files, we use `go/parser` + `go/ast` directly (native, perfect accuracy).

### Concurrency Model

- **InMemoryGraph:** Protected by `sync.RWMutex` — all reads take read lock, all mutations take write lock. Reads can run concurrently.
- **Event Bus:** Protected by `sync.RWMutex` for listener registration. Emit acquires read lock only (listeners fire under shared lock).
- **Incremental Updater:** Serialized via mutex — concurrent `Flush()` calls queue behind the active flush.
- **File Watcher:** Single goroutine receives fsnotify events, queues to IncrementalUpdater.
- **Orchestrator:** Each `Process()` call is self-contained — no shared mutable state between calls except the graph (protected by its own lock).
- **Parallel Strategies:** Use `sourcegraph/conc` for structured concurrency with panic recovery.

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| `modernc.org/sqlite` is 2-5x slower than CGo | Benchmark graph queries early. Knowledge DB queries are small. Graph persistence is batch I/O. If bottleneck, fall back to `mattn/go-sqlite3` |
| AST enricher accuracy degrades with regex | Accept 90% accuracy for launch. Log unparsed constructs. Add tree-sitter in v2.x |
| Parallel strategy execution adds complexity | Start with sequential (4a parity), add parallelism only in 4b. Use `conc` for panic safety |
| Graph memory pressure for large projects | v1 handles 10k+ file projects fine in Node. Go memory is more efficient. Add lazy loading if needed |
| Knowledge DB per-project files accumulate | Compactor TTL (30 days) keeps size bounded. Add max-DB-size config if needed |
