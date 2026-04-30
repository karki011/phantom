# Phantom

**A native desktop workspace for developers — terminal, editor, AI chat, git diff, and journal in one tabbed pane system.**

> **macOS only** (Apple Silicon + Intel). Windows and Linux are not supported today. See [Platform support](#platform-support).

Built by [Subash Karki](https://github.com/karki011)

---

## What it is

Phantom collapses your terminal, code editor, AI chat, git diff viewer, journal, and markdown preview into a single tabbed pane system — so you stop alt-tabbing between iTerm, VS Code, ChatGPT, and your git client and just work in one place. It's built on Wails (Go + SolidJS) for native performance, watches your filesystem in real time, routes every git call through a hardened wrapper to keep state sane, and ships with a first-class AI engine that's hook-aware and MCP-channel-ready — meaning the AI can see what you're editing, what changed, and what you ran, then act on it.

## Status

- **Platform:** macOS only (Apple Silicon + Intel — universal binary)
- **Version:** 0.1.1 — pre-release, public preview
- **Distribution:** Signed with Apple Developer ID + notarized + stapled (no Gatekeeper prompts)

## Platform support

| OS | Status | Why |
|---|---|---|
| **macOS** (Apple Silicon + Intel) | ✅ Supported | Primary target. Universal binary, signed + notarized. |
| **Windows** | ❌ Not supported | No build target, no installer, untested. Wails *can* target Windows via WebView2 — contributors welcome. |
| **Linux** | ❌ Not supported | No build target, untested. Wails *can* target Linux via WebKitGTK — contributors welcome. |

Phantom is built for macOS first because the AI engine, file watcher, audio cues, and shell integration are all tuned to macOS conventions (`~/Library/`, AVFoundation, etc.). Cross-platform support isn't on the near-term roadmap. If you need Windows or Linux, open an issue or send a PR — but treat both as greenfield work.

## Install (prebuilt)

1. Download `Phantom-0.1.1.zip` from [Releases](https://github.com/karki011/phantom/releases)
2. Unzip and drag `Phantom.app` to `/Applications`
3. Double-click — no first-launch internet required (notarization is stapled)

## Build from source

> Build instructions assume macOS. Windows/Linux builds are not supported.

### Prerequisites

- macOS with Xcode Command Line Tools
- [Go](https://go.dev/) 1.25+
- [Wails CLI](https://wails.io/) — `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
- [Node.js](https://nodejs.org/) 22+ and [pnpm](https://pnpm.io/) 10+

### Dev

```bash
cd v2
wails dev      # or: make dev
```

### Release (signed + notarized + zipped)

```bash
cd v2
make release-zip
```

Apple notarization credentials are loaded from `phantom-os/.env.notarize` (gitignored — see `.env.notarize.example`).

## Features

| Pane | What it does |
|---|---|
| **Terminal** | Full PTY with shell integration |
| **TUI** | Interactive TUI apps (vim, lazygit, etc.) |
| **Editor** | Monaco-based code editor with diff support |
| **Chat** | AI chat with code-aware context injection |
| **Diff** | Live git diff viewer |
| **Home** | Workspace dashboard and quick launch |
| **Journal** | Per-project journaling |
| **Markdown preview** | Side-by-side rendered markdown |

Plus: real-time filesystem watching (fsnotify), per-pane state persistence, custom audio engine for ambient feedback, AI engine with MCP channels for tool integration, and a hook system that lets the AI act on file changes and shell commands.

## Architecture

Three-layer split:

- **Go backend** (`v2/internal/`) — git operations, file watching, AI engine, SQLite persistence
- **Wails bindings** — type-safe RPC between Go and the frontend
- **SolidJS frontend** (`v2/frontend/src/`) — reactive UI, pane orchestration, vanilla-extract styling

## Tech stack

| Layer | Technology |
|---|---|
| Desktop runtime | [Wails](https://wails.io/) v2.12 + WebKit |
| Backend | Go 1.25 |
| Frontend | [SolidJS](https://www.solidjs.com/) + TypeScript |
| Styling | [vanilla-extract](https://vanilla-extract.style/) (typed CSS modules) |
| Database | SQLite via [sqlc](https://sqlc.dev/) |
| Editor | Monaco |
| File watching | fsnotify |
| AI integration | MCP (Model Context Protocol) channels + hook system |

## Project layout

```
phantom-os/
├── v2/                     # Active codebase (this is the app)
│   ├── internal/           # Go backend
│   ├── frontend/           # SolidJS frontend
│   ├── build/              # Build artifacts + macOS plist/entitlements
│   └── Makefile            # dev / release / signing targets
├── .env.notarize.example   # Apple notarization template
└── .gitignore
```

## Contributing

This is an early-stage project. Issues and PRs welcome — but expect things to move fast and break.

## License

TBD.
