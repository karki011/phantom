# Phase 9: Extension System + Plugin Architecture

**Author:** Subash Karki
**Date:** 2026-04-18
**Status:** Draft
**Parent Spec:** `2026-04-18-phantomos-v2-design.md` (Section 11: Extension System)
**Dependencies:** Phase 1 (Core), Phase 3 (Stream Parser), Phase 4 (AI Engine), Phase 5 (Safety Rules), Phase 6 (Remaining Features)

---

## Goal

Make PhantomOS extensible without modifying core code. Every major subsystem exposes a well-defined Go interface; third-party (or first-party future) features plug in via explicit registration or out-of-process gRPC plugins. The frontend mirrors this with a Solid.js component registry and theme token extensibility. A Plugin SDK and manifest format let anyone build, package, and distribute PhantomOS plugins.

By the end of Phase 9:
- All core subsystems communicate through interfaces, not concrete types
- Out-of-process plugins run safely via `hashicorp/go-plugin` (gRPC transport)
- Plugins are discovered from `~/.phantom-os/plugins/`, validated, and managed with a full lifecycle (load, start, health check, stop)
- Frontend extensions register Solid.js components and theme overrides
- A Plugin SDK template project exists for building new plugins
- Hot-reload works for JS-only plugins (no app restart needed)
- Config extensibility merges plugin config into `~/.phantom-os/config.yaml`

---

## Prerequisites

Before starting Phase 9, the following must be complete and stable:

1. **Phase 1 — Core:** SQLite, project detector, terminal manager, session collectors all running through interfaces defined in `internal/plugin/interfaces.go`
2. **Phase 3 — Stream Parser:** `StreamHandler` interface finalized and used by the built-in parser; WebSocket hub broadcasting events
3. **Phase 4 — AI Engine:** `Strategy` interface finalized; all 6 built-in strategies registered through the explicit registry (not `init()`)
4. **Phase 5 — Safety Rules:** `RuleChecker` interface finalized; YAML-loaded rules operating through the same interface path that plugins will use
5. **Phase 6 — Remaining Features:** `Collector`, `AchievementChecker` interfaces in use by gamification and session discovery; `PolicyEvaluator` used by session controller
6. **Go module structure:** `internal/plugin/` package exists with `registry.go` and `interfaces.go` stubs from Phase 1

---

## Tasks

### Part A: Go Backend — Interface Contracts (Days 1-3)

#### A.1 Define all extension point interfaces

**File:** `internal/plugin/interfaces.go`

Define or finalize the following interfaces. Each interface must include:
- A stable `ID() string` method for registry lookup
- A `Version() string` method for compatibility checking
- Context-aware methods (`context.Context` first parameter) for lifecycle control

```go
// Strategy — AI engine strategy extension
type Strategy interface {
    ID() string
    Version() string
    Role() string
    Score(ctx TaskContext) StrategyScore
    Execute(ctx context.Context, input StrategyInput) (StrategyOutput, error)
}

// RuleChecker — Safety rules engine extension
type RuleChecker interface {
    ID() string
    Version() string
    Name() string
    Check(ctx context.Context, event StreamEvent, session *Session) (RuleResult, error)
}

// StreamHandler — Stream parser event handler extension
type StreamHandler interface {
    ID() string
    Version() string
    EventTypes() []string
    Handle(ctx context.Context, event StreamEvent) error
}

// Collector — Session/activity discovery extension
type Collector interface {
    ID() string
    Version() string
    Name() string
    Start(ctx context.Context) error
    Stop() error
    HealthCheck(ctx context.Context) error
}

// GitOperation — Git subsystem extension
type GitOperation interface {
    ID() string
    Version() string
    Name() string
    Execute(ctx context.Context, repo GitRepo, args map[string]interface{}) (GitResult, error)
}

// AchievementChecker — Gamification extension
type AchievementChecker interface {
    ID() string
    Version() string
    Name() string
    Evaluate(ctx context.Context, stats HunterStats, activity ActivityLog) ([]Achievement, error)
}

// PolicyEvaluator — Session policy extension
type PolicyEvaluator interface {
    ID() string
    Version() string
    Name() string
    Evaluate(ctx context.Context, event StreamEvent, session *Session) (PolicyDecision, error)
}
```

**Validation:** Each interface must be satisfied by at least one built-in implementation already in the codebase from prior phases.

#### A.2 Define shared types for interface contracts

**File:** `internal/plugin/types.go`

Define the shared types referenced by interfaces: `TaskContext`, `StrategyScore`, `StrategyInput`, `StrategyOutput`, `StreamEvent`, `Session`, `RuleResult`, `GitRepo`, `GitResult`, `HunterStats`, `ActivityLog`, `Achievement`, `PolicyDecision`. These must be serializable to/from protobuf for gRPC transport (Task A.6).

#### A.3 Define the Plugin interface (meta-interface)

**File:** `internal/plugin/plugin.go`

```go
// Plugin is the meta-interface every plugin must implement.
// It describes the plugin and declares which extension points it provides.
type Plugin interface {
    Manifest() Manifest
    Init(ctx context.Context, host HostServices) error
    Start(ctx context.Context) error
    Stop(ctx context.Context) error
    HealthCheck(ctx context.Context) HealthStatus
    Capabilities() []Capability
}

// Capability declares a single extension point implementation.
type Capability struct {
    Interface string // e.g. "Strategy", "RuleChecker"
    ID        string // unique within the plugin
}

// HostServices is the API surface exposed TO plugins by PhantomOS.
type HostServices interface {
    Logger() *slog.Logger
    DB() *sql.DB // read-only for out-of-process plugins
    Config() map[string]interface{}
    EmitEvent(ctx context.Context, event StreamEvent) error
    GetSessions(ctx context.Context) ([]Session, error)
}
```

---

### Part B: Explicit Plugin Registry (Days 3-5)

#### B.1 Implement the in-process plugin registry

**File:** `internal/plugin/registry.go`

The registry is the central coordination point. It replaces any `init()` registration with explicit, ordered registration.

```go
type Registry struct {
    mu          sync.RWMutex
    plugins     map[string]Plugin          // keyed by manifest.Name
    strategies  map[string]Strategy
    rules       map[string]RuleChecker
    handlers    map[string]StreamHandler
    collectors  map[string]Collector
    gitOps      map[string]GitOperation
    achievements map[string]AchievementChecker
    policies    map[string]PolicyEvaluator
    loadOrder   []string                   // explicit registration order
}
```

Key behaviors:
- `Register(plugin Plugin) error` — validates manifest, checks version constraints, registers all capabilities in order
- `Unregister(name string) error` — stops the plugin, removes all its capabilities
- Duplicate ID registration returns an error (never silently overwrites)
- Thread-safe (all methods acquire `sync.RWMutex`)
- Registration order is recorded and reproducible

#### B.2 Migrate built-in subsystems to registry registration

**Files (modify existing):**
- `internal/ai/strategies/*.go` — each strategy implements `plugin.Strategy`; registered in `cmd/phantomos/main.go` via `registry.RegisterStrategy()`
- `internal/safety/engine.go` — built-in rules implement `plugin.RuleChecker`
- `internal/stream/parser.go` — built-in handlers implement `plugin.StreamHandler`
- `internal/collector/*.go` — each collector implements `plugin.Collector`
- `internal/gamification/achievements.go` — built-in checkers implement `plugin.AchievementChecker`
- `internal/session/policy.go` — built-in policies implement `plugin.PolicyEvaluator`

**File:** `cmd/phantomos/main.go` (or `internal/app/bootstrap.go`)

Explicit registration at startup in defined order:

```go
func bootstrapPlugins(reg *plugin.Registry) error {
    // 1. Core collectors (must be first — other plugins may depend on session data)
    reg.Register(collector.NewSessionWatcher())
    reg.Register(collector.NewActivityPoller())

    // 2. Stream handlers
    reg.Register(stream.NewSmartViewHandler())
    reg.Register(stream.NewCostTracker())

    // 3. Safety rules
    reg.Register(safety.NewBuiltinRules())

    // 4. AI strategies
    reg.Register(ai.NewDirectStrategy())
    reg.Register(ai.NewAdvisorStrategy())
    reg.Register(ai.NewSelfRefineStrategy())
    reg.Register(ai.NewTreeOfThoughtStrategy())
    reg.Register(ai.NewDebateStrategy())
    reg.Register(ai.NewGraphOfThoughtStrategy())

    // 5. Gamification
    reg.Register(gamification.NewBuiltinAchievements())

    // 6. Session policies
    reg.Register(session.NewBuiltinPolicies())

    // 7. External plugins (discovered from filesystem)
    return reg.LoadExternalPlugins()
}
```

#### B.3 Write registry unit tests

**File:** `internal/plugin/registry_test.go`

Table-driven tests covering:
- Register/unregister lifecycle
- Duplicate ID rejection
- Thread-safety under concurrent registration
- Registration order preservation
- Capability lookup by interface type
- Error propagation from plugin Init/Start failures

---

### Part C: Out-of-Process Plugin System — hashicorp/go-plugin (Days 5-10)

#### C.1 Define protobuf service definitions

**File:** `internal/plugin/proto/plugin.proto`

Define gRPC service definitions for each extension point interface. Each Go interface maps to a protobuf service:

```protobuf
syntax = "proto3";
package phantomos.plugin.v1;

service StrategyPlugin {
    rpc ID(Empty) returns (IDResponse);
    rpc Version(Empty) returns (VersionResponse);
    rpc Role(Empty) returns (RoleResponse);
    rpc Score(TaskContextProto) returns (StrategyScoreProto);
    rpc Execute(StrategyInputProto) returns (StrategyOutputProto);
}

service RuleCheckerPlugin {
    rpc ID(Empty) returns (IDResponse);
    rpc Version(Empty) returns (VersionResponse);
    rpc Name(Empty) returns (NameResponse);
    rpc Check(CheckRequest) returns (RuleResultProto);
}

service CollectorPlugin {
    rpc ID(Empty) returns (IDResponse);
    rpc Version(Empty) returns (VersionResponse);
    rpc Name(Empty) returns (NameResponse);
    rpc Start(StartRequest) returns (Empty);
    rpc Stop(Empty) returns (Empty);
    rpc HealthCheck(Empty) returns (HealthStatusProto);
}

// ... same pattern for StreamHandler, GitOperation, AchievementChecker, PolicyEvaluator

service HostServices {
    rpc Log(LogRequest) returns (Empty);
    rpc EmitEvent(StreamEventProto) returns (Empty);
    rpc GetSessions(Empty) returns (SessionListProto);
    rpc GetConfig(Empty) returns (ConfigProto);
}
```

#### C.2 Generate Go code from protobuf

**File:** `Makefile` (add target)

```makefile
proto:
	protoc --go_out=. --go-grpc_out=. internal/plugin/proto/plugin.proto
```

**Generated files:** `internal/plugin/proto/*.pb.go`

#### C.3 Implement go-plugin server/client for each interface

**File:** `internal/plugin/grpc_strategy.go`

For each interface, implement:
1. **GRPCServer** — wraps the concrete Go implementation, serves it over gRPC (runs in plugin process)
2. **GRPCClient** — wraps the gRPC client stub, presents it as a Go interface (runs in PhantomOS host process)

```go
// GRPCStrategyClient implements Strategy by calling across gRPC
type GRPCStrategyClient struct {
    client proto.StrategyPluginClient
}

func (c *GRPCStrategyClient) ID() string {
    resp, _ := c.client.ID(context.Background(), &proto.Empty{})
    return resp.Id
}

func (c *GRPCStrategyClient) Execute(ctx context.Context, input StrategyInput) (StrategyOutput, error) {
    resp, err := c.client.Execute(ctx, toProtoInput(input))
    if err != nil {
        return StrategyOutput{}, fmt.Errorf("grpc strategy execute: %w", err)
    }
    return fromProtoOutput(resp), nil
}
```

Repeat for all 7 extension point interfaces:
- **File:** `internal/plugin/grpc_strategy.go`
- **File:** `internal/plugin/grpc_rulechecker.go`
- **File:** `internal/plugin/grpc_streamhandler.go`
- **File:** `internal/plugin/grpc_collector.go`
- **File:** `internal/plugin/grpc_gitoperation.go`
- **File:** `internal/plugin/grpc_achievementchecker.go`
- **File:** `internal/plugin/grpc_policyevaluator.go`

#### C.4 Implement the go-plugin handshake and plugin map

**File:** `internal/plugin/handshake.go`

```go
var Handshake = goplugin.HandshakeConfig{
    ProtocolVersion:  1,
    MagicCookieKey:   "PHANTOMOS_PLUGIN",
    MagicCookieValue: "phantomos-v2",
}

// PluginMap maps interface names to go-plugin implementations
var PluginMap = map[string]goplugin.Plugin{
    "strategy":           &StrategyGRPCPlugin{},
    "rule_checker":       &RuleCheckerGRPCPlugin{},
    "stream_handler":     &StreamHandlerGRPCPlugin{},
    "collector":          &CollectorGRPCPlugin{},
    "git_operation":      &GitOperationGRPCPlugin{},
    "achievement_checker": &AchievementCheckerGRPCPlugin{},
    "policy_evaluator":   &PolicyEvaluatorGRPCPlugin{},
}
```

#### C.5 Implement HostServices gRPC server

**File:** `internal/plugin/grpc_host.go`

The host services server runs in PhantomOS and is called by plugins to access host capabilities:

- `Log()` — proxied to PhantomOS structured logger with plugin name prefix
- `EmitEvent()` — injects events into the WebSocket hub (validated before broadcast)
- `GetSessions()` — returns current session list (read-only snapshot)
- `GetConfig()` — returns plugin-scoped config from `~/.phantom-os/config.yaml`

Security constraints:
- No direct DB write access for out-of-process plugins
- Event emission rate-limited (max 100 events/sec per plugin)
- Config access scoped to `plugins.<plugin-name>` namespace only

#### C.6 Write integration tests for gRPC plugin lifecycle

**File:** `internal/plugin/grpc_test.go`

Tests:
- Plugin process spawns, handshake completes, methods callable
- Plugin process crash detected, health check fails, automatic cleanup
- Host services callable from plugin process
- Protobuf serialization roundtrip for all shared types
- Graceful shutdown with context cancellation

---

### Part D: Plugin Discovery and Lifecycle (Days 10-14)

#### D.1 Define plugin manifest format

**File:** `internal/plugin/manifest.go`

Plugin manifest is a `plugin.yaml` file at the root of each plugin directory:

```yaml
name: phantom-deploy-tracker
version: 1.2.0
author: Subash Karki
description: Track deployment events in Smart View
min_phantomos_version: 2.0.0
max_phantomos_version: 3.0.0

capabilities:
  - interface: StreamHandler
    id: deploy-event-handler
  - interface: RuleChecker
    id: deploy-safety-check

# Plugin binary (Go out-of-process) or JS entry (frontend-only)
backend:
  binary: phantom-deploy-tracker  # compiled Go binary name
frontend:
  entry: ui/index.js              # Solid.js component bundle
  components:
    - event_type: "custom:deploy"
      component: DeployStatusCard

config_schema:
  deploy_webhook_url:
    type: string
    required: true
    description: Webhook URL for deploy notifications
  auto_track:
    type: boolean
    default: true
    description: Automatically track all deploys

health_check:
  interval: 30s
  timeout: 5s
  retries: 3
```

Go struct for manifest parsing:

```go
type Manifest struct {
    Name              string            `yaml:"name"`
    Version           string            `yaml:"version"`
    Author            string            `yaml:"author"`
    Description       string            `yaml:"description"`
    MinPhantomVersion string            `yaml:"min_phantomos_version"`
    MaxPhantomVersion string            `yaml:"max_phantomos_version"`
    Capabilities      []CapabilityDecl  `yaml:"capabilities"`
    Backend           BackendConfig     `yaml:"backend"`
    Frontend          FrontendConfig    `yaml:"frontend"`
    ConfigSchema      map[string]ConfigField `yaml:"config_schema"`
    HealthCheck       HealthCheckConfig `yaml:"health_check"`
}
```

#### D.2 Implement plugin discovery

**File:** `internal/plugin/discovery.go`

Scans `~/.phantom-os/plugins/` directory structure:

```
~/.phantom-os/plugins/
├── phantom-deploy-tracker/
│   ├── plugin.yaml
│   ├── phantom-deploy-tracker    # compiled Go binary
│   └── ui/
│       └── index.js              # Solid.js component bundle
├── phantom-custom-strategy/
│   ├── plugin.yaml
│   └── phantom-custom-strategy   # Go binary only (no frontend)
└── phantom-theme-cyberpunk/
    ├── plugin.yaml
    └── ui/
        ├── index.js              # theme override components
        └── theme.css.ts          # Vanilla Extract tokens
```

Discovery logic:
1. `ReadDir("~/.phantom-os/plugins/")`
2. For each subdirectory, look for `plugin.yaml`
3. Parse and validate manifest (version constraints, required fields, capability names)
4. Check `min_phantomos_version` / `max_phantomos_version` against running version
5. Return `[]DiscoveredPlugin` sorted by name for deterministic load order

#### D.3 Implement plugin lifecycle manager

**File:** `internal/plugin/lifecycle.go`

Manages the full lifecycle of each plugin:

```go
type LifecycleManager struct {
    registry   *Registry
    discovered []DiscoveredPlugin
    running    map[string]*RunningPlugin
    mu         sync.Mutex
    logger     *slog.Logger
}

type RunningPlugin struct {
    Manifest    Manifest
    Client      *goplugin.Client   // nil for in-process plugins
    Process     *os.Process        // nil for in-process plugins
    Health      HealthStatus
    StartedAt   time.Time
    LastHealthAt time.Time
}
```

Lifecycle stages:

1. **Load:** Parse manifest, validate, check version compatibility
2. **Start:** For out-of-process plugins, spawn binary via `goplugin.NewClient()`. For in-process, call `Plugin.Init()` then `Plugin.Start()`
3. **Health Check:** Periodic goroutine per plugin (configurable interval from manifest, default 30s). Calls `Plugin.HealthCheck()` or gRPC health endpoint
4. **Stop:** Graceful shutdown with timeout. Calls `Plugin.Stop()`, then `Client.Kill()` for out-of-process. Context cancellation propagates
5. **Crash Recovery:** If health check fails `retries` times consecutively, stop the plugin and log. Do NOT auto-restart (avoid crash loops). Emit a `plugin:crashed` Wails event to frontend

#### D.4 Implement plugin load ordering

**File:** `internal/plugin/ordering.go`

Plugins load after all built-in subsystems are registered. External plugin load order:
1. Plugins with no dependencies load first (alphabetical)
2. If manifest declares `depends_on: [other-plugin]`, topological sort determines order
3. Circular dependencies are detected and rejected at load time

#### D.5 Emit plugin lifecycle events to frontend

**File:** `internal/plugin/events.go`

Wails events emitted during plugin lifecycle:
- `plugin:discovered` — manifest parsed successfully
- `plugin:loading` — starting load process
- `plugin:started` — plugin running and healthy
- `plugin:health:ok` / `plugin:health:degraded` / `plugin:health:failed`
- `plugin:stopped` — clean shutdown
- `plugin:crashed` — unexpected termination
- `plugin:error` — load/start/health error with details

#### D.6 Write lifecycle tests

**File:** `internal/plugin/lifecycle_test.go`

- Full lifecycle: discover -> load -> start -> health check -> stop
- Plugin with invalid manifest rejected
- Version incompatibility detected and reported
- Crash recovery: simulated process exit triggers cleanup
- Dependency ordering: A depends on B, B loads first
- Circular dependency detected

---

### Part E: Solid.js Frontend Component Registry (Days 14-18)

#### E.1 Implement the frontend component registry

**File:** `frontend/src/plugins/registry.ts`

```typescript
import { Component, lazy } from 'solid-js';

interface PluginComponentEntry {
  pluginName: string;
  eventType: string;
  component: Component<EventProps>;
}

interface PluginPanelEntry {
  pluginName: string;
  panelId: string;
  label: string;
  icon: string;
  component: Component;
}

class ComponentRegistry {
  private eventRenderers = new Map<string, PluginComponentEntry>();
  private panels = new Map<string, PluginPanelEntry>();
  private statusBarItems: PluginComponentEntry[] = [];
  private sidebarItems: PluginComponentEntry[] = [];

  registerEventRenderer(entry: PluginComponentEntry): void { ... }
  registerPanel(entry: PluginPanelEntry): void { ... }
  registerStatusBarItem(entry: PluginComponentEntry): void { ... }
  registerSidebarItem(entry: PluginComponentEntry): void { ... }

  getRendererForEvent(eventType: string): Component<EventProps> | undefined { ... }
  getPanels(): PluginPanelEntry[] { ... }
  getStatusBarItems(): PluginComponentEntry[] { ... }
  getSidebarItems(): PluginComponentEntry[] { ... }

  unregister(pluginName: string): void { ... }
}

export const componentRegistry = new ComponentRegistry();
```

#### E.2 Register built-in Smart View renderers through the registry

**Files (modify existing):**
- `frontend/src/components/smart-view/SessionStream.tsx` — use `componentRegistry.getRendererForEvent(event.type)` instead of hardcoded switch/case
- `frontend/src/components/smart-view/ToolCallCard.tsx` — registered as `tool_call` renderer
- `frontend/src/components/smart-view/DiffViewer.tsx` — registered as `file_edit` renderer
- `frontend/src/components/smart-view/ThinkingBlock.tsx` — registered as `thinking` renderer
- `frontend/src/components/smart-view/TestResults.tsx` — registered as `test_result` renderer
- `frontend/src/components/smart-view/CostTracker.tsx` — registered as `cost_update` renderer

**File:** `frontend/src/plugins/builtin.ts`

```typescript
import { componentRegistry } from './registry';
import ToolCallCard from '../components/smart-view/ToolCallCard';
import DiffViewer from '../components/smart-view/DiffViewer';
// ...

export function registerBuiltinComponents() {
  componentRegistry.registerEventRenderer({
    pluginName: '__builtin__',
    eventType: 'tool_call',
    component: ToolCallCard,
  });
  componentRegistry.registerEventRenderer({
    pluginName: '__builtin__',
    eventType: 'file_edit',
    component: DiffViewer,
  });
  // ... all built-in renderers
}
```

#### E.3 Implement plugin JS loader

**File:** `frontend/src/plugins/loader.ts`

Loads frontend plugin bundles from discovered plugin directories:

```typescript
interface PluginFrontendManifest {
  pluginName: string;
  entry: string;       // path to JS bundle
  components: Array<{
    event_type: string;
    component: string; // exported component name
  }>;
}

async function loadPluginFrontend(manifest: PluginFrontendManifest): Promise<void> {
  // Dynamic import of the plugin's JS bundle
  // Plugin JS is served from ~/.phantom-os/plugins/<name>/ui/
  const pluginModule = await import(/* @vite-ignore */ manifest.entry);

  for (const comp of manifest.components) {
    const Component = pluginModule[comp.component];
    if (Component) {
      componentRegistry.registerEventRenderer({
        pluginName: manifest.pluginName,
        eventType: comp.event_type,
        component: Component,
      });
    }
  }
}
```

#### E.4 Implement hot-reload for JS-only plugins

**File:** `frontend/src/plugins/hot-reload.ts`

For plugins that have only a `frontend` section (no backend binary), support hot-reload:

1. Go backend watches `~/.phantom-os/plugins/*/ui/` via `fsnotify`
2. On file change, emits Wails event `plugin:frontend:changed` with plugin name
3. Frontend listener receives event, calls `componentRegistry.unregister(pluginName)`, then re-runs `loadPluginFrontend()` with the updated bundle
4. Solid.js reactivity ensures the new component renders immediately in any active session stream

**Debounce:** 500ms after last file change (same pattern as safety rules hot-reload from Phase 5).

#### E.5 Build the plugin management UI

**File:** `frontend/src/components/system/PluginManager.tsx`

Solid.js component showing:
- List of discovered plugins (name, version, author, status)
- Health status indicator per plugin (green/yellow/red)
- Enable/disable toggle per plugin
- Plugin config editor (renders form from `config_schema` in manifest)
- Plugin log viewer (last N log lines from the plugin's logger)
- "Reload" button for JS-only plugins (triggers hot-reload)

Accessible from: Settings pane or Command Palette (`Cmd+K` > "Plugins")

#### E.6 Write frontend registry tests

**File:** `frontend/src/plugins/registry.test.ts`

Using `vitest` + `@solidjs/testing-library`:
- Register and retrieve event renderer
- Register panel, verify listing
- Unregister by plugin name removes all entries
- Duplicate event type registration replaces previous
- Unknown event type returns undefined

---

### Part F: Theme Extensibility (Days 18-20)

#### F.1 Define the theme extension contract

**File:** `frontend/src/styles/theme-contract.css.ts`

Using Vanilla Extract, define the public theme contract that plugins can override:

```typescript
import { createThemeContract } from '@vanilla-extract/css';

export const themeContract = createThemeContract({
  color: {
    primary: null,
    secondary: null,
    accent: null,
    background: { surface: null, elevated: null, overlay: null },
    text: { primary: null, secondary: null, muted: null },
    border: { default: null, subtle: null },
    status: { success: null, warning: null, error: null, info: null },
    // Solo Leveling specific
    slRank: { E: null, D: null, C: null, B: null, A: null, S: null },
    slGlow: { primary: null, secondary: null },
  },
  space: { xs: null, sm: null, md: null, lg: null, xl: null },
  radius: { sm: null, md: null, lg: null, full: null },
  font: {
    family: { body: null, code: null, display: null },
    size: { xs: null, sm: null, md: null, lg: null, xl: null },
  },
  shadow: { sm: null, md: null, lg: null, glow: null },
  animation: { duration: { fast: null, normal: null, slow: null } },
});
```

#### F.2 Implement theme loading from plugins

**File:** `frontend/src/plugins/theme-loader.ts`

Plugins can provide a `theme.css.ts` file that implements the `themeContract`:

```typescript
async function loadPluginTheme(pluginName: string, themePath: string): Promise<void> {
  const themeModule = await import(/* @vite-ignore */ themePath);
  if (themeModule.theme) {
    // Apply as a CSS class on <body> — Vanilla Extract assignVars
    applyThemeOverrides(pluginName, themeModule.theme);
  }
}
```

Theme precedence:
1. Built-in theme (Shadow Monarch / Solo Leveling) — default
2. User theme selection in config — overrides built-in
3. Plugin theme — only active if user explicitly selects it in settings

#### F.3 Implement theme preview and switching

**File:** `frontend/src/components/system/ThemeSelector.tsx`

- Dropdown of available themes (built-in + plugin-provided)
- Live preview on hover (temporarily applies theme class)
- Persisted to `~/.phantom-os/config.yaml` under `ui.theme`

---

### Part G: Plugin SDK (Days 20-24)

#### G.1 Create the Plugin SDK Go module

**Directory:** `sdk/phantomos-plugin-sdk/`

A standalone Go module that plugin authors import:

```
sdk/phantomos-plugin-sdk/
├── go.mod                    # module github.com/subash-karki/phantomos-plugin-sdk
├── plugin.go                 # Plugin interface, Manifest, HostServices
├── types.go                  # All shared types (StreamEvent, Session, etc.)
├── serve.go                  # Helper to start a plugin process
├── interfaces.go             # All extension point interfaces
├── testing.go                # Test harness for plugin authors
└── examples/
    └── hello-strategy/
        ├── main.go
        ├── plugin.yaml
        └── README.md
```

**File:** `sdk/phantomos-plugin-sdk/serve.go`

```go
// Serve starts the plugin process with go-plugin infrastructure.
// Plugin authors call this from their main().
func Serve(plugin Plugin) {
    goplugin.Serve(&goplugin.ServeConfig{
        HandshakeConfig: Handshake,
        Plugins:         buildPluginMap(plugin),
        GRPCServer:      goplugin.DefaultGRPCServer,
    })
}
```

#### G.2 Create the Plugin SDK TypeScript package

**Directory:** `sdk/phantomos-plugin-sdk-js/`

For frontend-only plugins:

```
sdk/phantomos-plugin-sdk-js/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Re-exports
│   ├── types.ts              # EventProps, Session, StreamEvent (mirrored from Go)
│   ├── register.ts           # registerComponent(), registerPanel(), registerTheme()
│   └── host.ts               # Access to host services (config, events)
└── examples/
    └── hello-card/
        ├── package.json
        ├── src/
        │   ├── index.ts
        │   └── DeployCard.tsx
        ├── plugin.yaml
        └── vite.config.ts    # builds to a single JS bundle
```

#### G.3 Create the plugin template project

**Directory:** `sdk/plugin-template/`

Cookiecutter-style template (or Go `text/template`) with:

```
plugin-template/
├── {{plugin_name}}/
│   ├── plugin.yaml.tmpl
│   ├── main.go.tmpl          # Go backend (optional)
│   ├── go.mod.tmpl
│   ├── ui/                   # Frontend (optional)
│   │   ├── package.json.tmpl
│   │   ├── src/
│   │   │   └── index.tsx.tmpl
│   │   └── vite.config.ts.tmpl
│   ├── Makefile.tmpl
│   └── README.md.tmpl
└── generate.go               # CLI tool: `phantomos plugin new <name>`
```

#### G.4 Add `phantomos plugin` CLI subcommands

**File:** `cmd/phantomos/plugin_cmd.go`

```
phantomos plugin new <name>     # scaffold from template
phantomos plugin build           # compile Go binary + bundle JS
phantomos plugin install <path>  # copy to ~/.phantom-os/plugins/
phantomos plugin list            # show installed plugins + status
phantomos plugin validate        # check plugin.yaml + binary health
phantomos plugin uninstall <name> # remove from plugins directory
```

#### G.5 Write SDK documentation

**File:** `sdk/phantomos-plugin-sdk/README.md`

- Getting started guide
- Available interfaces and when to use each
- Manifest reference (all fields documented)
- Host services API reference
- Example: custom Strategy plugin
- Example: custom StreamHandler + Solid.js card
- Example: theme-only plugin
- Build and install instructions

#### G.6 Write SDK integration tests

**File:** `sdk/phantomos-plugin-sdk/serve_test.go`

- Build example plugin binary
- Start it via go-plugin
- Call all interface methods
- Verify host services work
- Clean shutdown

---

### Part H: Config Extensibility (Days 24-26)

#### H.1 Implement plugin config namespace in config.yaml

**File:** `internal/plugin/config.go`

Plugins declare config schema in their manifest. User-provided values live in `~/.phantom-os/config.yaml`:

```yaml
# Main PhantomOS config
features:
  smart_view: true
  safety_engine: true

# Plugin-specific config (namespaced)
plugins:
  phantom-deploy-tracker:
    deploy_webhook_url: "https://hooks.slack.com/..."
    auto_track: true
  phantom-custom-strategy:
    confidence_threshold: 0.9
```

Config loading:
1. Parse `config.yaml` with `koanf`
2. For each loaded plugin, extract `plugins.<name>` section
3. Validate against plugin's `config_schema` from manifest
4. Pass validated config to plugin via `HostServices.Config()`
5. Watch for config file changes (`fsnotify`) and push updates to running plugins

#### H.2 Implement config validation against plugin schema

**File:** `internal/plugin/config_validator.go`

Validates user-provided config against the `config_schema` declared in the plugin manifest:
- Required fields present
- Type checking (string, number, boolean, array, object)
- Default values applied for missing optional fields
- Unknown keys warned (not rejected — forward compatibility)

#### H.3 Implement config hot-reload for plugins

**File:** `internal/plugin/config_watcher.go`

- Watch `~/.phantom-os/config.yaml` via `fsnotify`
- On change, re-parse, re-validate per plugin
- Push updated config to each running plugin via `HostServices` (for in-process) or gRPC call (for out-of-process)
- Emit `plugin:config:updated` Wails event

---

### Part I: Integration and Polish (Days 26-30)

#### I.1 Wire plugin system into app startup

**File:** `cmd/phantomos/main.go`

Startup sequence:
1. Initialize SQLite, core services
2. Create plugin registry
3. Register all built-in subsystems
4. Discover external plugins from `~/.phantom-os/plugins/`
5. Load and start external plugins (respecting dependency order)
6. Start health check goroutines
7. Emit `plugin:system:ready` Wails event
8. Start Wails app

Shutdown sequence (reverse):
1. Stop all external plugins (graceful, 10s timeout)
2. Stop built-in subsystems
3. Kill any lingering plugin processes
4. Close registry

#### I.2 Implement plugin process isolation safety

**File:** `internal/plugin/sandbox.go`

Out-of-process plugin safety:
- Each plugin binary runs in its own process group
- Resource limits: stderr/stdout captured and rate-limited (prevent log flooding)
- Timeout on all gRPC calls (default 5s, configurable per method)
- If a plugin panics or hangs, the gRPC client detects timeout and triggers cleanup
- Plugin cannot access PhantomOS process memory (process boundary is the sandbox)
- File system access is not restricted in v2.0 (plugins run as the same OS user) — document this limitation

#### I.3 Add plugin metrics to system dashboard

**File:** `frontend/src/components/system/SystemMetrics.tsx` (modify existing)

Add plugin section:
- Number of loaded plugins
- Per-plugin health status
- Per-plugin memory usage (from gRPC health response)
- Per-plugin event emission rate

#### I.4 End-to-end integration test

**File:** `internal/plugin/e2e_test.go`

Full integration test:
1. Build a test plugin binary (example strategy)
2. Place it in a temp `plugins/` directory with valid manifest
3. Start PhantomOS plugin system
4. Verify plugin discovered, loaded, started
5. Invoke the plugin's strategy through the AI engine
6. Verify health check passes
7. Modify config, verify hot-reload
8. Shutdown, verify clean process termination

#### I.5 Document extension points for contributors

**File:** `docs/EXTENDING.md`

Developer guide covering:
- Architecture overview (interface -> registry -> go-plugin -> gRPC)
- How to add a new extension point interface
- How to convert an existing in-process feature to a plugin
- Plugin manifest reference
- Frontend component registry API
- Theme extension guide
- Troubleshooting (common errors, debugging tips)

---

## Acceptance Criteria

### Backend
- [ ] All 7 extension point interfaces defined in `internal/plugin/interfaces.go` with `ID()`, `Version()`, and context-aware methods
- [ ] Every built-in subsystem (strategies, rules, handlers, collectors, achievements, policies) registers through the explicit `Registry` — no `init()` registration anywhere
- [ ] `hashicorp/go-plugin` integration works: a test plugin binary spawns, completes gRPC handshake, serves methods, and shuts down cleanly
- [ ] Plugin discovery scans `~/.phantom-os/plugins/`, parses `plugin.yaml`, validates version constraints
- [ ] Plugin lifecycle manager handles load -> start -> health check -> stop -> crash detection
- [ ] Host services (logger, config, event emission, session list) accessible to plugins via gRPC
- [ ] Config extensibility: plugin config namespaced under `plugins.<name>` in `config.yaml`, validated against schema, hot-reloadable

### Frontend
- [ ] `ComponentRegistry` replaces hardcoded Smart View switch/case — all event renderers registered through the registry
- [ ] Plugin JS bundles load dynamically from `~/.phantom-os/plugins/<name>/ui/`
- [ ] Hot-reload works for JS-only plugins: file change -> unregister -> re-import -> new component renders
- [ ] Theme contract defined in Vanilla Extract; plugin themes load and apply via CSS class swap
- [ ] Plugin Manager UI shows all plugins with health, config editor, and enable/disable

### SDK
- [ ] Go SDK module (`phantomos-plugin-sdk`) published with all interfaces, types, and `Serve()` helper
- [ ] TypeScript SDK package with types, registration helpers, and host service access
- [ ] Plugin template project generates a valid, buildable plugin scaffold
- [ ] `phantomos plugin` CLI subcommands work: new, build, install, list, validate, uninstall
- [ ] Example plugin (custom strategy + custom Smart View card) builds, installs, and runs end-to-end

### Testing
- [ ] Registry unit tests: register, unregister, duplicate rejection, thread safety, ordering
- [ ] gRPC integration tests: handshake, method calls, host services, shutdown
- [ ] Lifecycle tests: full lifecycle, crash recovery, dependency ordering, circular detection
- [ ] Frontend registry tests: register, retrieve, unregister, replace
- [ ] End-to-end test: build plugin -> discover -> load -> invoke -> health check -> config reload -> shutdown
- [ ] Minimum 80% test coverage on `internal/plugin/` package

### Safety
- [ ] Out-of-process plugins cannot crash the host (verified by killing plugin mid-call)
- [ ] gRPC call timeouts prevent plugin hangs from blocking the host
- [ ] Event emission rate-limited (max 100/sec per plugin)
- [ ] Invalid manifests rejected with clear error messages
- [ ] Version incompatibility detected and reported before load attempt

---

## Estimated Effort

| Part | Description | Days | Risk |
|------|-------------|------|------|
| A | Interface contracts | 3 | Low — interfaces mostly exist from prior phases |
| B | Explicit plugin registry | 2 | Low — replacing init() with explicit calls |
| C | go-plugin gRPC integration | 5 | Medium — protobuf + go-plugin learning curve |
| D | Plugin discovery and lifecycle | 4 | Medium — process management edge cases |
| E | Solid.js component registry | 4 | Low — well-understood pattern |
| F | Theme extensibility | 2 | Low — Vanilla Extract contract pattern |
| G | Plugin SDK | 4 | Medium — SDK design affects all future plugins |
| H | Config extensibility | 3 | Low — koanf already used for config |
| I | Integration and polish | 3 | Medium — e2e wiring and testing |
| **Total** | | **30 days (~6 weeks)** | **Medium overall** |

**Critical path:** A -> B -> C -> D -> I (backend). E and F can run in parallel with C/D. G can start after C is done.

**Risk mitigation:** Start with Part A+B (pure Go interfaces, no external dependencies). The gRPC/go-plugin work (Part C) is the highest-risk area — prototype with a single interface (Strategy) before implementing all 7.

---

## Open Questions

1. **Plugin binary distribution:** Should plugins be distributed as source (built locally) or pre-compiled binaries? Pre-compiled is simpler for users but requires building for each OS/arch. Source requires Go toolchain.
2. **Plugin versioning and updates:** How are plugin updates discovered and applied? Manual download for v2.0; consider a plugin registry/marketplace for v2.x.
3. **Plugin permissions model:** v2.0 has no sandboxing beyond process isolation. Should plugins declare required permissions (file system paths, network access) in their manifest for future enforcement?
4. **Frontend plugin bundling:** Should plugin JS bundles be ESM or IIFE? ESM enables tree-shaking but requires import map support in Wails WebKit.
5. **gRPC vs JSON-RPC:** `hashicorp/go-plugin` supports both. gRPC is more performant and type-safe. JSON-RPC is simpler for non-Go plugins. Decision: gRPC for v2.0, consider JSON-RPC adapter for v2.x to support Python/Node plugins.

---

**Author:** Subash Karki
