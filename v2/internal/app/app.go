package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"github.com/charmbracelet/log"

	graphctx "github.com/subashkarki/phantom-os-v2/internal/ai/graph"
	"github.com/subashkarki/phantom-os-v2/internal/ai/strategies"
	"github.com/subashkarki/phantom-os-v2/internal/chat"
	"github.com/subashkarki/phantom-os-v2/internal/collector"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/git"
	"github.com/subashkarki/phantom-os-v2/internal/linker"
	"github.com/subashkarki/phantom-os-v2/internal/provider"
	"github.com/subashkarki/phantom-os-v2/internal/safety"
	"github.com/subashkarki/phantom-os-v2/internal/session"
	"github.com/subashkarki/phantom-os-v2/internal/stream"
	"github.com/subashkarki/phantom-os-v2/internal/terminal"
	"github.com/subashkarki/phantom-os-v2/internal/tui"
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

	// terminalSubs tracks active Wails-event subscriptions keyed by session ID.
	// Each value is a cancel func that stops the forwarding goroutine.
	terminalSubs   map[string]context.CancelFunc
	terminalSubsMu sync.Mutex

	// tuiSessions holds active Bubbletea PTY sessions keyed by session ID.
	tuiSessions   map[string]*tui.Session
	tuiSessionsMu sync.RWMutex

	// watchedWorktree is the worktree ID the GitHub poller should track.
	// Set by WatchWorktree when the frontend switches active worktree.
	watchedWorktree string
	watchedMu       sync.RWMutex

	// prRefresh signals the GitHub poller to immediately re-fetch (e.g. on pr:created).
	prRefresh chan struct{}

	// branchRefresh signals the GitHub poller to immediately re-poll on branch change.
	branchRefresh chan struct{}

	// gitWatcher provides instant change detection via .git file watching.
	gitWatcher *git.Watcher

	// journal appends notable events to the daily work log.
	journal journalAppender

	// Provider — injected before Startup via setter methods.
	prov         provider.Provider
	provRegistry *provider.Registry

	// Services — injected before Startup via setter methods.
	DB                *db.DB
	Terminal          *terminal.Manager
	Linker            *linker.Linker
	Stream            *stream.Service
	SessionCtrl       *session.Controller
	Safety            *safety.Service
	Chat              *chat.Service
	collectorRegistry *collector.Registry

	// AI context injection — initialized during Startup from DB connections.
	ctxProvider *graphctx.ContextProvider
	ctxInjector *strategies.ContextInjector

	// Chat safety middleware — initialized during Startup from Safety service.
	chatMiddleware *safety.ChatMiddleware
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

// SetLinker injects the terminal-session linker before Wails calls Startup.
func (a *App) SetLinker(l *linker.Linker) { a.Linker = l }

// SetCollectorRegistry injects the collector registry before Wails calls Startup.
func (a *App) SetCollectorRegistry(r *collector.Registry) { a.collectorRegistry = r }

// SetStream injects the stream service before Wails calls Startup.
func (a *App) SetStream(s *stream.Service) { a.Stream = s }

// SetSafety injects the Safety service before Wails calls Startup.
func (a *App) SetSafety(s *safety.Service) { a.Safety = s }

// SetSessionCtrl injects the session controller before Wails calls Startup.
func (a *App) SetSessionCtrl(c *session.Controller) { a.SessionCtrl = c }

// SetChat injects the chat service before Wails calls Startup.
func (a *App) SetChat(c *chat.Service) { a.Chat = c }

// SetProvider injects the active AI provider before Wails calls Startup.
func (a *App) SetProvider(p provider.Provider) { a.prov = p }

// SetProviderRegistry injects the provider registry before Wails calls Startup.
func (a *App) SetProviderRegistry(r *provider.Registry) { a.provRegistry = r }

// journalAppender is the subset of journal.Service used by App to append
// work log lines without importing the full journal package.
type journalAppender interface {
	AppendWorkLog(date, line string)
}

// SetJournal injects the journal service for work log event capture.
func (a *App) SetJournal(j journalAppender) { a.journal = j }

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
	a.terminalSubs = make(map[string]context.CancelFunc)
	a.tuiSessions = make(map[string]*tui.Session)
	a.prRefresh = make(chan struct{}, 1)
	a.branchRefresh = make(chan struct{}, 1)

	// Start WebSocket hub and server.
	a.wsHub = ws.NewHub()
	go a.wsHub.Run(a.ctx)
	a.wsServer = ws.NewServer(a.wsHub, 9741)
	if err := a.wsServer.Start(a.ctx); err != nil {
		// log error but don't crash — WS is enhancement, not critical
		log.Error("app: ws server start failed", "err", err)
	}

	// Start all collectors. Non-fatal: log and continue if any fail.
	if a.collectorRegistry != nil {
		if err := a.collectorRegistry.StartAll(a.ctx); err != nil {
			log.Error("app: collector registry start failed", "err", err)
		}
	}

	// Start safety service (hot-reload watcher).
	if a.Safety != nil {
		if err := a.Safety.Start(a.ctx); err != nil {
			log.Error("app: safety service start failed", "err", err)
		}
	}

	// Initialize session controller tables.
	if a.SessionCtrl != nil {
		if err := a.SessionCtrl.Init(a.ctx); err != nil {
			log.Error("app: session controller init failed", "err", err)
		}
	}

	// Initialize AI graph context injection.
	if a.DB != nil {
		queries := db.New(a.DB.Reader)
		a.ctxProvider = graphctx.NewContextProvider(queries, a.DB.Reader)
		a.ctxInjector = strategies.NewContextInjector(a.ctxProvider)
		log.Info("app: AI context injector initialized")
	}

	// Initialize chat safety middleware.
	if a.Safety != nil {
		emitFn := func(name string, data interface{}) {
			wailsRuntime.EventsEmit(a.ctx, name, data)
		}
		piiEnabled := a.GetPreference("chat_pii_scan") != "false" // enabled by default
		a.chatMiddleware = safety.NewChatMiddleware(a.Safety, piiEnabled, emitFn)
		log.Info("app: chat safety middleware initialized", "pii_scan", piiEnabled)
	}

	// Mark orphaned terminals (active in DB but no live PTY) as ended.
	// Handles crash recovery: terminals that were active when the app last exited.
	if a.DB != nil {
		q := db.New(a.DB.Writer)
		now := time.Now().Unix()
		if err := q.MarkOrphanedTerminalsEnded(a.ctx, sql.NullInt64{Int64: now, Valid: true}); err != nil {
			log.Error("app: mark orphaned terminals", "err", err)
		}
	}

	// Wire PID lookup so Controller can suspend/resume/kill Claude processes.
	if a.SessionCtrl != nil && a.DB != nil {
		a.SessionCtrl.SetPIDLookup(func(sessionID string) (int64, error) {
			sess, err := db.New(a.DB.Reader).GetSession(context.Background(), sessionID)
			if err != nil {
				return 0, err
			}
			if !sess.Pid.Valid {
				return 0, fmt.Errorf("no PID for session %s", sessionID)
			}
			return sess.Pid.Int64, nil
		})
	}

	// Wire stream event hook — chains safety evaluation + chat safety + activity detection.
	if a.Stream != nil {
		// Capture the chat middleware hook (may be nil if safety isn't initialized).
		var chatHook func(ctx context.Context, ev *stream.Event)
		if a.chatMiddleware != nil {
			chatHook = a.chatMiddleware.StreamEventHook()
		}

		a.Stream.SetEventHook(func(ctx context.Context, ev *stream.Event) {
			// Activity detection (async, zero-blocking) — runs for all providers.
			a.detectActivityEvents(ev)

			// Ward safety evaluation — synchronous, can pause sessions.
			if a.Safety != nil && a.SessionCtrl != nil && a.GetPreference("wards_enabled") == "true" {
				evals := a.Safety.Evaluate(ctx, ev)
				for _, eval := range evals {
					log.Warn("app: ward triggered", "rule", eval.RuleID, "level", eval.Level, "session_id", ev.SessionID)
					if eval.Level == safety.LevelBlock || eval.Level == safety.LevelConfirm {
						if err := a.SessionCtrl.Pause(ctx, ev.SessionID); err != nil {
							log.Error("app: safety pause failed", "session_id", ev.SessionID, "rule", eval.RuleID, "err", err)
						}
						break
					}
				}
			}

			// Chat safety evaluation — lightweight, non-blocking.
			// Evaluates user/assistant messages in the stream for PII and chat-specific rules.
			if chatHook != nil {
				chatHook(ctx, ev)
			}
		})
	}

	// Start health pulse goroutine — emits every 5s.
	go a.healthPulseLoop()

	// Start background git fetch — polls origin every 5 minutes.
	go a.startBackgroundFetch()

	// Start GitHub poller — emits pr:updated / ci:updated / prs:list-updated on change.
	go a.startGitHubPoller()


	// Start git filesystem watcher for instant change detection.
	if gw, err := git.NewWatcher(a.ctx); err == nil {
		a.gitWatcher = gw
		go a.handleGitWatcherEvents()
	} else {
		log.Error("app: git watcher start failed", "err", err)
	}
}

func (a *App) DomReady(ctx context.Context) {
	wailsRuntime.EventsEmit(a.ctx, "app:ready", map[string]interface{}{
		"version": "0.1.0",
		"status":  "online",
	})
}

func (a *App) handleGitWatcherEvents() {
	for event := range a.gitWatcher.Events() {
		switch event.Type {
		case git.GitEventBranchChanged:
			wailsRuntime.EventsEmit(a.ctx, EventGitBranchChanged)
			wailsRuntime.EventsEmit(a.ctx, EventGitStatus)
			if a.journal != nil {
				today := time.Now().Format("2006-01-02")
				ts := time.Now().Format("15:04")
				a.journal.AppendWorkLog(today, fmt.Sprintf("%s Switched branch", ts))
			}
			select {
			case a.branchRefresh <- struct{}{}:
			default:
			}
		case git.GitEventIndexChanged:
			wailsRuntime.EventsEmit(a.ctx, EventGitStatus)
		case git.GitEventStatusChanged:
			wailsRuntime.EventsEmit(a.ctx, EventGitStatus)
		case git.GitEventWorkingTreeChanged:
			wailsRuntime.EventsEmit(a.ctx, EventGitStatus)
		}
	}
}

func (a *App) Shutdown(ctx context.Context) {
	// Shutdown order: snapshots → collectors → terminals → DB (reverse of startup).

	// Save terminal scrollback to BOTH file snapshots and DB before destroying.
	if a.Terminal != nil {
		a.saveTerminalSnapshots()
		a.saveScrollbacksToDB()
	}

	if a.gitWatcher != nil {
		a.gitWatcher.Stop()
	}

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

	// Clean up TUI sessions to release PTY file descriptors.
	a.tuiSessionsMu.Lock()
	for id, sess := range a.tuiSessions {
		sess.Close()
		delete(a.tuiSessions, id)
	}
	a.tuiSessionsMu.Unlock()

	// Cancel the app context to stop all remaining goroutines (WS, health pulse).
	if a.cancel != nil {
		a.cancel()
	}

	if a.DB != nil {
		if err := a.DB.Close(); err != nil {
			log.Error("app: close db failed", "err", err)
		}
	}
}

func snapshotPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".phantom-os", "terminal-snapshots.json")
}

func (a *App) saveTerminalSnapshots() {
	snaps := a.Terminal.TakeSnapshots()
	if len(snaps) == 0 {
		_ = os.Remove(snapshotPath())
		return
	}
	data, err := json.Marshal(snaps)
	if err != nil {
		log.Error("app: save terminal snapshots", "err", err)
		return
	}
	// Atomic write: write to temp file then rename to prevent corruption
	// if the app is killed mid-write.
	tmpPath := snapshotPath() + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0o644); err != nil {
		log.Error("app: write terminal snapshots tmp", "err", err)
		return
	}
	if err := os.Rename(tmpPath, snapshotPath()); err != nil {
		log.Error("app: rename terminal snapshots", "err", err)
	}
}

func (a *App) saveScrollbacksToDB() {
	if a.DB == nil {
		return
	}
	q := db.New(a.DB.Writer)
	now := time.Now().Unix()
	snaps := a.Terminal.TakeSnapshots()
	for _, snap := range snaps {
		scrollback := string(snap.Scrollback)
		if err := q.UpdateTerminalScrollback(a.ctx, db.UpdateTerminalScrollbackParams{
			Scrollback:   sql.NullString{String: scrollback, Valid: scrollback != ""},
			LastActiveAt: sql.NullInt64{Int64: now, Valid: true},
			PaneID:       snap.PaneID,
		}); err != nil {
			log.Error("app: save scrollback to DB", "pane_id", snap.PaneID, "err", err)
		}
	}
}

// GetTerminalSnapshots returns saved snapshots from the previous session.
// The frontend calls this on startup to decide which terminals to restore.
// Tries the snapshot file first; falls back to recently-ended DB records.
func (a *App) GetTerminalSnapshots() []terminal.Snapshot {
	// Try snapshot file first (saved on clean shutdown).
	data, err := os.ReadFile(snapshotPath())
	if err == nil {
		_ = os.Remove(snapshotPath())
		var snaps []terminal.Snapshot
		if err := json.Unmarshal(data, &snaps); err != nil {
			log.Error("app: load terminal snapshots", "err", err)
		} else if len(snaps) > 0 {
			return snaps
		}
	}

	// Fallback: build snapshots from DB records that were just orphan-cleaned.
	// These are terminals that were active before the app restarted.
	if a.DB != nil {
		q := db.New(a.DB.Reader)
		cutoff := time.Now().Unix() - 300 // only terminals ended within last 5 minutes
		ended, err := q.ListRecentlyEndedTerminals(a.ctx, sql.NullInt64{Int64: cutoff, Valid: true})
		if err != nil {
			log.Error("app: fallback terminal snapshots from DB", "err", err)
			return nil
		}
		var snaps []terminal.Snapshot
		for _, t := range ended {
			snaps = append(snaps, terminal.Snapshot{
				PaneID:     t.PaneID,
				WorktreeID: stringOrEmpty(t.WorktreeID),
				Shell:      stringOrEmpty(t.Shell),
				CWD:        stringOrEmpty(t.Cwd),
				Cols:       uint16OrDefault(t.Cols, 120),
				Rows:       uint16OrDefault(t.Rows, 36),
				Scrollback: []byte(stringOrEmpty(t.Scrollback)),
			})
		}
		return snaps
	}

	return nil
}

func stringOrEmpty(s sql.NullString) string {
	if s.Valid {
		return s.String
	}
	return ""
}

func uint16OrDefault(n sql.NullInt64, def uint16) uint16 {
	if n.Valid && n.Int64 > 0 {
		return uint16(n.Int64)
	}
	return def
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
