# AI Graph — Dependency-Aware Code Context

The graph package gives Phantom's AI engine awareness of your codebase structure. Instead of blindly stuffing 2000 characters of recent files into prompts, it builds an in-memory dependency graph of your source code and uses it to select *relevant* context.

## How It Works

```
┌──────────────────────────────────────────────────────────┐
│                    App Startup                           │
│                                                          │
│  1. Load projects from DB                                │
│  2. For each project, spawn a background Indexer         │
│     └─ Walks project directory (skips node_modules etc)  │
│     └─ Parses each .go/.ts/.tsx/.js/.jsx file            │
│     └─ Extracts: symbols (funcs, types, classes)         │
│                   imports (dependency edges)              │
│     └─ Builds in-memory Graph with forward + reverse     │
│        edges (A imports B → B.ImportedBy includes A)     │
│  3. Starts fsnotify watcher for incremental updates      │
│     └─ File changed? Re-parse just that file (200ms      │
│        debounce to batch rapid saves)                    │
│  4. Wires Graph into ContextProvider via adapter         │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                 User Sends a Message                     │
│                                                          │
│  "fix the handleLogin function in auth.go"               │
│                         │                                │
│                         ▼                                │
│  ContextProvider.ForMessage()                            │
│    ├─ Finds auth.go in recent files (existing behavior)  │
│    ├─ Queries Graph.Neighbors("auth.go", depth=1)        │
│    │   Returns: middleware.go, session.go, routes.go     │
│    │   (files that import or are imported by auth.go)    │
│    ├─ Includes neighbor symbols in context:              │
│    │   "middleware.go (go) → AuthMiddleware, ValidateJWT"│
│    │   "session.go (go) → CreateSession, GetSession"    │
│    └─ Assembles enriched prompt (up to 8000 chars)       │
│                         │                                │
│                         ▼                                │
│  AI model receives prompt with dependency-aware context  │
│  → Knows auth.go's callers and callees                   │
│  → Can suggest changes that don't break dependents       │
└──────────────────────────────────────────────────────────┘
```

## Architecture

```
graph/
├── context.go          # ContextProvider — builds prompt context from DB + graph
├── context_test.go     # Tests for context building
└── filegraph/
    ├── graph.go        # Thread-safe in-memory dependency graph (nodes + edges)
    ├── graph_test.go   # Graph operation tests
    ├── parser.go       # File parsers (Go AST + TypeScript/JS regex)
    ├── parser_test.go  # Parser tests
    └── indexer.go      # Background walker + fsnotify watcher
```

## Key Design Decisions

**No CGo / tree-sitter dependency.** Go files use the stdlib `go/parser` for full AST extraction. TypeScript/JavaScript use regex patterns — covers 90% of cases without a C dependency that complicates cross-platform builds. Tree-sitter can be added later if needed.

**Background-only indexing.** The Indexer runs entirely in goroutines. Initial walk + parse happens after the UI is live. File watching uses fsnotify with a 200ms debounce to batch rapid saves. The UI is never blocked.

**In-memory graph, not a graph database.** For codebases under 100K lines, an in-memory `map[string]*FileNode` with mutex protection is fast enough (~10-50MB). No external process, no network calls, sub-millisecond lookups.

**Incremental updates.** When a file changes, only that file is re-parsed and its edges are updated. No full reindex needed.

## What Gets Parsed

| Language | Extensions | Parser | Symbols | Import Edges |
|----------|-----------|--------|---------|--------------|
| Go | `.go` | `go/parser` AST | func, method, type, interface, var, const | `import "..."` |
| TypeScript | `.ts` `.tsx` | Regex | function, class, interface, type, const, component | `import from` + `@/` aliases |
| JavaScript | `.js` `.jsx` | Regex | function, class, const | `import from` + `require()` |
| Python | `.py` | Regex | class, func, method, var, const | `import` + `from X import` |
| Rust | `.rs` | Regex | fn, struct, enum, trait, type, const, mod, impl | `use` + `extern crate` |
| Java | `.java` | Regex | class, interface, enum, record, method, const | `import` |
| C# | `.cs` | Regex | class, interface, struct, enum, record, method, namespace | `using` |
| C | `.c` `.h` | Regex | func, typedef, struct, enum, define | `#include` |
| C++ | `.cpp` `.hpp` `.cc` | Regex | class, struct, enum, namespace, func, define | `#include` |
| Ruby | `.rb` | Regex | class, module, method, attr, const | `require` + `require_relative` |
| PHP | `.php` | Regex | class, interface, trait, enum, func, const, namespace | `use` + `require/include` |
| Swift | `.swift` | Regex | class, struct, enum, protocol, func, let, var, typealias | `import` |
| Kotlin | `.kt` `.kts` | Regex | class, interface, enum, object, func, val, var, typealias | `import` |
| Scala | `.scala` | Regex | class, trait, object, enum, def, val, var, type | `import` |
| Dart | `.dart` | Regex | class, mixin, enum, extension, func, const, typedef | `import` + `export` |
| Lua | `.lua` | Regex | function, method, table | `require` |
| Zig | `.zig` | Regex | fn, struct, enum, union, const, var | `@import` |
| Elixir | `.ex` `.exs` | Regex | defmodule, def, defp, defmacro, defstruct | `import/alias/use/require` |

## Performance

- Initial index of this monorepo (~500 files): < 1 second
- Incremental update on file save: < 50ms
- Neighbor lookup (depth 2): < 1ms
- Memory footprint: ~5-20MB depending on codebase size

## Author

Subash Karki
