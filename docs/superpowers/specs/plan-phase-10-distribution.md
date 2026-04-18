# Phase 10: Distribution — DMG, Code Signing, Auto-Updater

**Author:** Subash Karki
**Date:** 2026-04-18
**Status:** Draft
**Phase:** 10 (Final)
**Parent Spec:** `2026-04-18-phantomos-v2-design.md`

---

## Goal

Ship PhantomOS v2 as a signed, notarized, auto-updating macOS application distributed via DMG. Establish the full CI/CD pipeline so every push to `main` produces a release-ready artifact. Users install once and receive seamless updates forever. This is the final phase — the transition from "dev builds on my machine" to "production software anyone in the circle can run."

---

## Prerequisites

All prior phases must be complete and stable:

- **Phase 0-9** — All features implemented, tested, and working as a development build (`wails dev`)
- **Apple Developer ID certificate** — Enrolled in Apple Developer Program ($99/year), Developer ID Application certificate created in Keychain Access
- **Apple notarization credentials** — App-specific password generated for `xcrun notarytool` (or API key for CI)
- **GitHub repository** — `phantom-os-v2` repo with branch protection on `main`
- **GitHub Actions** — Repository has Actions enabled with macOS runners available
- **Sparkle signing key** — EdDSA key pair generated via `generate_keys` tool from Sparkle framework
- **S3 bucket or GitHub Releases** — Decided hosting location for update artifacts (recommendation: GitHub Releases for simplicity, S3 for custom domain/analytics)

---

## Tasks

### 1. Wails Build Configuration

**1.1** Configure Wails build for macOS universal binary (arm64 + amd64)
- File: `wails.json` — Set `info.productName`, `info.productVersion`, bundle identifier (`com.phantomos.app`), copyright
- File: `build/darwin/Info.plist` — Set `CFBundleIdentifier`, `CFBundleVersion`, `CFBundleShortVersionString`, `LSMinimumSystemVersion` (macOS 13.0+), `NSHighResolutionCapable`, `LSUIElement` (false — show in dock)
- File: `build/darwin/entitlements.plist` — Required entitlements: `com.apple.security.cs.allow-jit` (for WebKit JIT), `com.apple.security.cs.allow-unsigned-executable-memory` (WebKit requires this), `com.apple.security.network.client` (outbound network for AI APIs), `com.apple.security.files.user-selected.read-write`

**1.2** Create the build script for universal binary
- File: `scripts/build-universal.sh`
- Build arm64: `wails build -platform darwin/arm64 -o PhantomOS-arm64`
- Build amd64: `wails build -platform darwin/amd64 -o PhantomOS-amd64`
- Combine with `lipo -create -output PhantomOS PhantomOS-arm64 PhantomOS-amd64`
- Replace binary inside `.app` bundle with universal binary
- Expected output: `build/bin/PhantomOS.app` (~30-40MB total)

**1.3** Version injection at build time
- File: `cmd/phantomos/version.go` — Define `var (Version, Commit, BuildDate string)` with `-ldflags` injection
- File: `Makefile` — Add `build` target that passes `-ldflags "-X main.Version=$(VERSION) -X main.Commit=$(COMMIT) -X main.BuildDate=$(DATE)"`
- Version read from `VERSION` file at repo root (single source of truth)
- File: `VERSION` — Semantic version string (e.g., `2.0.0`)
- Go backend exposes version info via Wails binding: `func (a *App) GetVersion() VersionInfo`

### 2. DMG Packaging

**2.1** Create DMG with custom Solo Leveling-themed background
- File: `build/darwin/dmg-background.png` — 600x400px background image (Solo Leveling: Shadow Monarch silhouette, dark purple/blue gradient, "Drag to Applications" arrow indicator overlaid)
- File: `build/darwin/dmg-background@2x.png` — Retina version (1200x800px)
- File: `build/darwin/volume-icon.icns` — Volume icon (PhantomOS logo, Solo Leveling crown motif)

**2.2** DMG creation script using `create-dmg` or `hdiutil`
- File: `scripts/create-dmg.sh`
- Tool: [`create-dmg`](https://github.com/create-dmg/create-dmg) (install via `brew install create-dmg`)
- Configuration:
  - Volume name: "PhantomOS"
  - Window size: 600x400
  - Icon size: 128
  - App icon position: (175, 200)
  - Applications symlink position: (425, 200)
  - Background image: `build/darwin/dmg-background.png`
  - Volume icon: `build/darwin/volume-icon.icns`
  - Hide status bar, hide sidebar, set position
- Output: `dist/PhantomOS-{version}-universal.dmg`

**2.3** DMG verification step
- Mount the DMG, verify `.app` bundle runs, verify code signature is intact after DMG creation
- Script: `scripts/verify-dmg.sh`

### 3. Apple Code Signing

**3.1** Code signing script
- File: `scripts/codesign.sh`
- Sign all embedded frameworks/dylibs first (deep signing), then the app bundle:
  ```
  codesign --force --options runtime --entitlements build/darwin/entitlements.plist \
    --sign "Developer ID Application: <TEAM_NAME> (<TEAM_ID>)" \
    --timestamp \
    build/bin/PhantomOS.app
  ```
- `--options runtime` enables hardened runtime (required for notarization)
- `--timestamp` embeds a secure timestamp from Apple's server
- Verify: `codesign --verify --deep --strict build/bin/PhantomOS.app`
- Also sign the DMG: `codesign --sign "Developer ID Application: ..." dist/PhantomOS-*.dmg`

**3.2** Keychain setup for CI
- File: `scripts/ci/setup-keychain.sh`
- Create temporary keychain for CI runner
- Import Developer ID certificate from base64-encoded GitHub Secret (`APPLE_CERTIFICATE_P12`, `APPLE_CERTIFICATE_PASSWORD`)
- Set keychain as default and unlock it
- Allow `codesign` to access the key without prompt

### 4. Apple Notarization

**4.1** Notarization script
- File: `scripts/notarize.sh`
- Submit the DMG for notarization:
  ```
  xcrun notarytool submit dist/PhantomOS-*.dmg \
    --apple-id "$APPLE_ID" \
    --team-id "$APPLE_TEAM_ID" \
    --password "$APPLE_APP_PASSWORD" \
    --wait
  ```
- `--wait` blocks until notarization completes (typically 2-10 minutes)
- On success, staple the notarization ticket to the DMG:
  ```
  xcrun stapler staple dist/PhantomOS-*.dmg
  ```
- On failure, fetch the log: `xcrun notarytool log <submission-id> --apple-id ... > notarization-log.json`

**4.2** Notarization verification
- `xcrun stapler validate dist/PhantomOS-*.dmg`
- `spctl --assess --type open --context context:primary-signature dist/PhantomOS-*.dmg`

### 5. Auto-Updater via Sparkle Framework

**5.1** Integrate Sparkle into the Wails app
- File: `build/darwin/Sparkle.framework/` — Embed Sparkle 2.x framework in the app bundle
- Sparkle 2.x supports EdDSA signatures (no legacy DSA), sandboxed apps, and macOS 11+
- Integration approach: Sparkle is an Objective-C framework. Since Wails uses CGo minimally, integrate via a thin Objective-C bridge:
  - File: `internal/updater/sparkle_darwin.go` — CGo bridge to Sparkle (`#cgo LDFLAGS: -framework Sparkle`)
  - File: `internal/updater/sparkle_darwin.m` — Objective-C wrapper: `SPUStandardUpdaterController` initialization, check-for-updates trigger, delegate callbacks
  - File: `internal/updater/updater.go` — Platform-agnostic interface: `type Updater interface { CheckForUpdates(); SetAutomaticChecks(bool); GetCurrentVersion() string }`
  - File: `internal/updater/updater_other.go` — No-op implementation for non-macOS builds (build tag: `//go:build !darwin`)

**5.2** Sparkle configuration in Info.plist
- File: `build/darwin/Info.plist` — Add keys:
  - `SUFeedURL`: `https://github.com/<owner>/phantom-os-v2/releases/latest/download/appcast.xml` (or S3 URL)
  - `SUPublicEDKey`: EdDSA public key (generated by Sparkle's `generate_keys`)
  - `SUEnableAutomaticChecks`: `true`
  - `SUScheduledCheckInterval`: `3600` (check every hour)
  - `SUAllowsAutomaticUpdates`: `true`
  - `SUAutomaticallyUpdate`: `false` (prompt user before installing)

**5.3** Wails binding for update UI
- File: `internal/app/bindings_updater.go`
  - `CheckForUpdates()` — Manually trigger update check (from Settings UI or Cmd+K)
  - `GetUpdateStatus() UpdateStatus` — Returns `{Available bool, Version string, ReleaseNotes string, DownloadProgress float64}`
- File: `frontend/src/components/system/UpdateNotification.tsx` — Solid.js component: banner at top of app showing "PhantomOS v2.1.0 available — Restart to update" with progress bar during download

**5.4** Update server — appcast.xml generation
- File: `scripts/generate-appcast.sh`
- Uses Sparkle's `generate_appcast` tool against the `dist/` directory:
  ```
  generate_appcast --ed-key-file sparkle_private_key \
    --download-url-prefix "https://github.com/<owner>/phantom-os-v2/releases/download/v{version}/" \
    dist/
  ```
- Generates `dist/appcast.xml` with:
  - `<enclosure>` pointing to the DMG download URL
  - `sparkle:edSignature` for verification
  - `sparkle:version` and `sparkle:shortVersionString`
  - `<description>` with HTML release notes
  - `sparkle:minimumSystemVersion`
- File: `scripts/generate-appcast-manual.sh` — Fallback script that generates appcast.xml from a template if `generate_appcast` is unavailable

**5.5** Delta updates for smaller downloads
- Sparkle 2.x supports binary delta updates automatically via `generate_appcast`
- Keep the last 3 releases in `dist/` so `generate_appcast` can compute deltas between versions
- Delta patch files: `PhantomOS-{from_version}-to-{to_version}.delta` (typically 1-5MB vs 30-40MB full download)
- CI pipeline archives previous 3 release DMGs as GitHub Actions cache for delta generation

### 6. GitHub Actions CI/CD Pipeline

**6.1** Main CI workflow — build + test on every push
- File: `.github/workflows/ci.yml`
- Trigger: `push` to `main` and all PRs
- Runner: `macos-14` (Apple Silicon, arm64 native)
- Steps:
  1. Checkout code
  2. Setup Go (match `go.mod` version)
  3. Setup Node.js (for frontend build)
  4. Install pnpm
  5. Cache Go modules (`~/go/pkg/mod`)
  6. Cache pnpm store (`~/.pnpm-store`)
  7. Install frontend dependencies: `cd frontend && pnpm install`
  8. Run Go tests: `go test ./... -race -coverprofile=coverage.out`
  9. Run frontend tests: `cd frontend && pnpm test`
  10. Run Go linter: `golangci-lint run`
  11. Run frontend lint: `cd frontend && pnpm lint`
  12. Type check frontend: `cd frontend && pnpm typecheck`
  13. Build (dev mode, no signing): `wails build`
  14. Upload coverage artifacts

**6.2** Release workflow — build, sign, notarize, publish
- File: `.github/workflows/release.yml`
- Trigger: `push` of tag matching `v*` (e.g., `v2.0.0`, `v2.1.0-beta.1`)
- Runner: `macos-14`
- Secrets required:
  - `APPLE_CERTIFICATE_P12` — Base64-encoded Developer ID certificate
  - `APPLE_CERTIFICATE_PASSWORD` — Certificate password
  - `APPLE_ID` — Apple ID email
  - `APPLE_TEAM_ID` — Apple Developer Team ID
  - `APPLE_APP_PASSWORD` — App-specific password for notarization
  - `SPARKLE_PRIVATE_KEY` — Sparkle EdDSA private key
- Steps:
  1. Checkout code
  2. Setup Go + Node.js + pnpm (parallel setup)
  3. Extract version from tag: `VERSION=${GITHUB_REF#refs/tags/v}`
  4. Run full test suite (Go + frontend)
  5. Build universal binary: `scripts/build-universal.sh`
  6. Setup keychain: `scripts/ci/setup-keychain.sh`
  7. Code sign: `scripts/codesign.sh`
  8. Create DMG: `scripts/create-dmg.sh`
  9. Sign DMG: `codesign --sign ...`
  10. Notarize: `scripts/notarize.sh` (blocks until complete)
  11. Staple: `xcrun stapler staple`
  12. Download previous 3 releases (for delta generation)
  13. Generate appcast.xml: `scripts/generate-appcast.sh`
  14. Generate release notes: `scripts/generate-release-notes.sh`
  15. Create GitHub Release via `gh release create`
  16. Upload artifacts: DMG, appcast.xml, delta files
  17. Cleanup keychain

**6.3** Release notes generation from git log
- File: `scripts/generate-release-notes.sh`
- Parse git log between previous tag and current tag:
  ```
  git log $(git describe --tags --abbrev=0 HEAD^)..HEAD --pretty=format:"- %s (%h)" --no-merges
  ```
- Group by conventional commit prefix: `feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `chore:`
- Output markdown with sections: "New Features", "Bug Fixes", "Performance", "Other Changes"
- Include contributor list (for when friends contribute)
- File: `scripts/release-notes-template.md` — Template with placeholders for version, date, and grouped changes

**6.4** Workflow for PR checks
- File: `.github/workflows/pr-check.yml`
- Trigger: `pull_request` to `main`
- Lightweight: tests + lint only, no build/signing
- Required status check for merge

### 7. Version Management

**7.1** Semantic versioning strategy
- File: `VERSION` — Single source of truth, plain text: `2.0.0`
- Format: `MAJOR.MINOR.PATCH` per semver.org
  - MAJOR: Breaking changes to user data (DB schema migration that cannot rollback)
  - MINOR: New features (new pane, new AI strategy, new safety rule type)
  - PATCH: Bug fixes, performance improvements
- Pre-release: `2.1.0-beta.1`, `2.1.0-rc.1`
- Build metadata: Commit SHA appended at build time (not in version string, in `VersionInfo.Commit`)

**7.2** Version bump script
- File: `scripts/bump-version.sh`
- Usage: `./scripts/bump-version.sh [major|minor|patch|<explicit-version>]`
- Reads `VERSION`, increments, writes back
- Updates `wails.json` version field
- Updates `frontend/package.json` version field
- Creates git commit: `chore: bump version to X.Y.Z`
- Creates git tag: `vX.Y.Z`

**7.3** Version display in app
- File: `internal/app/bindings_system.go` — `GetVersion() VersionInfo` returns `{Version, Commit, BuildDate, GoVersion, WailsVersion}`
- File: `frontend/src/components/system/AboutPanel.tsx` — "About PhantomOS" panel in Settings with version info, update check button, and link to changelog

### 8. Crash Reporting (Optional)

**8.1** Custom crash reporter (recommended over Sentry for privacy)
- File: `internal/crash/reporter.go`
- Registers `debug.SetPanicOnFault(true)` and a recovery handler in `main.go`
- On crash: captures goroutine stack trace, Go runtime info, OS version, app version
- Writes crash report to `~/.phantom-os/crashes/crash-{timestamp}.log`
- File: `internal/crash/report.go` — Struct: `CrashReport{Timestamp, Version, Commit, OS, Arch, GoVersion, StackTrace, LastAction, DBState}`
- Does NOT include user data, session content, or file paths — privacy first

**8.2** Crash report UI
- File: `frontend/src/components/system/CrashReportDialog.tsx`
- On next launch after crash: dialog shows "PhantomOS crashed unexpectedly" with stack summary
- "Send Report" button (optional, off by default — respects user privacy)
- "View Details" expands full crash log
- "Don't ask again" checkbox

**8.3** Sentry integration (opt-in, for future consideration)
- File: `internal/crash/sentry.go` — Sentry Go SDK integration behind a build tag (`//go:build sentry`)
- Only enabled if user explicitly opts in via Settings
- DSN stored in config, not hardcoded
- Filters: no PII, no file paths, no session content — stack traces and version info only

### 9. First-Run Experience & v1 Data Migration

**9.1** First-run detection
- File: `internal/app/firstrun.go`
- Check: `~/.phantom-os/phantom.db` exists? If yes, check schema version.
  - No DB → fresh install, run full onboarding (Phase 6h OnboardingFlow)
  - DB with v1 schema (Drizzle column names) → trigger migration
  - DB with v2 schema → normal startup

**9.2** v1 to v2 data migration
- File: `internal/db/migrations/001_v1_import.go` (runs once, before standard migrations)
- v1 DB location: `~/.phantom-os/phantom.db` (same path, different schema)
- Strategy: backup v1 DB to `~/.phantom-os/phantom.db.v1-backup-{timestamp}`, then migrate in-place
- Migration steps:
  1. Backup: `cp phantom.db phantom.db.v1-backup-{timestamp}`
  2. Read v1 schema version from `drizzle_migrations` table
  3. Migrate tables that exist in both v1 and v2:
     - `projects` — Column names match (v1 used snake_case via Drizzle)
     - `worktrees` — Add new v2 columns with defaults
     - `terminal_sessions` — Port session data, mark as "cold" (no active PTY)
     - `chat_conversations`, `chat_messages` — Direct copy
     - `user_preferences` — Direct copy
     - `achievements`, `quests`, `hunter_stats`, `activity_log` — Direct copy (preserve XP, levels, streaks)
     - `tasks` — Direct copy with new status column default
     - `graph_nodes`, `graph_edges`, `graph_meta` — Direct copy (graph data is regenerable, so loss is acceptable)
  4. Create new v2-only tables: `safety_rules`, `safety_audit`, `session_events`, `session_policies`, `model_routing_log`, `strategy_performance`
  5. Run standard `golang-migrate` migrations to bring schema to current v2 version
  6. Write migration result to `~/.phantom-os/migration-log.json`

**9.3** Migration UI
- File: `frontend/src/components/onboarding/MigrationProgress.tsx`
- Shows during first v2 launch if v1 data detected:
  - "Upgrading from PhantomOS v1..."
  - Progress bar with step descriptions
  - "Your achievements, stats, and chat history are being preserved"
  - On completion: "Migration complete — X projects, Y sessions, Z achievements imported"
  - On failure: "Migration failed — v1 data backed up at ~/.phantom-os/phantom.db.v1-backup-{timestamp}. You can continue with a fresh install or report the issue."

**9.4** Rollback safety
- v1 backup is never deleted automatically
- File: `internal/app/bindings_system.go` — `GetV1Backup() *string` returns backup path if it exists
- Settings panel shows "v1 backup available" with option to delete manually

### 10. Cross-Platform Preparation (Structure Only — Not Built)

**10.1** Build structure for future Linux support
- File: `build/linux/` directory created with placeholder files:
  - `build/linux/phantomos.desktop` — Freedesktop `.desktop` entry (Name, Exec, Icon, Categories)
  - `build/linux/phantomos.png` — App icon (256x256)
  - `build/linux/AppRun` — AppImage entry point (placeholder)
- File: `scripts/build-linux.sh` — Placeholder script with TODOs:
  - Build: `wails build -platform linux/amd64`
  - Package: `appimagetool` to create `.AppImage`
  - Auto-updater: `AppImageUpdate` library (Linux equivalent of Sparkle)

**10.2** Build structure for future Windows support
- File: `build/windows/` directory created with placeholder files:
  - `build/windows/installer.nsi` — NSIS installer script template (placeholder)
  - `build/windows/phantomos.ico` — App icon
  - `build/windows/phantomos.exe.manifest` — Windows manifest (DPI awareness, admin elevation: none)
- File: `scripts/build-windows.sh` — Placeholder script with TODOs:
  - Build: `wails build -platform windows/amd64`
  - Package: NSIS or WiX installer
  - Code signing: SignTool with EV certificate
  - Auto-updater: WinSparkle (Windows port of Sparkle)

**10.3** Platform-agnostic updater interface
- File: `internal/updater/updater.go` — Already created in Task 5.1 with platform-agnostic interface
- Build tags: `updater_darwin.go` (Sparkle), `updater_linux.go` (AppImageUpdate — stub), `updater_windows.go` (WinSparkle — stub)
- All stubs return `ErrNotImplemented` with a log message

### 11. Release Checklist Script

**11.1** Pre-release validation script
- File: `scripts/release-checklist.sh`
- Automated checks before cutting a release:
  1. All tests pass (`go test ./... && cd frontend && pnpm test`)
  2. No uncommitted changes (`git status --porcelain`)
  3. VERSION file matches tag being created
  4. `wails.json` version matches VERSION
  5. `frontend/package.json` version matches VERSION
  6. CHANGELOG.md has entry for this version
  7. Build succeeds in release mode
  8. Binary starts and exits cleanly (`./PhantomOS --version`)
  9. DB migrations run forward and backward without error
  10. Sparkle keys are available (env var check)

**11.2** Changelog management
- File: `CHANGELOG.md` — Keep a running changelog in [Keep a Changelog](https://keepachangelog.com/) format
- Sections per release: Added, Changed, Fixed, Removed, Security
- `scripts/bump-version.sh` adds a new `## [X.Y.Z] - YYYY-MM-DD` header automatically

---

## File Summary

New files created in this phase:

| File | Purpose |
|------|---------|
| `VERSION` | Single source of truth for version string |
| `CHANGELOG.md` | User-facing changelog |
| `cmd/phantomos/version.go` | Build-time version injection |
| `internal/updater/updater.go` | Platform-agnostic updater interface |
| `internal/updater/sparkle_darwin.go` | CGo bridge to Sparkle framework |
| `internal/updater/sparkle_darwin.m` | Objective-C Sparkle wrapper |
| `internal/updater/updater_other.go` | No-op updater for non-macOS |
| `internal/crash/reporter.go` | Crash recovery and report generation |
| `internal/crash/report.go` | Crash report struct and serialization |
| `internal/crash/sentry.go` | Optional Sentry integration (build tag) |
| `internal/app/firstrun.go` | First-run detection and migration trigger |
| `internal/app/bindings_updater.go` | Wails bindings for update UI |
| `internal/db/migrations/001_v1_import.go` | v1 to v2 data migration |
| `build/darwin/Info.plist` | macOS app metadata (updated) |
| `build/darwin/entitlements.plist` | Hardened runtime entitlements |
| `build/darwin/dmg-background.png` | DMG background (Solo Leveling themed) |
| `build/darwin/dmg-background@2x.png` | Retina DMG background |
| `build/darwin/volume-icon.icns` | DMG volume icon |
| `build/linux/` | Placeholder structure for future Linux support |
| `build/windows/` | Placeholder structure for future Windows support |
| `scripts/build-universal.sh` | Universal binary build script |
| `scripts/create-dmg.sh` | DMG creation with custom background |
| `scripts/verify-dmg.sh` | DMG integrity verification |
| `scripts/codesign.sh` | Code signing script |
| `scripts/notarize.sh` | Apple notarization script |
| `scripts/generate-appcast.sh` | Sparkle appcast.xml generation |
| `scripts/generate-appcast-manual.sh` | Fallback appcast generation |
| `scripts/generate-release-notes.sh` | Git log to release notes |
| `scripts/release-notes-template.md` | Release notes template |
| `scripts/bump-version.sh` | Version bump automation |
| `scripts/release-checklist.sh` | Pre-release validation |
| `scripts/ci/setup-keychain.sh` | CI keychain setup for signing |
| `.github/workflows/ci.yml` | CI pipeline (test + lint + build) |
| `.github/workflows/release.yml` | Release pipeline (build + sign + notarize + publish) |
| `.github/workflows/pr-check.yml` | PR validation (tests + lint) |
| `frontend/src/components/system/UpdateNotification.tsx` | Update available banner |
| `frontend/src/components/system/AboutPanel.tsx` | Version info and update check |
| `frontend/src/components/system/CrashReportDialog.tsx` | Post-crash report dialog |
| `frontend/src/components/onboarding/MigrationProgress.tsx` | v1 to v2 migration UI |

---

## Acceptance Criteria

### Build & Package
- [ ] `wails build` produces a universal binary (arm64 + amd64) that runs on both Intel and Apple Silicon Macs
- [ ] Universal binary size is under 25MB (Go binary only); total `.app` bundle under 50MB
- [ ] DMG opens with custom Solo Leveling background, correct icon positions, and "drag to Applications" visual cue
- [ ] App launches from `/Applications/PhantomOS.app` without "unidentified developer" warning

### Code Signing & Notarization
- [ ] `codesign --verify --deep --strict PhantomOS.app` passes with no warnings
- [ ] `spctl --assess --type execute PhantomOS.app` returns "accepted"
- [ ] Notarization completes successfully via `xcrun notarytool`
- [ ] Stapled ticket verified via `xcrun stapler validate`
- [ ] Gatekeeper allows first launch without quarantine dialog

### Auto-Updater
- [ ] Sparkle checks for updates on launch (configurable interval, default: hourly)
- [ ] When a new version is available, user sees notification with release notes
- [ ] User can manually trigger update check from Settings or Cmd+K
- [ ] Update downloads in background with progress indicator
- [ ] After download, user is prompted to restart (not forced)
- [ ] Delta updates work: upgrading from v2.0.0 to v2.0.1 downloads <5MB patch, not full 30MB DMG
- [ ] appcast.xml is valid, signed with EdDSA, and served from GitHub Releases
- [ ] Downgrade is blocked (Sparkle rejects older versions)

### CI/CD Pipeline
- [ ] Push to `main` triggers CI: Go tests, frontend tests, lint, type check, build
- [ ] CI completes in under 15 minutes on macOS runner
- [ ] Tagging `vX.Y.Z` triggers release workflow: build → sign → notarize → DMG → upload
- [ ] GitHub Release is created automatically with DMG, appcast.xml, delta files, and generated release notes
- [ ] Release notes are grouped by conventional commit type (feat, fix, perf, etc.)
- [ ] Failed notarization blocks the release (no unsigned builds published)
- [ ] PR checks are required status checks for merge to `main`

### Version Management
- [ ] `VERSION` file is the single source of truth — `wails.json`, `package.json`, and Go binary all derive from it
- [ ] `scripts/bump-version.sh` updates all version references and creates tagged commit
- [ ] App displays correct version in About panel and `--version` CLI flag
- [ ] Pre-release versions (`-beta.1`, `-rc.1`) are supported and sorted correctly by Sparkle

### Crash Reporting
- [ ] Panics are caught and written to `~/.phantom-os/crashes/` with full stack trace
- [ ] Crash report contains: version, commit, OS, architecture, Go version, stack trace
- [ ] Crash report does NOT contain: file paths, session content, user data, secrets
- [ ] Next launch after crash shows dialog offering to view/send the report
- [ ] "Don't ask again" preference is persisted

### First-Run & Migration
- [ ] Fresh install (no `~/.phantom-os/`) launches onboarding flow
- [ ] v1 database detected → backup created at `phantom.db.v1-backup-{timestamp}`
- [ ] v1 data migrated: projects, worktrees, chat history, achievements, stats, quests
- [ ] Migration progress shown in UI with step descriptions
- [ ] Migration failure does not corrupt v1 backup — user can downgrade
- [ ] v1 backup path shown in Settings with manual delete option

### Cross-Platform Prep
- [ ] `build/linux/` and `build/windows/` directories exist with placeholder configs
- [ ] `internal/updater/` compiles on Linux and Windows (no-op implementation)
- [ ] Go code has no macOS-specific imports outside `_darwin.go` files (except updater bridge)

---

## Estimated Effort

| Task | Effort | Notes |
|------|--------|-------|
| 1. Wails build config + universal binary | 1-2 days | Straightforward but needs testing on both architectures |
| 2. DMG packaging | 1 day | `create-dmg` does the heavy lifting; background image is design work |
| 3. Code signing | 1 day | Certificate setup is the bottleneck; signing itself is scripted |
| 4. Notarization | 0.5 days | Apple's service is slow (2-10 min) but the script is simple |
| 5. Sparkle auto-updater | 3-4 days | CGo bridge to Sparkle is the hardest part; appcast generation, delta updates, testing update flow |
| 6. GitHub Actions CI/CD | 2-3 days | Three workflows, caching, secrets management, macOS runner quirks |
| 7. Version management | 0.5 days | Scripts and conventions |
| 8. Crash reporting | 1-2 days | Custom reporter is simple; Sentry integration is optional/deferred |
| 9. First-run + v1 migration | 2-3 days | Migration logic is schema-dependent; testing across v1 DB variants |
| 10. Cross-platform prep | 0.5 days | Placeholder files and build tags only |
| 11. Release checklist + polish | 1 day | Testing the full flow end-to-end |

**Total: 13-18 days (~2.5-3.5 weeks)**

### Risk Factors
- **Apple notarization rejection:** Can take multiple iterations to resolve entitlement or signing issues. Budget an extra 1-2 days for debugging.
- **Sparkle CGo bridge:** Mixing Go, CGo, and Objective-C is fragile. If this proves too painful, fallback option: shell out to a Swift helper binary that wraps Sparkle, communicating via stdout/stdin.
- **macOS CI runner availability:** GitHub-hosted macOS runners can have queue times. Consider self-hosted runner if builds are blocked frequently.
- **Delta update testing:** Requires having multiple real versions to generate deltas between. May need to manually create "fake" v2.0.0 release to test the update flow from v2.0.0 to v2.0.1.

---

## Architecture Decisions

### Why Sparkle over custom auto-updater
- Sparkle is the de facto standard for macOS app updates (used by Firefox, VLC, iTerm2)
- Handles signature verification, delta updates, UI prompts, and rollback
- Active maintenance (Sparkle 2.x released 2023, ongoing updates)
- Alternative considered: custom HTTP polling + DMG download — rejected because it reinvents solved problems and lacks delta updates

### Why GitHub Releases over S3
- Simpler: no bucket management, no CloudFront, no CORS
- Free for public repos, generous limits for private
- `gh release` CLI integrates naturally with CI
- If custom analytics are needed later, switch `SUFeedURL` to S3 — the appcast.xml format is the same

### Why custom crash reporter over Sentry
- Privacy: PhantomOS handles sensitive code and session data. Sending anything to a third-party service requires explicit consent.
- Target audience is small (Subash + friends) — crash logs in `~/.phantom-os/crashes/` are sufficient
- Sentry is available as opt-in behind a build tag for future use if the audience grows

### Why not Wails v3 auto-updater
- Wails v2 has no built-in auto-updater (confirmed in validation report)
- Wails v3 is not stable enough to depend on (alpha/beta as of 2026-04)
- Sparkle is proven and independent of the framework choice

---

**Author:** Subash Karki
