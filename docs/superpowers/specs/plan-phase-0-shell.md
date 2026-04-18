# Phase 0: Wails v2 + Solid.js + TypeScript Shell

**Author:** Subash Karki
**Date:** 2026-04-18
**Status:** Draft
**Parent spec:** `2026-04-18-phantomos-v2-design.md`

---

## 1. Goal

Stand up the foundational desktop shell for PhantomOS v2 -- a Wails v2 Go binary with a Solid.js + TypeScript frontend rendering an empty themed window. This phase proves the full toolchain works end-to-end: Go backend builds, Solid.js frontend builds inside Wails, WebSocket streaming is functional, Wails Events bridge Go state to Solid signals, and the Solo Leveling dark theme renders correctly via Vanilla Extract. Everything after Phase 0 builds on this skeleton.

---

## 2. Prerequisites

| Prerequisite | Version | Install |
|---|---|---|
| Go | 1.22+ | `brew install go` |
| Node.js | 20+ LTS | `brew install node` (or `fnm`) |
| pnpm | 9+ | `npm i -g pnpm` |
| Wails CLI | v2.9+ | `go install github.com/wailsapp/wails/v2/cmd/wails@latest` |
| Xcode Command Line Tools | latest | `xcode-select --install` (macOS WebKit rendering) |
| Git | 2.40+ | `brew install git` |

Verify with:

```bash
go version          # 1.22+
wails doctor        # all checks pass
node --version      # 20+
pnpm --version      # 9+
```

---

## 3. Tasks

### 3.1 Initialize Go Module + Wails Project

**Goal:** Scaffold the Wails v2 project with Go module.

1. Create repo root:
   ```
   phantom-os-v2/
   ```

2. Initialize Go module:
   ```bash
   go mod init github.com/subashkarki/phantom-os-v2
   ```
   - **File:** `phantom-os-v2/go.mod`

3. Initialize Wails project (or scaffold manually to control structure):
   ```bash
   wails init -n phantomos -t solid-ts
   ```
   If the Solid template doesn't exist in Wails v2, scaffold manually (see Task 3.2).

4. Configure `wails.json` at project root:
   - **File:** `phantom-os-v2/wails.json`
   ```json
   {
     "$schema": "https://wails.io/schemas/config.v2.json",
     "name": "PhantomOS",
     "outputfilename": "phantomos",
     "frontend:install": "pnpm install",
     "frontend:build": "pnpm build",
     "frontend:dev:watcher": "pnpm dev",
     "frontend:dev:serverUrl": "auto",
     "author": {
       "name": "Subash Karki"
     },
     "info": {
       "companyName": "PhantomOS",
       "productName": "PhantomOS",
       "copyright": "Copyright 2026 Subash Karki"
     }
   }
   ```

5. Create entry point:
   - **File:** `phantom-os-v2/cmd/phantomos/main.go`
   - Creates Wails app with `wails.Run()`, registers `App` struct as bindings
   - Window config: 1400x900, dark background (`#0a0a0f`), title "PhantomOS"
   - Min size: 800x600

6. Create App struct with Wails lifecycle methods:
   - **File:** `phantom-os-v2/internal/app/app.go`
   - `startup(ctx)` -- stores context, starts WebSocket server
   - `domReady(ctx)` -- emits initial `app:ready` event
   - `shutdown(ctx)` -- graceful cleanup
   - `HealthCheck() string` -- returns JSON `{"status":"ok","version":"0.1.0","uptime_ms":...}`

### 3.2 Set Up Solid.js + TypeScript + Vite Frontend

**Goal:** Solid.js app inside `frontend/` that Wails builds and serves.

1. Initialize frontend:
   ```
   phantom-os-v2/frontend/
   ```

2. Create `package.json`:
   - **File:** `phantom-os-v2/frontend/package.json`
   - Dependencies:
     - `solid-js` ^1.9
     - `@kobalte/core` latest
     - `@vanilla-extract/css` latest
     - `@vanilla-extract/recipes` latest
     - `@vanilla-extract/sprinkles` latest
   - Dev dependencies:
     - `typescript` ^5.5
     - `vite` ^6
     - `vite-plugin-solid` latest
     - `@vanilla-extract/vite-plugin` latest
   - Scripts:
     - `dev`: `vite`
     - `build`: `vite build`
     - `typecheck`: `tsc --noEmit`

3. Create `tsconfig.json`:
   - **File:** `phantom-os-v2/frontend/tsconfig.json`
   - `target: "ESNext"`, `module: "ESNext"`, `jsx: "preserve"`, `jsxImportSource: "solid-js"`
   - Strict mode enabled
   - Paths alias: `@/*` -> `./src/*`

4. Create `vite.config.ts`:
   - **File:** `phantom-os-v2/frontend/vite.config.ts`
   - Plugins: `solidPlugin()`, `vanillaExtractPlugin()`
   - Resolve alias: `@` -> `./src`
   - Build outDir: `../build/frontend` (Wails expects this)

5. Create `index.html`:
   - **File:** `phantom-os-v2/frontend/index.html`
   - Minimal HTML5, `<div id="root">`, script src `./src/index.tsx`
   - Background color `#0a0a0f` on body (prevents white flash)

6. Create entry point:
   - **File:** `phantom-os-v2/frontend/src/index.tsx`
   - `render(() => <App />, document.getElementById('root')!)`

7. Create root component:
   - **File:** `phantom-os-v2/frontend/src/app.tsx`
   - Imports theme styles
   - Renders centered "PhantomOS" text with Solo Leveling glow effect
   - Subscribes to `app:ready` Wails event, displays connection status
   - Calls `HealthCheck()` Wails binding on mount, displays result

### 3.3 Vanilla Extract Theme -- Solo Leveling Dark Tokens

**Goal:** Compile-time CSS theme with the Solo Leveling dark aesthetic.

1. Create design tokens:
   - **File:** `phantom-os-v2/frontend/src/styles/tokens.ts`
   - Not a `.css.ts` file -- raw token values for reuse
   ```typescript
   export const colors = {
     // Core backgrounds
     bg: {
       void: '#0a0a0f',        // deepest background
       surface: '#101018',      // panels, cards
       elevated: '#16161f',     // hover states, modals
       overlay: '#1c1c28',      // dropdowns, popovers
     },
     // Accent -- Shadow Monarch purple
     accent: {
       primary: '#7c3aed',      // primary actions
       hover: '#8b5cf6',        // hover state
       muted: '#5b21b6',        // less prominent
       glow: 'rgba(124, 58, 237, 0.4)', // glow effects
     },
     // Status
     status: {
       success: '#22c55e',
       warning: '#f59e0b',
       error: '#ef4444',
       info: '#3b82f6',
     },
     // Text
     text: {
       primary: '#e2e8f0',      // main text
       secondary: '#94a3b8',    // subdued
       muted: '#64748b',        // hints, placeholders
       inverse: '#0a0a0f',      // text on light backgrounds
     },
     // Borders
     border: {
       subtle: '#1e1e2e',
       default: '#2d2d3f',
       strong: '#3d3d50',
     },
   };

   export const fonts = {
     mono: "'JetBrains Mono', 'Fira Code', 'SF Mono', monospace",
     sans: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
   };

   export const radii = {
     sm: '4px',
     md: '8px',
     lg: '12px',
     xl: '16px',
     full: '9999px',
   };

   export const space = {
     xs: '4px',
     sm: '8px',
     md: '16px',
     lg: '24px',
     xl: '32px',
     '2xl': '48px',
   };
   ```

2. Create Vanilla Extract theme contract + theme:
   - **File:** `phantom-os-v2/frontend/src/styles/theme.css.ts`
   - Uses `createGlobalTheme` from `@vanilla-extract/css`
   - Maps tokens to CSS custom properties
   - Sets global styles: body background, font family, text color, box-sizing
   - Applies `color-scheme: dark`

3. Create sprinkles (utility classes):
   - **File:** `phantom-os-v2/frontend/src/styles/sprinkles.css.ts`
   - Common spacing, color, typography, layout utilities via `createSprinkles`

4. Create component recipes:
   - **File:** `phantom-os-v2/frontend/src/styles/recipes.css.ts`
   - `buttonRecipe` -- base button with variants (primary, ghost, danger)
   - `cardRecipe` -- surface card with border and optional glow
   - `textRecipe` -- text variants (heading, body, caption, code)

5. Create global reset:
   - **File:** `phantom-os-v2/frontend/src/styles/reset.css.ts`
   - CSS reset via `globalStyle`: margin 0, padding 0, box-sizing border-box
   - Scrollbar styling (thin, themed)
   - Selection color (accent)

### 3.4 Kobalte Headless Components -- Smoke Test

**Goal:** Prove Kobalte works with Vanilla Extract styling inside Wails.

1. Create a sample dialog using Kobalte:
   - **File:** `phantom-os-v2/frontend/src/components/system/AboutDialog.tsx`
   - Uses `@kobalte/core/dialog` headless primitive
   - Styled with Vanilla Extract recipes
   - Triggered by clicking the "PhantomOS" title text
   - Displays version, author, build info from `HealthCheck()` binding

### 3.5 WebSocket Server Inside Go Process

**Goal:** WebSocket server running in the Go process, ready for streaming in later phases.

1. Add `nhooyr.io/websocket` dependency:
   ```bash
   go get nhooyr.io/websocket
   ```

2. Create WebSocket hub:
   - **File:** `phantom-os-v2/internal/ws/hub.go`
   - `Hub` struct: manages connected clients, broadcast channel
   - `NewHub()` constructor
   - `Run()` method (goroutine) -- listens for broadcast messages, fans out to clients
   - `Register(conn)` / `Unregister(conn)`
   - `Broadcast(message []byte)`

3. Create WebSocket server:
   - **File:** `phantom-os-v2/internal/ws/server.go`
   - `Server` struct: holds `Hub`, listen address
   - `Start(ctx context.Context)` -- starts `net/http` server on `localhost:9741`
   - Upgrade handler at `/ws` using `nhooyr.io/websocket`
   - Accept options: `InsecureSkipVerify: true` (local only)
   - Per-connection goroutine: reads messages (ping/pong), writes broadcasts
   - Graceful shutdown via context cancellation

4. Create message types:
   - **File:** `phantom-os-v2/internal/ws/messages.go`
   - `Message` struct: `Type string`, `Payload json.RawMessage`, `SessionID string`
   - `MessageType` constants: `"ping"`, `"pong"`, `"health"`, `"event"`
   - JSON marshal/unmarshal helpers

5. Wire into App startup:
   - In `internal/app/app.go` `startup()`: create Hub, create Server, start both in goroutines
   - In `shutdown()`: cancel context, wait for goroutines

### 3.6 Wails Bindings -- Health Check Endpoint

**Goal:** Solid.js can call Go functions directly via Wails bindings.

1. The `HealthCheck()` method on `App` struct (created in 3.1.6) serves as the binding.
   - Returns: `HealthResponse` struct (JSON-serialized by Wails)
   ```go
   type HealthResponse struct {
       Status   string `json:"status"`
       Version  string `json:"version"`
       UptimeMs int64  `json:"uptime_ms"`
       WsPort   int    `json:"ws_port"`
       GoVer    string `json:"go_version"`
   }
   ```

2. Frontend calls it on mount:
   - **File:** `phantom-os-v2/frontend/src/wails/bindings.ts`
   - Import from `../../wailsjs/go/internal/app/App` (auto-generated by Wails)
   - Thin wrapper: `export const healthCheck = () => HealthCheck()`

3. Display in app.tsx:
   - Call `healthCheck()` in `onMount`, store result in signal
   - Render status indicator (green dot + "Connected" or red dot + "Error")

### 3.7 Wails Events -- Go to Solid Signal Bridge

**Goal:** Prove bidirectional event communication between Go and Solid.

1. Create event helpers in Go:
   - **File:** `phantom-os-v2/internal/app/events.go`
   - `EmitEvent(ctx, name string, data interface{})` -- wraps `runtime.EventsEmit`
   - Event name constants: `EventAppReady`, `EventHealthPulse`, `EventWSStatus`

2. Emit a periodic health pulse from Go:
   - In `startup()`, launch a goroutine that emits `"health:pulse"` every 5 seconds
   - Payload: `{ "uptime_ms": ..., "goroutines": ..., "mem_alloc_mb": ... }`

3. Create event subscription helpers in Solid:
   - **File:** `phantom-os-v2/frontend/src/wails/events.ts`
   - `useWailsEvent<T>(name: string): Accessor<T | null>` -- creates signal, subscribes via `EventsOn`
   - Cleanup via `onCleanup` (Solid lifecycle)

4. Wire into app.tsx:
   - Use `useWailsEvent<HealthPulse>('health:pulse')`
   - Display live goroutine count and memory usage in a status bar at bottom of window
   - Proves: Go goroutine -> Wails event -> Solid signal -> DOM update

### 3.8 Project Structure (Match Master Spec Layout)

**Goal:** Create the full directory skeleton so all future phases drop into the right place.

Create empty directories and placeholder files (`// Package <name> ...` or `.gitkeep`):

```
phantom-os-v2/
├── cmd/
│   └── phantomos/
│       └── main.go                    # [created in 3.1]
├── internal/
│   ├── app/
│   │   ├── app.go                     # [created in 3.1]
│   │   ├── events.go                  # [created in 3.7]
│   │   ├── bindings_sessions.go       # stub: package app
│   │   ├── bindings_git.go            # stub
│   │   ├── bindings_projects.go       # stub
│   │   ├── bindings_safety.go         # stub
│   │   └── bindings_ai.go             # stub
│   ├── terminal/
│   │   └── .gitkeep
│   ├── collector/
│   │   └── .gitkeep
│   ├── git/
│   │   └── .gitkeep
│   ├── ai/
│   │   ├── strategies/
│   │   │   └── .gitkeep
│   │   ├── graph/
│   │   │   └── .gitkeep
│   │   ├── knowledge/
│   │   │   └── .gitkeep
│   │   └── evaluator/
│   │       └── .gitkeep
│   ├── stream/
│   │   └── .gitkeep
│   ├── safety/
│   │   └── .gitkeep
│   ├── session/
│   │   └── .gitkeep
│   ├── mcp/
│   │   └── .gitkeep
│   ├── chat/
│   │   └── .gitkeep
│   ├── db/
│   │   ├── migrations/
│   │   │   └── .gitkeep
│   │   └── queries/
│   │       └── .gitkeep
│   ├── project/
│   │   └── .gitkeep
│   ├── gamification/
│   │   └── .gitkeep
│   ├── claude/
│   │   └── .gitkeep
│   ├── plugin/
│   │   └── .gitkeep
│   └── ws/
│       ├── hub.go                     # [created in 3.5]
│       ├── server.go                  # [created in 3.5]
│       └── messages.go                # [created in 3.5]
├── frontend/                          # [created in 3.2]
│   ├── src/
│   │   ├── app.tsx
│   │   ├── index.tsx
│   │   ├── components/
│   │   │   ├── smart-view/
│   │   │   │   └── .gitkeep
│   │   │   ├── terminal/
│   │   │   │   └── .gitkeep
│   │   │   ├── editor/
│   │   │   │   └── .gitkeep
│   │   │   ├── git/
│   │   │   │   └── .gitkeep
│   │   │   ├── safety/
│   │   │   │   └── .gitkeep
│   │   │   ├── sidebar/
│   │   │   │   └── .gitkeep
│   │   │   ├── cockpit/
│   │   │   │   └── .gitkeep
│   │   │   ├── hunter-stats/
│   │   │   │   └── .gitkeep
│   │   │   ├── chat/
│   │   │   │   └── .gitkeep
│   │   │   ├── layout/
│   │   │   │   └── .gitkeep
│   │   │   ├── onboarding/
│   │   │   │   └── .gitkeep
│   │   │   └── system/
│   │   │       └── AboutDialog.tsx    # [created in 3.4]
│   │   ├── signals/
│   │   │   └── .gitkeep
│   │   ├── wails/
│   │   │   ├── bindings.ts            # [created in 3.6]
│   │   │   └── events.ts              # [created in 3.7]
│   │   └── styles/
│   │       ├── tokens.ts              # [created in 3.3]
│   │       ├── theme.css.ts           # [created in 3.3]
│   │       ├── sprinkles.css.ts       # [created in 3.3]
│   │       ├── recipes.css.ts         # [created in 3.3]
│   │       └── reset.css.ts           # [created in 3.3]
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── index.html
├── build/
│   └── appicon.png                    # PhantomOS app icon (placeholder)
├── wails.json                         # [created in 3.1]
├── go.mod                             # [created in 3.1]
├── go.sum                             # auto-generated
├── sqlc.yaml                          # [created in 3.9]
├── Makefile                           # [created in 3.9]
├── .gitignore
└── README.md
```

### 3.9 Build Tooling Stubs

**Goal:** Makefile, sqlc config, and gitignore ready for all phases.

1. Create `Makefile`:
   - **File:** `phantom-os-v2/Makefile`
   ```makefile
   .PHONY: dev build clean test lint sqlc frontend-install

   # Development
   dev:
   	wails dev

   # Production build
   build:
   	wails build -clean

   # Frontend only
   frontend-install:
   	cd frontend && pnpm install

   frontend-build:
   	cd frontend && pnpm build

   frontend-typecheck:
   	cd frontend && pnpm typecheck

   # Go
   go-build:
   	go build -o build/bin/phantomos ./cmd/phantomos

   go-test:
   	go test ./... -v -race

   go-lint:
   	golangci-lint run ./...

   # sqlc (Phase 1+)
   sqlc:
   	sqlc generate

   # Clean
   clean:
   	rm -rf build/bin
   	rm -rf frontend/dist
   	rm -rf frontend/node_modules

   # All tests
   test: go-test frontend-typecheck

   # CI target
   ci: frontend-install go-build frontend-build
   ```

2. Create `sqlc.yaml` stub:
   - **File:** `phantom-os-v2/sqlc.yaml`
   ```yaml
   version: "2"
   sql:
     - engine: "sqlite"
       queries: "internal/db/queries/"
       schema: "internal/db/migrations/"
       gen:
         go:
           package: "db"
           out: "internal/db"
           emit_json_tags: true
           emit_empty_slices: true
   ```

3. Create `.gitignore`:
   - **File:** `phantom-os-v2/.gitignore`
   - Ignore: `build/bin/`, `frontend/node_modules/`, `frontend/dist/`, `*.db`, `.DS_Store`, `wailsjs/` (auto-generated)

### 3.10 GitHub Actions CI

**Goal:** Validate that Go builds and frontend builds on every push/PR.

1. Create workflow:
   - **File:** `phantom-os-v2/.github/workflows/ci.yml`
   ```yaml
   name: CI

   on:
     push:
       branches: [main]
     pull_request:
       branches: [main]

   jobs:
     build:
       runs-on: macos-latest
       steps:
         - uses: actions/checkout@v4

         - name: Set up Go
           uses: actions/setup-go@v5
           with:
             go-version: '1.22'

         - name: Set up Node
           uses: actions/setup-node@v4
           with:
             node-version: '20'

         - name: Install pnpm
           uses: pnpm/action-setup@v4
           with:
             version: 9

         - name: Install Wails CLI
           run: go install github.com/wailsapp/wails/v2/cmd/wails@latest

         - name: Install frontend deps
           run: cd frontend && pnpm install --frozen-lockfile

         - name: TypeScript check
           run: cd frontend && pnpm typecheck

         - name: Go build
           run: go build ./cmd/phantomos

         - name: Go test
           run: go test ./... -v -race

         - name: Frontend build
           run: cd frontend && pnpm build

         - name: Wails build (macOS)
           run: wails build -clean
   ```

---

## 4. Acceptance Criteria

Each criterion must pass before Phase 0 is considered complete:

| # | Criterion | How to verify |
|---|---|---|
| AC-1 | `go build ./cmd/phantomos` succeeds with zero errors | Run command, check exit code 0 |
| AC-2 | `cd frontend && pnpm install && pnpm build` succeeds | Run command, check `dist/` output exists |
| AC-3 | `cd frontend && pnpm typecheck` reports zero errors | Run command, check exit code 0 |
| AC-4 | `wails dev` opens a native macOS window titled "PhantomOS" | Visual inspection |
| AC-5 | Window background is `#0a0a0f` (void black), no white flash on launch | Visual inspection |
| AC-6 | "PhantomOS" text renders centered with Solo Leveling purple glow | Visual inspection |
| AC-7 | Clicking title opens Kobalte About dialog with health info | Click and verify dialog content |
| AC-8 | Health check binding returns `{"status":"ok","version":"0.1.0",...}` | Check rendered status indicator (green dot) |
| AC-9 | Status bar shows live goroutine count updating every 5s | Watch status bar for 15s, confirm values change |
| AC-10 | WebSocket server accepts connection on `localhost:9741/ws` | `websocat ws://localhost:9741/ws` sends ping, receives pong |
| AC-11 | `wails build -clean` produces a single binary under `build/bin/` | Check file exists, run it, window opens |
| AC-12 | Binary size is under 30MB | `ls -lh build/bin/phantomos` |
| AC-13 | All directories from master spec layout exist in tree | `find . -type d` matches expected structure |
| AC-14 | `make ci` runs successfully (go build + frontend build) | Run command, check exit code 0 |
| AC-15 | Vanilla Extract produces zero-runtime CSS (no JS CSS injection at runtime) | Inspect built assets: CSS is in `.css` files, not in JS bundles |
| AC-16 | GitHub Actions workflow file is valid YAML | `yamllint .github/workflows/ci.yml` or push to GH |

---

## 5. Estimated Effort

| Task | Effort |
|---|---|
| 3.1 Go module + Wails init | 2 hours |
| 3.2 Solid.js + Vite setup | 2 hours |
| 3.3 Vanilla Extract theme | 3 hours |
| 3.4 Kobalte smoke test | 1 hour |
| 3.5 WebSocket server | 3 hours |
| 3.6 Wails bindings | 1 hour |
| 3.7 Wails Events bridge | 2 hours |
| 3.8 Directory skeleton | 1 hour |
| 3.9 Makefile + sqlc + gitignore | 1 hour |
| 3.10 GitHub Actions CI | 1 hour |
| **Buffer** (integration issues, Wails quirks) | 3 hours |
| **Total** | **~2.5 days** |

---

## 6. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Wails v2 has no official Solid.js template | Setup friction | Scaffold manually with Vite; Wails just needs `frontend:build` to produce `dist/` |
| Vanilla Extract + Vite + Solid plugin ordering | Build failures | Pin known-good versions; test build before adding features |
| `nhooyr.io/websocket` API changes | Compile errors | Pin to v1.8.x in go.mod |
| macOS WebKit CSS differences vs Chrome | Styling issues | Test in both `wails dev` (WebKit) and browser (Chrome) |
| Wails auto-generated TS types stale after Go changes | Type mismatches | Add `wails generate module` to Makefile dev target |

---

## 7. Non-Goals (Deferred to Phase 1+)

- No SQLite database
- No terminal PTY
- No session collectors
- No stream parsing
- No AI engine
- No git operations
- No file watching
- No real application logic -- this is purely the shell

---

**Author:** Subash Karki
