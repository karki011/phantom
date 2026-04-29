// PhantomOS v2 — main entry point.
// Author: Subash Karki
package main

import (
	"context"
	"embed"
	"errors"
	"log"

	"os"
	"path/filepath"
	"sync"

	"github.com/subashkarki/phantom-os-v2/internal/app"
	"github.com/subashkarki/phantom-os-v2/internal/chat"
	"github.com/subashkarki/phantom-os-v2/internal/collector"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/gamification"
	"github.com/subashkarki/phantom-os-v2/internal/journal"
	"github.com/subashkarki/phantom-os-v2/internal/linker"
	"github.com/subashkarki/phantom-os-v2/internal/provider"
	"github.com/subashkarki/phantom-os-v2/internal/provider/claude"
	"github.com/subashkarki/phantom-os-v2/internal/provider/codex"
	"github.com/subashkarki/phantom-os-v2/internal/safety"
	"github.com/subashkarki/phantom-os-v2/internal/session"
	"github.com/subashkarki/phantom-os-v2/internal/stream"
	"github.com/subashkarki/phantom-os-v2/internal/terminal"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	backfillJournal := false
	for _, arg := range os.Args[1:] {
		if arg == "--backfill-journal" {
			backfillJournal = true
			break
		}
	}

	// 1. Open SQLite database (runs migrations automatically).
	dbPath, err := db.DefaultDBPath()
	if err != nil {
		log.Fatalf("phantomos: resolve db path: %v", err)
	}
	database, err := db.Open(dbPath)
	if err != nil {
		log.Fatalf("phantomos: open database: %v", err)
	}

	// 2. Run v1 import if a legacy database is present (no-op if already done).
	if err := database.ImportV1(); err != nil {
		log.Printf("phantomos: v1 import warning: %v", err)
	}

	// 3. Build sqlc Queries backed by the writer connection.
	queries := db.New(database.Writer)

	// 4. Create terminal manager.
	term := terminal.New()

	// 5. Create shared journal service (single instance for all components).
	journalSvc := journal.NewService("")

	if backfillJournal {
		log.Printf("phantomos: backfilling journal from DB...")
		if err := collector.BackfillJournal(context.Background(), queries, database.Writer, journalSvc); err != nil {
			log.Fatalf("phantomos: backfill: %v", err)
		}
		log.Printf("phantomos: backfill complete; exiting.")
		os.Exit(0)
	}

	// 5a. Create App and inject services.
	a := app.New()
	a.SetDB(database)
	a.SetTerminal(term)
	a.SetJournal(journalSvc)

	// 5b. Create terminal-session linker.
	lnk := linker.New(queries, term, func(name string, data interface{}) {
		app.EmitEvent(a.Ctx(), name, data)
	})
	a.SetLinker(lnk)

	// 6. Set up provider registry with 3-tier config loading.
	//    Ensure user config directories exist for overrides and custom providers.
	if err := provider.EnsureConfigDir(); err != nil {
		log.Printf("phantomos: warning: config dir setup: %v", err)
	}

	provRegistry := provider.NewRegistry()

	// Register adapter factories so InstantiateAll can create the right Go adapter.
	provRegistry.RegisterAdapterFactory("claude", func(cfg *provider.ProviderConfig) provider.Provider {
		return claude.New(cfg)
	})
	provRegistry.RegisterAdapterFactory("codex", func(cfg *provider.ProviderConfig) provider.Provider {
		return codex.New(cfg)
	})

	// LoadAll: embedded (fatal) -> user overrides (warn+skip) -> custom (warn+skip).
	if err := provRegistry.LoadAll(); err != nil {
		log.Fatalf("phantomos: provider registry: %v", err)
	}

	// Instantiate all providers using registered adapter factories.
	provRegistry.InstantiateAll()

	// Select the active provider based on user preference, falling back to
	// the first enabled provider. Fatal if no providers are available.
	activeProv, err := selectActiveProvider(provRegistry, queries)
	if err != nil {
		log.Fatalf("phantomos: %v", err)
	}

	// Inject provider into app for bindings_stream and boot_scan.
	a.SetProvider(activeProv)
	a.SetProviderRegistry(provRegistry)

	// 6b. Create gamification service (XP engine, achievements, quests).
	gamEmitFn := func(name string, data interface{}) {
		app.EmitEvent(a.Ctx(), name, data)
	}
	gamSvc := gamification.NewService(database.Writer, database.Reader, gamEmitFn)
	if err := gamSvc.Init(context.Background()); err != nil {
		log.Printf("phantomos: gamification init warning: %v", err)
	}
	a.SetGamification(gamSvc)

	// 7. Build collector registry with all 5 collectors.
	//    emitEvent is a closure; it captures `a` but only calls EmitEvent after
	//    Wails has called Startup (which sets a.Ctx()). Collectors are started
	//    inside OnStartup below, so the context is always valid by that time.
	registry := collector.NewRegistry()

	onTaskComplete := func(sessionID, taskID string) {
		log.Printf("phantomos: task completed session=%s task=%s", sessionID, taskID)
		gamSvc.OnTaskComplete(context.Background(), sessionID, taskID)
	}

	sessionWatcher := collector.NewSessionWatcher(queries, activeProv, func(name string, data interface{}) {
		app.EmitEvent(a.Ctx(), name, data)
	})
	sessionWatcher.SetLinker(lnk)
	enricher := collector.NewSessionEnricher(queries, database.Writer, func(name string, data interface{}) {
		app.EmitEvent(a.Ctx(), name, data)
	})
	sessionWatcher.SetEnricher(enricher)
	sessionWatcher.SetJournal(journalSvc)
	go enricher.StartPeriodicEnrichment(context.Background())
	registry.Register(sessionWatcher)
	registry.Register(collector.NewJSONLScanner(queries, activeProv, func(name string, data interface{}) {
		app.EmitEvent(a.Ctx(), name, data)
	}))
	activityPoller := collector.NewActivityPoller(queries, activeProv, func(name string, data interface{}) {
		app.EmitEvent(a.Ctx(), name, data)
	})
	activityPoller.SetJournal(journalSvc)
	registry.Register(activityPoller)
	registry.Register(collector.NewTaskWatcher(queries, activeProv, func(name string, data interface{}) {
		app.EmitEvent(a.Ctx(), name, data)
	}, onTaskComplete))
	registry.Register(collector.NewTodoWatcher(queries, activeProv, func(name string, data interface{}) {
		app.EmitEvent(a.Ctx(), name, data)
	}, onTaskComplete))

	// Inject registry into app so Startup/Shutdown can manage it.
	a.SetCollectorRegistry(registry)

	// 8. Create stream service (JSONL event parser + live tailing).
	emitFn := func(name string, data interface{}) {
		app.EmitEvent(a.Ctx(), name, data)
	}
	streamSvc := stream.NewService(database.Writer, emitFn)
	a.SetStream(streamSvc)

	// Auto-start JSONL tailing when session watcher discovers active sessions.
	// Uses the provider's FindConversationFile instead of hardcoded path walking.
	tailedSessions := make(map[string]bool)
	var tailedMu sync.Mutex
	sessionWatcher.SetOnActive(func(sessionID, _ string) {
		tailedMu.Lock()
		if tailedSessions[sessionID] {
			tailedMu.Unlock()
			return
		}
		tailedSessions[sessionID] = true
		tailedMu.Unlock()

		jsonlPath, err := activeProv.FindConversationFile(sessionID, "")
		if err != nil {
			tailedMu.Lock()
			delete(tailedSessions, sessionID)
			tailedMu.Unlock()
			return
		}
		log.Printf("phantomos: auto-tailing session %s", sessionID)
		if err := streamSvc.StartTailing(a.Ctx(), sessionID, jsonlPath); err != nil {
			log.Printf("phantomos: auto-tail %s: %v", sessionID, err)
		}
	})

	// 8a. Create chat service (conversations + active-provider CLI streaming).
	//     The registry is passed alongside the active provider so the chat
	//     service can fan out Compare runs across multiple providers.
	chatSvc := chat.NewService(database.Writer, activeProv, provRegistry, emitFn)
	a.SetChat(chatSvc)

	// 9. Create safety service (YAML ward rules + audit).
	home, _ := os.UserHomeDir()
	wardsDir := filepath.Join(home, ".phantom-os", "wards")
	os.MkdirAll(wardsDir, 0o755)
	safety.InstallDefaults(wardsDir)
	safetySvc, err := safety.NewService(wardsDir, database.Writer, emitFn)
	if err != nil {
		log.Printf("phantomos: safety service warning: %v", err)
	} else {
		safetySvc.SetJournal(journalSvc)
		a.SetSafety(safetySvc)
	}

	// 10. Create session controller (pause/resume/branch/rewind).
	streamStore := stream.NewStore(database.Writer)
	sessionCtrl := session.NewController(database.Writer, streamStore, emitFn)
	a.SetSessionCtrl(sessionCtrl)

	// 11. Run Wails. OnStartup / OnShutdown delegate to App methods which
	//    also start/stop the registry and close the DB in correct order.
	err = wails.Run(&options.App{
		Title:            "PhantomOS",
		Width:            1400,
		Height:           900,
		MinWidth:         800,
		MinHeight:        600,
		WindowStartState: options.Fullscreen,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 10, G: 10, B: 15, A: 1},
		OnStartup:        func(ctx context.Context) { a.Startup(ctx) },
		OnDomReady:       func(ctx context.Context) { a.DomReady(ctx) },
		OnShutdown:       func(ctx context.Context) { a.Shutdown(ctx) },
		Bind: []interface{}{
			a,
		},
		Mac: &mac.Options{
			TitleBar:             mac.TitleBarHiddenInset(),
			Appearance:           mac.NSAppearanceNameDarkAqua,
			WebviewIsTransparent: true,
			WindowIsTranslucent:  false,
		},
	})
	if err != nil {
		log.Fatalf("phantomos: wails run: %v", err)
	}
}

// selectActiveProvider chooses the active provider using this precedence:
//  1. The user-preferred provider stored in the "default_provider" preference,
//     if set and currently registered.
//  2. Legacy default: "claude", if registered.
//  3. The first enabled+installed provider in the registry.
//
// Returns an error if no providers are available.
func selectActiveProvider(reg *provider.Registry, queries *db.Queries) (provider.Provider, error) {
	// 1. User preference (best-effort read; missing key or DB error -> fall through).
	if pref, err := queries.GetPreference(context.Background(), "default_provider"); err == nil && pref != "" {
		if p, ok := reg.Get(pref); ok {
			return p, nil
		}
		log.Printf("phantomos: default_provider=%q not registered; falling back", pref)
	}

	// 2. Legacy default — preserves prior "prefer Claude" behaviour when no preference is set.
	if p, ok := reg.Get("claude"); ok {
		return p, nil
	}

	// 3. Fallback: first enabled+installed provider in registry.
	if enabled := reg.Enabled(); len(enabled) > 0 {
		return enabled[0], nil
	}

	return nil, errors.New("no providers available")
}
