// PhantomOS v2 — main entry point.
// Author: Subash Karki
package main

import (
	"context"
	"embed"
	"log"

	"os"
	"path/filepath"

	"github.com/subashkarki/phantom-os-v2/internal/app"
	"github.com/subashkarki/phantom-os-v2/internal/collector"
	"github.com/subashkarki/phantom-os-v2/internal/db"
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

	// 5. Create App and inject services.
	a := app.New()
	a.SetDB(database)
	a.SetTerminal(term)

	// 6. Build collector registry with all 5 collectors.
	//    emitEvent is a closure; it captures `a` but only calls EmitEvent after
	//    Wails has called Startup (which sets a.Ctx()). Collectors are started
	//    inside OnStartup below, so the context is always valid by that time.
	registry := collector.NewRegistry()

	onTaskComplete := func(sessionID, taskID string) {
		// Phase 1: log only. XP engine comes in a later phase.
		log.Printf("phantomos: task completed session=%s task=%s", sessionID, taskID)
	}

	registry.Register(collector.NewSessionWatcher(queries, func(name string, data interface{}) {
		app.EmitEvent(a.Ctx(), name, data)
	}))
	registry.Register(collector.NewJSONLScanner(queries, func(name string, data interface{}) {
		app.EmitEvent(a.Ctx(), name, data)
	}))
	registry.Register(collector.NewActivityPoller(queries, func(name string, data interface{}) {
		app.EmitEvent(a.Ctx(), name, data)
	}))
	registry.Register(collector.NewTaskWatcher(queries, func(name string, data interface{}) {
		app.EmitEvent(a.Ctx(), name, data)
	}, onTaskComplete))
	registry.Register(collector.NewTodoWatcher(queries, func(name string, data interface{}) {
		app.EmitEvent(a.Ctx(), name, data)
	}, onTaskComplete))

	// Inject registry into app so Startup/Shutdown can manage it.
	a.SetCollectorRegistry(registry)

	// 7. Create stream service (JSONL event parser + live tailing).
	emitFn := func(name string, data interface{}) {
		app.EmitEvent(a.Ctx(), name, data)
	}
	streamSvc := stream.NewService(database.Writer, emitFn)
	a.SetStream(streamSvc)

	// 8. Create safety service (YAML ward rules + audit).
	home, _ := os.UserHomeDir()
	wardsDir := filepath.Join(home, ".phantom-os", "wards")
	os.MkdirAll(wardsDir, 0o755)
	safetySvc, err := safety.NewService(wardsDir, database.Writer, emitFn)
	if err != nil {
		log.Printf("phantomos: safety service warning: %v", err)
	} else {
		a.SetSafety(safetySvc)
	}

	// 9. Create session controller (pause/resume/branch/rewind).
	streamStore := stream.NewStore(database.Writer)
	sessionCtrl := session.NewController(database.Writer, streamStore, emitFn)
	a.SetSessionCtrl(sessionCtrl)

	// 10. Run Wails. OnStartup / OnShutdown delegate to App methods which
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
