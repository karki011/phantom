# libghostty Integration (Wave 5 spike)

Status: **CGo bridge proven linkable**. Full surface lifecycle + NSView overlay still TODO.

## What works
- `make libghostty` produces `third_party/ghostty/macos/GhosttyKit.xcframework/macos-arm64/libghostty-internal-fat.a`
- `bridge.go` exposes `Init()`, `GetInfo()`, `Translate()` — proves the C entry points + all required frameworks are linked
- `TestLibghosttyLinks` smoke test confirms a running Go process can call into the 134MB static library and read back the ghostty version string

## What's still required
1. **`ghostty_app_new` setup** — supply a `ghostty_runtime_config_s` with all the C function pointer callbacks (wakeup, clipboard, action). Each callback needs a Go-side handler exported via `//export`.
2. **`ghostty_surface_new` per terminal** — owns the Metal rendering. Needs a host NSView with a `CAMetalLayer` backing layer.
3. **Native `PhantomTerminalView : NSView`** — Objective-C subclass. Creates the `CAMetalLayer`, hosts focus/input events, forwards keystrokes via `ghostty_surface_key()`.
4. **NSView overlay sync** — frontend reports placeholder div bounds (ResizeObserver → Wails bridge); native side positions the `PhantomTerminalView` accordingly.
5. **Wails app bundle integration** — link the libghostty .a into the Wails Go build, ensure code signing covers it.

## Setup (first time)
```bash
brew install zig@0.15
xcodebuild -downloadComponent MetalToolchain   # ~700 MB
git clone https://github.com/ghostty-org/ghostty third_party/ghostty
make libghostty                                # ~5 min on M-series
go test ./internal/terminal/ghostty/           # smoke test
```

## Frameworks linked (from bridge.go LDFLAGS)
AppKit, CoreText, CoreGraphics, Metal, MetalKit, UniformTypeIdentifiers,
AVFoundation, Carbon, UserNotifications, IOSurface, QuartzCore, Foundation,
libobjc, libc++.

## Why static link (not dylib)?
- Default ghostty build produces `libghostty-internal-fat.a` inside an xcframework
- Building a dylib would require custom build options + signing the dylib separately
- 134 MB static link is acceptable for a desktop app; alternative is shipping the .a as a resource and `dlopen`ing it

## Next steps (rough order)
1. Define Go-side runtime config struct + callback exports
2. Build a smoke test that creates `ghostty_app_t` (no surface yet)
3. Native NSView wrapper as a CGo C file
4. End-to-end: open one terminal in a standalone NSWindow via Go
5. Bridge into Wails NSWindow as sibling NSView
6. Drive position from frontend ResizeObserver
7. Replace xterm.js pane behind a feature flag

Plan file: `.planning/native-feel/LIBGHOSTTY-INTEGRATION.md`
