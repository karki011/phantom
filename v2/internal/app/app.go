package app

import (
	"context"
	"encoding/json"
	"log"
	"runtime"
	"sync"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/collector"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/safety"
	"github.com/subashkarki/phantom-os-v2/internal/session"
	"github.com/subashkarki/phantom-os-v2/internal/stream"
	"github.com/subashkarki/phantom-os-v2/internal/terminal"
	"github.com/subashkarki/phantom-os-v2/internal/ws"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type App struct {
	ctx       context.Context
	cancel    context.CancelFunc
	startTime time.Time
	mu        sync.RWMutex
	wsHub     *ws.Hub
	wsServer  *ws.Server

	// Services — injected before Startup via setter methods.
	DB                *db.DB
	Terminal          *terminal.Manager
	Stream            *stream.Service
	SessionCtrl       *session.Controller
	Safety            *safety.Service
	collectorRegistry *collector.Registry
}

func New() *App {
	return &App{
		startTime: time.Now(),
	}
}

// SetDB injects the database before Wails calls Startup.
func (a *App) SetDB(d *db.DB) { a.DB = d }

// SetTerminal injects the terminal manager before Wails calls Startup.
func (a *App) SetTerminal(t *terminal.Manager) { a.Terminal = t }

// SetCollectorRegistry injects the collector registry before Wails calls Startup.
func (a *App) SetCollectorRegistry(r *collector.Registry) { a.collectorRegistry = r }

// SetStream injects the stream service before Wails calls Startup.
func (a *App) SetStream(s *stream.Service) { a.Stream = s }

// SetSafety injects the Safety service before Wails calls Startup.
func (a *App) SetSafety(s *safety.Service) { a.Safety = s }

// SetSessionCtrl injects the session controller before Wails calls Startup.
func (a *App) SetSessionCtrl(c *session.Controller) { a.SessionCtrl = c }

// Ctx returns the app-level context (valid after Startup is called).
func (a *App) Ctx() context.Context { return a.ctx }

type HealthResponse struct {
	Status     string  `json:"status"`
	Version    string  `json:"version"`
	UptimeMs   int64   `json:"uptime_ms"`
	WsPort     int     `json:"ws_port"`
	GoVersion  string  `json:"go_version"`
	Goroutines int     `json:"goroutines"`
	MemAllocMB float64 `json:"mem_alloc_mb"`
}

func (a *App) Startup(ctx context.Context) {
	a.ctx, a.cancel = context.WithCancel(ctx)

	// Start WebSocket hub and server.
	a.wsHub = ws.NewHub()
	go a.wsHub.Run(a.ctx)
	a.wsServer = ws.NewServer(a.wsHub, 9741)
	if err := a.wsServer.Start(a.ctx); err != nil {
		// log error but don't crash — WS is enhancement, not critical
		log.Printf("app: ws server start: %v", err)
	}

	// Start all collectors. Non-fatal: log and continue if any fail.
	if a.collectorRegistry != nil {
		if err := a.collectorRegistry.StartAll(a.ctx); err != nil {
			log.Printf("app: collector registry start: %v", err)
		}
	}

	// Start safety service (hot-reload watcher).
	if a.Safety != nil {
		if err := a.Safety.Start(a.ctx); err != nil {
			log.Printf("app: safety service start: %v", err)
		}
	}

	// Initialize session controller tables.
	if a.SessionCtrl != nil {
		if err := a.SessionCtrl.Init(a.ctx); err != nil {
			log.Printf("app: session controller init: %v", err)
		}
	}

	// Start health pulse goroutine — emits every 5s.
	go a.healthPulseLoop()
}

func (a *App) DomReady(ctx context.Context) {
	wailsRuntime.EventsEmit(a.ctx, "app:ready", map[string]interface{}{
		"version": "0.1.0",
		"status":  "online",
	})
}

func (a *App) Shutdown(ctx context.Context) {
	// Shutdown order: collectors → terminals → DB (reverse of startup).
	// Collectors may flush writes during drain, so DB must stay open until last.

	if a.collectorRegistry != nil {
		a.collectorRegistry.StopAll()
	}

	if a.Safety != nil {
		a.Safety.Stop()
	}

	if a.Stream != nil {
		a.Stream.StopAll()
	}

	if a.Terminal != nil {
		a.Terminal.DestroyAll()
	}

	// Cancel the app context to stop all remaining goroutines (WS, health pulse).
	if a.cancel != nil {
		a.cancel()
	}

	if a.DB != nil {
		if err := a.DB.Close(); err != nil {
			log.Printf("app: close db: %v", err)
		}
	}
}

func (a *App) HealthCheck() HealthResponse {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	return HealthResponse{
		Status:     "ok",
		Version:    "0.1.0",
		UptimeMs:   time.Since(a.startTime).Milliseconds(),
		WsPort:     9741,
		GoVersion:  runtime.Version(),
		Goroutines: runtime.NumGoroutine(),
		MemAllocMB: float64(m.Alloc) / 1024 / 1024,
	}
}

func (a *App) healthPulseLoop() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-a.ctx.Done():
			return
		case <-ticker.C:
			health := a.HealthCheck()
			data, _ := json.Marshal(health)
			wailsRuntime.EventsEmit(a.ctx, "health:pulse", json.RawMessage(data))
		}
	}
}
