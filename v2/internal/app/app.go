package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/log"

	"net/http"

	"github.com/subashkarki/phantom-os-v2/internal/ai/assess"
	"github.com/subashkarki/phantom-os-v2/internal/ai/detect"
	graphctx "github.com/subashkarki/phantom-os-v2/internal/ai/graph"
	"github.com/subashkarki/phantom-os-v2/internal/ai/graph/filegraph"
	"github.com/subashkarki/phantom-os-v2/internal/ai/knowledge"
	"github.com/subashkarki/phantom-os-v2/internal/ai/orchestrator"
	"github.com/subashkarki/phantom-os-v2/internal/ai/strategies"
	"github.com/subashkarki/phantom-os-v2/internal/api"
	"github.com/subashkarki/phantom-os-v2/internal/branding"
	"github.com/subashkarki/phantom-os-v2/internal/collector"
	"github.com/subashkarki/phantom-os-v2/internal/composer"
	"github.com/subashkarki/phantom-os-v2/internal/conflict"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/git"
	"github.com/subashkarki/phantom-os-v2/internal/integration"
	"github.com/subashkarki/phantom-os-v2/internal/linker"
	"github.com/subashkarki/phantom-os-v2/internal/perf"
	"github.com/subashkarki/phantom-os-v2/internal/persona"
	"github.com/subashkarki/phantom-os-v2/internal/provider"
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

	// workflowRefresh signals the GitHub poller to immediately re-fetch workflow runs (e.g. after dispatch).
	workflowRefresh chan struct{}

	// gitWatcher provides instant change detection via .git file watching.
	gitWatcher *git.Watcher

	// gitPriorityPool runs git work with a high (active project) / low
	// (background) lane so active-project operations jump the queue.
	gitPriorityPool *git.PriorityPool

	// gitWarmCache returns stale snapshots instantly on project switch and
	// triggers background refresh that fans out via SSE/events.
	gitWarmCache *git.WarmCache

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
	Composer          *composer.Service
	ComposerV2Mgr     *composer.Manager
	ComposerV2Bind    *composer.Bindings
	ConflictTracker   *conflict.Tracker
	collectorRegistry *collector.Registry
	Persona           *persona.Persona

	// AI context injection — initialized during Startup from DB connections.
	ctxProvider *graphctx.ContextProvider
	ctxInjector *strategies.ContextInjector

	// strategyEventCh fans out strategy selection events to the monitor TUI.
	strategyEventCh   chan tui.StrategyEvent
	strategyEventOnce sync.Once

	// File graph indexers — one per project, started in background during Startup.
	fileIndexers   map[string]*filegraph.Indexer // project ID → indexer
	fileIndexersMu sync.RWMutex

	// apiServer is the lightweight HTTP API for Claude Code hook communication.
	apiServer *api.Server

	// tsMap tracks which terminal panes are linked to which Claude sessions.
	// Updated by Linker events; used by the stream event hook to emit
	// terminal:activity events with pane IDs attached.
	tsMap *terminalSessionMap

	// shutdownOnce ensures graceful teardown (including factory reset) runs at most once.
	shutdownOnce sync.Once

	// windowFocused tracks whether the app window has focus. Used to gate
	// background pollers (GitHub, etc.) so they skip API calls when unfocused.
	windowFocused   bool
	windowFocusedMu sync.RWMutex

	// Native (libghostty) terminal state — lazily initialized on first
	// NativeTerminalCreate call when the feature flag is on. The map is
	// keyed by frontend pane (terminal) ID. See bindings_native_terminal.go.
	nativeTerminals  map[string]nativeTerminal
	nativeHost       nativeHostHandle
	ghosttyApp       ghosttyAppHandle
	nativeMu         sync.Mutex
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

// SetSessionCtrl injects the session controller before Wails calls Startup.
func (a *App) SetSessionCtrl(c *session.Controller) { a.SessionCtrl = c }

// SetComposer injects the composer service before Wails calls Startup.
func (a *App) SetComposer(c *composer.Service) { a.Composer = c }

// SetComposerV2 injects the V2 session manager and its Wails bindings.
func (a *App) SetComposerV2(mgr *composer.Manager, bindings *composer.Bindings) {
	a.ComposerV2Mgr = mgr
	a.ComposerV2Bind = bindings
}

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

// GetFileIndexers returns a snapshot of the live file indexer map.
// Safe to call before Startup (returns nil map) and concurrently.
func (a *App) GetFileIndexers() map[string]*filegraph.Indexer {
	a.fileIndexersMu.RLock()
	defer a.fileIndexersMu.RUnlock()
	return a.fileIndexers
}

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
	defer perf.Time(perf.RecordBoot)()
	a.ctx, a.cancel = context.WithCancel(ctx)
	a.terminalSubs = make(map[string]context.CancelFunc)
	a.tuiSessions = make(map[string]*tui.Session)
	a.prRefresh = make(chan struct{}, 1)
	a.branchRefresh = make(chan struct{}, 1)
	a.workflowRefresh = make(chan struct{}, 1)
	a.windowFocused = true

	// Inject Wails context into Composer V2 bindings so EventsEmit works.
	if a.ComposerV2Bind != nil {
		a.ComposerV2Bind.SetContext(ctx)
	}

	// One-time cleanup: clear poisoned performance data from pre-v2 builds
	// (the old code recorded success=true at selection time, not after verification)
	if a.DB != nil {
		if _, err := a.DB.Writer.Exec(`DELETE FROM ai_performance`); err != nil {
			log.Warn("app: failed to clear stale ai_performance", "err", err)
		}
	}

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

	// Initialize session controller tables.
	if a.SessionCtrl != nil {
		if err := a.SessionCtrl.Init(a.ctx); err != nil {
			log.Error("app: session controller init failed", "err", err)
		}
	}

	// Reap zombie Claude sessions: rows with status='active' whose underlying
	// process is gone. Happens when previous closed tabs left the session row
	// behind (pre-fix behaviour). Runs once at startup, fast.
	go a.reapZombieSessions()

	// Initialize AI graph context injection.
	if a.DB != nil {
		queries := db.New(a.DB.Reader)
		a.ctxProvider = graphctx.NewContextProvider(queries, a.DB.Reader)
		a.ctxInjector = strategies.NewContextInjector(a.ctxProvider)
		log.Info("app: AI context injector initialized")
	}

	// Initialize lazy file graph system (indexers start on demand, not at boot).
	if a.DB != nil {
		a.initFileGraph()
	}

	// Wire the AI engine into the Composer service so desktop turns get the
	// same strategy selection + decision recording the MCP server already
	// gives external Claude Code users. Mirrors cmd/phantom-mcp/main.go.
	a.wireComposerEngine()

	// Wire AI engine context injector into Composer V2 bindings so
	// user messages are enriched with codebase context and strategy
	// metadata is emitted to the frontend.
	if a.ComposerV2Bind != nil && a.ctxInjector != nil {
		a.ComposerV2Bind.SetContextEnricher(a.ctxInjector)
		log.Info("app: composer V2 context enricher wired")
	}


	// Initialize the conflict tracker and wire it into the Composer service
	// so simultaneous panes editing the same repo surface warnings.
	a.ConflictTracker = conflict.NewTracker(nil)
	if a.Composer != nil {
		a.Composer.SetConflictTracker(a.ConflictTracker)
	}

	// Start lightweight HTTP API server for Claude Code hook communication.
	a.startAPIServer()

	// Self-heal MCP registration on every boot. Cheap (single ~/.mcp.json
	// read), idempotent, and rewrites stale v1 entries left over from
	// pre-v2 installs without waiting for the user to flip a settings
	// toggle. Failures are logged, not fatal.
	go a.selfHealMCPRegistration()

	// Mark orphaned terminals (active in DB but no live PTY) as ended.
	// Handles crash recovery: terminals that were active when the app last exited.
	if a.DB != nil {
		q := db.New(a.DB.Writer)
		now := time.Now().Unix()
		if err := q.MarkOrphanedTerminalsEnded(a.ctx, sql.NullInt64{Int64: now, Valid: true}); err != nil {
			log.Error("app: mark orphaned terminals", "err", err)
		}
	}

	// Adopt any in-process orphans (no-op today; reserved for future detached-helper mode)
	// and start the 24h linger reaper for detached PTYs.
	if a.Terminal != nil {
		a.Terminal.AdoptOrphans(a.ctx)
		a.Terminal.StartReaper(a.ctx)

		// Wire Claude detection: when a user runs `claude` in a terminal,
		// the shell integration emits OSC 633;Claude;<args>. The terminal
		// session's readLoop detects it and invokes this callback, which
		// updates the Persona pill and emits a frontend event.
		a.Terminal.SetClaudeDetectedHandler(func(sessionID, args string) {
			log.Info("terminal: claude command detected", "terminal", sessionID, "args", args)

			// Update Persona pill state.
			if a.Persona != nil {
				label := "Claude"
				if args != "" {
					label = fmt.Sprintf("Claude: %s", truncateStr(args, 50))
				}
				a.Persona.OnClaudeDetectedInTerminal(label)
			}

			// Emit event so the frontend can show activity indicators.
			wailsRuntime.EventsEmit(a.ctx, "terminal:claude-started", map[string]interface{}{
				"terminalId": sessionID,
				"args":       args,
			})
		})
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

	// Initialize terminal ↔ session activity bridge (in-memory map + DB hydration).
	a.initTerminalActivityBridge()

	// Wire the Linker's link hook so the in-memory map stays in sync with
	// link/unlink operations and the frontend gets terminal:session-linked/unlinked events.
	if a.Linker != nil {
		a.Linker.SetLinkHook(func(paneID, sessionID string, linked bool) {
			if linked {
				a.onTerminalLinked(paneID, sessionID)
			} else {
				a.onTerminalUnlinked(paneID, sessionID)
			}
		})
	}

	// Wire stream event hook — activity detection + terminal activity + persona pill.
	if a.Stream != nil {
		a.Stream.SetEventHook(func(ctx context.Context, ev *stream.Event) {
			// Activity detection (async, zero-blocking) — runs for all providers.
			a.detectActivityEvents(ev)

			// Terminal activity bridge — emit terminal:activity for linked panes.
			a.emitTerminalActivity(ev)

			// Push real-time tool activity into the Persona pill so it shows
			// "Claude: editing auth.ts" instead of generic "1 Claude session(s)".
			if a.Persona != nil && ev != nil {
				summary := formatActivitySummary(ev)
				if summary != "" {
					a.Persona.OnTerminalActivity(summary)
				}
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

	// Priority pool + warm cache power the instant-switch UX. Status/branch/log
	// refreshes for the active project ride the high lane; background fetches
	// for other projects ride the low lane.
	a.gitPriorityPool = git.NewPriorityPool(a.ctx, 0)
	a.gitWarmCache = git.NewWarmCache(a.gitPriorityPool)
	a.gitWarmCache.SetCallbacks(
		func(repoPath string, _ *git.RepoStatus) {
			git.InvalidateStatusCache(repoPath)
			a.EmitGitStatus()
		},
		func(_ string, _ []git.BranchInfo) {
			a.EmitGitBranchChanged()
		},
		func(_ string, _ []git.CommitInfo) {
			a.EmitGitStatus()
		},
	)

	// Start persona proactive status polling (2s refresh loop).
	if a.Persona != nil {
		a.Persona.Start(a.ctx)
	}
}

func (a *App) DomReady(ctx context.Context) {
	wailsRuntime.EventsEmit(a.ctx, "app:ready", map[string]interface{}{
		"version": "0.1.1",
		"status":  "online",
	})
}

func (a *App) handleGitWatcherEvents() {
	// Throttle status refreshes so rapid filesystem events (e.g. multi-file
	// saves, rebase, stash) coalesce into one status check — VS Code's
	// @throttle pattern: at most one in-flight + one queued (latest-wins).
	statusThrottle := git.NewThrottle(func() {
		git.InvalidateAllStatusCaches()
		a.EmitGitStatus()
	})

	for event := range a.gitWatcher.Events() {
		switch event.Type {
		case git.GitEventBranchChanged:
			git.InvalidateAllStatusCaches()
			a.EmitGitBranchChanged()
			a.EmitGitStatus()
			if a.journal != nil {
				today := time.Now().Format("2006-01-02")
				ts := time.Now().Format("15:04")
				a.journal.AppendWorkLog(today, fmt.Sprintf("%s Switched branch", ts))
			}
			select {
			case a.branchRefresh <- struct{}{}:
			default:
			}
		case git.GitEventIndexChanged,
			git.GitEventStatusChanged,
			git.GitEventWorkingTreeChanged:
			// Coalesce rapid events — at most one status refresh runs at a
			// time, with one queued behind it (depth-1 latest-wins queue).
			statusThrottle.Trigger()
		}
	}
}

// initFileGraph sets up the lazy file graph system. Indexers are NOT started
// for all projects at boot — only when a project is activated or explicitly
// requested. This keeps resource usage low for users with many projects.
func (a *App) initFileGraph() {
	a.fileIndexersMu.Lock()
	a.fileIndexers = make(map[string]*filegraph.Indexer)
	a.fileIndexersMu.Unlock()

	// Wire the graph lookup into the context provider.
	if a.ctxProvider != nil {
		a.ctxProvider.SetGraphLookup(func(projectCwd string) graphctx.FileGraphReader {
			a.fileIndexersMu.RLock()
			defer a.fileIndexersMu.RUnlock()
			for _, ix := range a.fileIndexers {
				if strings.HasPrefix(projectCwd, ix.RootDir()) {
					return &fileGraphAdapter{graph: ix.Graph()}
				}
			}
			return nil
		})
		log.Info("app: file graph lookup wired (lazy mode)")
	}
}

// wireComposerEngine assembles orchestrator.Dependencies from the same
// knowledge stack the MCP server uses (cmd/phantom-mcp/main.go) and hands
// it to the Composer service. Each component is best-effort: a nil store
// degrades gracefully inside orchestrator.Process. The Indexer field is
// resolved per-turn from the turn's CWD via SetIndexerResolver, so the
// orchestrator sees graph context for whichever project the user is
// currently working in.
func (a *App) wireComposerEngine() {
	if a.Composer == nil || a.DB == nil {
		return
	}

	deps := orchestrator.Dependencies{}

	if ds, err := knowledge.NewDecisionStore(a.DB.Writer); err == nil {
		deps.Decisions = ds
	} else {
		log.Warn("app: composer engine — decision store init failed", "err", err)
	}

	if comp, err := knowledge.NewCompactor(a.DB.Writer); err == nil {
		// Wire LLM-powered pattern consolidation (graceful: nil key = skip).
		if apiKey, ok := composer.GetAnthropicAPIKey(); ok {
			comp.SetHaikuClient(knowledge.NewHaikuClient(apiKey))
		} else if envKey := os.Getenv("ANTHROPIC_API_KEY"); envKey != "" {
			comp.SetHaikuClient(knowledge.NewHaikuClient(envKey))
		}
		deps.Compactor = comp
	} else {
		log.Warn("app: composer engine — compactor init failed", "err", err)
	}

	perf := strategies.NewPerformanceStore()
	if err := perf.Load(a.DB.Reader); err != nil {
		log.Warn("app: composer engine — performance load failed (starting empty)", "err", err)
	}
	deps.Performance = perf

	autoTune := strategies.NewThresholdTracker()
	if err := autoTune.LoadThresholds(a.DB.Reader); err != nil {
		log.Warn("app: composer engine — auto-tune load failed (using defaults)", "err", err)
	}
	deps.AutoTune = autoTune

	// Wire Haiku-backed LLM assessor as the primary assessment path.
	// Prefers API key (faster, direct), falls back to CLI (uses existing auth),
	// then to keyword logic if neither is available.
	assessorInst := strategies.NewAssessor()
	assessorInst.SetThresholdTracker(autoTune)
	var haikuWired bool
	// Try 1: direct API key (fastest — ~150ms, no subprocess)
	var haikuAPIKey string
	if k, ok := composer.GetAnthropicAPIKey(); ok {
		haikuAPIKey = k
	} else if k := os.Getenv("ANTHROPIC_API_KEY"); k != "" {
		haikuAPIKey = k
	}
	if haikuAPIKey != "" {
		haikuClient := knowledge.NewHaikuClient(haikuAPIKey)
		haikuAssessor := assess.NewHaikuAssessorFromKnowledge(haikuClient)
		adapter := assess.NewStrategiesAdapter(haikuAssessor)
		assessorInst.SetLLMAssessor(adapter)
		log.Info("app: Haiku assessor wired via API key")
		haikuWired = true
	}
	// Try 2: claude CLI (uses existing auth — ~500ms with subprocess)
	if !haikuWired {
		cliClient := assess.NewCLIHaikuClient()
		if cliClient != nil {
			haikuAssessor := assess.NewHaikuAssessor(cliClient)
			adapter := assess.NewStrategiesAdapter(haikuAssessor)
			assessorInst.SetLLMAssessor(adapter)
			log.Info("app: Haiku assessor wired via claude CLI")
			haikuWired = true
		}
	}
	if !haikuWired {
		log.Info("app: Haiku assessor unavailable, using keyword fallback")
	}
	deps.Assessor = assessorInst

	deps.GapDetector = strategies.NewGapDetector()

	// Wire strategy registry with all 7 strategies so the orchestrator does
	// not have to rebuild a default on every turn.
	reg := strategies.NewRegistry()
	reg.Register(strategies.NewDirectStrategy(), 10)
	reg.Register(strategies.NewDecomposeStrategy(), 5)
	reg.Register(strategies.NewAdvisorStrategy(), 6)
	reg.Register(strategies.NewSelfRefineStrategy(), 4)
	reg.Register(strategies.NewTreeOfThoughtStrategy(), 3)
	reg.Register(strategies.NewDebateStrategy(), 7)
	reg.Register(strategies.NewGraphOfThoughtStrategy(), 8)
	if perf != nil {
		reg.SetPerformanceStore(perf)
	}
	deps.Registry = reg

	// Wire GlobalPatternStore for cross-project pattern awareness.
	home, _ := os.UserHomeDir()
	aiEngineDir := filepath.Join(home, branding.ConfigDirName, "ai-engine")
	if gps, err := knowledge.NewGlobalPatternStore(aiEngineDir); err == nil {
		deps.GlobalPatterns = gps
		log.Info("app: global pattern store initialized")
	} else {
		log.Warn("app: global pattern store init failed (cross-project patterns disabled)", "err", err)
	}

	// Build the detector coordinator and inject into deps.
	// BlastRadiusDetector holds a direct reference to a.fileIndexers — the map
	// is initialized by initFileGraph (which runs before wireComposerEngine) and
	// mutated in place by StartFileGraph, so entries added later are visible.
	// The detector takes its own read of the map at Detect() time, so no extra
	// locking is needed here at wire time.
	blastDet := &detect.BlastRadiusDetector{
		Indexers: a.fileIndexers,
	}
	var priorDet *detect.PriorOutcomeDetector
	if deps.Decisions != nil {
		priorDet = &detect.PriorOutcomeDetector{Decisions: deps.Decisions}
	}
	detectors := []detect.Detector{
		&detect.FileComplexityDetector{},
		blastDet,
		&detect.WorkTypeDetector{},
		&detect.BranchContextDetector{},
	}
	if priorDet != nil {
		detectors = append(detectors, priorDet)
	}
	deps.DetectorCoordinator = detect.NewCoordinator(detectors...)
	log.Info("app: detector coordinator wired", "detectors", len(detectors))

	a.Composer.SetEngineDeps(deps)
	a.Composer.SetIndexerResolver(a.resolveIndexerForCwd)

	// Wire session memory builder so new sessions get orientation from
	// knowledge stores. The Indexer is resolved per-turn via indexerResolver,
	// so we leave it nil here.
	a.Composer.SetMemoryBuilder(&composer.SessionMemoryBuilder{
		Decisions:      deps.Decisions,
		GlobalPatterns: deps.GlobalPatterns,
	})
	log.Info("app: composer engine wired (session memory enabled)")

	// Wire the same orchestrator deps into Composer V2 bindings so
	// tryEnrichAndEmitStrategy calls orchestrator.Process — the full
	// pipeline (assessor, strategy registry, knowledge stores) instead
	// of the lightweight ContextInjector.EnrichForProject.
	if a.apiServer != nil {
		a.apiServer.SetOrchestratorDeps(&deps)
	}

	if a.ComposerV2Bind != nil {
		a.ComposerV2Bind.SetEngineDeps(deps)
		a.ComposerV2Bind.SetIndexerResolver(a.resolveIndexerForCwd)
		a.ComposerV2Bind.SetStrategyCallback(func(name string, confidence float64, complexity, risk string, blastRadius int) {
			a.EmitStrategyEvent(tui.StrategyEvent{
				StrategyName: name,
				Confidence:   confidence,
				Complexity:   complexity,
				Risk:         risk,
				BlastRadius:  blastRadius,
				Timestamp:    time.Now(),
			})
		})
		log.Info("app: composer V2 orchestrator engine wired")
	}
}

// resolveIndexerForCwd maps a turn's CWD to the file-graph indexer of the
// project that owns it. Walks up the directory tree, matching each ancestor
// against project repo paths and workspace worktree paths. Returns nil when
// no project matches — orchestrator.Process handles a nil Indexer by
// skipping graph-derived signals.
//
// Called per-turn (cheap: handful of point lookups), never cached, so the
// user can switch active worktrees mid-session and pick up the right graph.
func (a *App) resolveIndexerForCwd(cwd string) *filegraph.Indexer {
	if a.DB == nil || cwd == "" {
		return nil
	}
	projectID := a.projectIDForCwd(cwd)
	if projectID == "" {
		log.Debug("app: composer indexer resolve — no project for cwd", "cwd", cwd)
		return nil
	}
	a.fileIndexersMu.RLock()
	ix := a.fileIndexers[projectID]
	a.fileIndexersMu.RUnlock()
	if ix == nil {
		log.Debug("app: composer indexer resolve — project has no indexer", "project", projectID)
	}
	return ix
}

// projectIDForCwd walks up from cwd looking for a project whose repo_path
// or workspace worktree_path equals the current ancestor. Returns "" when
// the path doesn't belong to any known project (e.g. the user is chatting
// from a directory outside their workspaces).
func (a *App) projectIDForCwd(cwd string) string {
	dir := linker.NormalizeCWD(cwd)
	if dir == "" {
		return ""
	}
	q := db.New(a.DB.Reader)
	for {
		if p, err := q.FindProjectByRepoPath(a.ctx, dir); err == nil {
			return p.ID
		}
		if id := a.matchWorkspaceWorktree(q, dir); id != "" {
			return id
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return ""
		}
		dir = parent
	}
}

// matchWorkspaceWorktree scans every project's workspaces for a worktree
// whose path equals dir. Mirrors internal/mcp/project.go.matchWorkspace —
// there's no global ListWorkspaces query and adding one would require a
// new schema migration. For typical Phantom installs (handful of projects,
// few workspaces each) the per-turn cost is negligible.
func (a *App) matchWorkspaceWorktree(q *db.Queries, dir string) string {
	projects, err := q.ListProjects(a.ctx)
	if err != nil {
		return ""
	}
	for _, p := range projects {
		wss, err := q.ListWorkspacesByProject(a.ctx, p.ID)
		if err != nil {
			continue
		}
		for _, w := range wss {
			if w.WorktreePath.Valid && w.WorktreePath.String == dir {
				return w.ProjectID
			}
		}
	}
	return ""
}

// startAPIServer creates and starts the HTTP API server that Claude Code hooks
// communicate with. It runs in a background goroutine and is tied to the app
// context for graceful shutdown.
func (a *App) startAPIServer() {
	// Build a decision store from the DB if available.
	var decisionStore *knowledge.DecisionStore
	if a.DB != nil {
		ds, err := knowledge.NewDecisionStore(a.DB.Writer)
		if err != nil {
			log.Warn("app: decision store init failed (api server will start without it)", "err", err)
		} else {
			decisionStore = ds
		}
	}

	// The indexer snapshot function captures a read-locked copy of the map.
	indexersFn := func() map[string]*filegraph.Indexer {
		a.fileIndexersMu.RLock()
		defer a.fileIndexersMu.RUnlock()
		cp := make(map[string]*filegraph.Indexer, len(a.fileIndexers))
		for k, v := range a.fileIndexers {
			cp[k] = v
		}
		return cp
	}

	var dbWriter *sql.DB
	if a.DB != nil {
		dbWriter = a.DB.Writer
	}

	listWorkspacesFn := func() []api.Workspace {
		if a.DB == nil {
			return nil
		}
		q := db.New(a.DB.Reader)
		projects, err := q.ListProjects(a.ctx)
		if err != nil {
			log.Warn("app: list workspaces for api failed", "err", err)
			return nil
		}
		out := make([]api.Workspace, 0, len(projects))
		for _, p := range projects {
			if p.RepoPath == "" {
				continue
			}
			out = append(out, api.Workspace{Name: p.Name, Path: p.RepoPath})
		}
		return out
	}

	a.apiServer = api.NewServer(api.DefaultPort, api.ServerDeps{
		FileIndexers:   indexersFn,
		DecisionStore:  decisionStore,
		DB:             dbWriter,
		ListWorkspaces: listWorkspacesFn,
		OnEvent: func(name string, data any) {
			wailsRuntime.EventsEmit(a.ctx, name, data)
		},
	})

	go func() {
		if err := a.apiServer.Start(a.ctx); err != nil && err != http.ErrServerClosed {
			log.Error("app: api server failed", "err", err)
		}
	}()
}

// selfHealMCPRegistration ensures phantom-ai is registered in ~/.mcp.json
// with the current binary path on every boot, and that all linked Phantom
// workspaces have the server enabled in their ~/.claude.json project entry.
// Failures are logged AND surfaced to the frontend via mcp:registration-failed
// so the user gets a toast pointing them at the Repair button instead of a
// silent "not registered" status.
func (a *App) selfHealMCPRegistration() {
	if err := integration.RegisterPhantomMCP(); err != nil {
		log.Error("app: mcp self-heal failed", "err", err)
		a.emitMCPFailure("register", err)
		return
	}
	log.Info("app: mcp self-heal complete")

	if a.DB == nil {
		return
	}
	q := db.New(a.DB.Reader)
	projects, err := q.ListProjects(a.ctx)
	if err != nil {
		log.Warn("app: mcp self-heal — list projects failed", "err", err)
		return
	}
	paths := make([]string, 0, len(projects))
	for _, p := range projects {
		if p.RepoPath != "" {
			paths = append(paths, p.RepoPath)
		}
	}
	updated, failed := integration.EnsureProjectsHaveMCP(paths)
	log.Info("app: mcp project enablement", "updated", updated, "failed", failed, "total", len(paths))
	if failed > 0 {
		a.emitMCPFailure("enable-projects", fmt.Errorf("%d of %d project(s) failed to enable phantom-ai (see logs)", failed, len(paths)))
	}
}

// emitMCPFailure surfaces an MCP registration error to the frontend via the
// mcp:registration-failed event. The frontend listener turns it into a toast
// pointing the user at the Repair button. Permission errors get an extra
// hint mentioning the offending file path so the user knows what to chown.
func (a *App) emitMCPFailure(phase string, err error) {
	if err == nil || a.ctx == nil {
		return
	}
	a.EmitMCPRegistrationFailed(phase, err.Error(), mcpErrorHint(err))
}

// mcpErrorHint returns a user-friendly remediation hint for known error
// shapes — primarily permission failures writing to ~/.mcp.json or
// ~/.claude/settings.json.
func mcpErrorHint(err error) string {
	if err == nil {
		return ""
	}
	if errors.Is(err, fs.ErrPermission) || strings.Contains(err.Error(), "permission denied") {
		return "Permission denied writing config. Check ownership of ~/.mcp.json and ~/.claude/settings.json, then click Repair."
	}
	if strings.Contains(err.Error(), "phantom-mcp binary not found") {
		return "Phantom couldn't locate the phantom-mcp helper binary. Reinstall Phantom or rebuild the helper, then click Repair."
	}
	return ""
}

// StartFileGraph starts (or restarts) the file graph indexer for a project.
// Called lazily when the user selects a project, or explicitly to refresh.
func (a *App) StartFileGraph(projectID string) map[string]interface{} {
	if a.DB == nil {
		return map[string]interface{}{"error": "database not available"}
	}

	q := db.New(a.DB.Reader)
	project, err := q.GetProject(a.ctx, projectID)
	if err != nil {
		return map[string]interface{}{"error": "project not found"}
	}

	wantRoot := linker.NormalizeCWD(project.RepoPath)

	a.fileIndexersMu.Lock()
	if existing, ok := a.fileIndexers[projectID]; ok {
		if linker.NormalizeCWD(existing.RootDir()) == wantRoot {
			// Sidebar refresh replaces project objects while bulk-adding repos; Solid
			// remounts rows and re-invokes StartFileGraph — restarting here would
			// re-index the same tree hundreds of times.
			a.fileIndexersMu.Unlock()
			log.Debug("app: file graph already running", "project", project.Name, "path", project.RepoPath)
			return map[string]interface{}{"started": true, "skipped": true, "project": project.Name}
		}
		a.fileIndexersMu.Unlock()
		existing.Stop()
		a.fileIndexersMu.Lock()
	}

	ix := filegraph.NewIndexer(project.RepoPath)
	if err := ix.Start(a.ctx); err != nil {
		a.fileIndexersMu.Unlock()
		log.Warn("app: file graph start failed", "project", project.Name, "err", err)
		return map[string]interface{}{"error": err.Error()}
	}
	a.fileIndexers[projectID] = ix
	a.fileIndexersMu.Unlock()

	log.Info("app: file graph started", "project", project.Name, "path", project.RepoPath)
	return map[string]interface{}{"started": true, "project": project.Name}
}

// StopFileGraph stops the file graph indexer for a project and frees resources.
func (a *App) StopFileGraph(projectID string) {
	a.fileIndexersMu.Lock()
	ix, ok := a.fileIndexers[projectID]
	if ok {
		delete(a.fileIndexers, projectID)
	}
	a.fileIndexersMu.Unlock()

	if ok {
		ix.Stop()
		log.Info("app: file graph stopped", "project", projectID)
	}
}

// RefreshFileGraph stops and restarts the indexer for a full re-index.
func (a *App) RefreshFileGraph(projectID string) map[string]interface{} {
	a.StopFileGraph(projectID)
	return a.StartFileGraph(projectID)
}

// fileGraphAdapter bridges filegraph.Graph to graphctx.FileGraphReader.
type fileGraphAdapter struct {
	graph *filegraph.Graph
}

func (a *fileGraphAdapter) Neighbors(path string, depth int) []graphctx.FileGraphNode {
	neighbors := a.graph.Neighbors(path, depth)
	result := make([]graphctx.FileGraphNode, 0, len(neighbors))
	for _, n := range neighbors {
		syms := make([]string, 0, len(n.Symbols))
		for _, s := range n.Symbols {
			syms = append(syms, s.Name)
		}
		result = append(result, graphctx.FileGraphNode{
			Path:     n.Path,
			Language: n.Language,
			Symbols:  syms,
		})
	}
	return result
}

func (a *fileGraphAdapter) SymbolLookup(name string) []graphctx.FileGraphNode {
	nodes := a.graph.SymbolLookup(name)
	result := make([]graphctx.FileGraphNode, 0, len(nodes))
	for _, n := range nodes {
		syms := make([]string, 0, len(n.Symbols))
		for _, s := range n.Symbols {
			syms = append(syms, s.Name)
		}
		result = append(result, graphctx.FileGraphNode{
			Path:     n.Path,
			Language: n.Language,
			Symbols:  syms,
		})
	}
	return result
}

// GetFileGraphStats returns indexing stats for a project (exposed to frontend).
func (a *App) GetFileGraphStats(projectID string) map[string]interface{} {
	a.fileIndexersMu.RLock()
	ix, ok := a.fileIndexers[projectID]
	a.fileIndexersMu.RUnlock()

	if !ok {
		return map[string]interface{}{"indexed": false}
	}

	files, symbols, edges := ix.Graph().Stats()
	return map[string]interface{}{
		"indexed":  true,
		"indexing": ix.IsIndexing(),
		"files":    files,
		"symbols":  symbols,
		"edges":    edges,
	}
}

// FileGraphNeighbors returns dependency neighbors for a file path.
func (a *App) FileGraphNeighbors(projectID, filePath string, depth int) []map[string]interface{} {
	a.fileIndexersMu.RLock()
	ix, ok := a.fileIndexers[projectID]
	a.fileIndexersMu.RUnlock()

	if !ok {
		return nil
	}

	neighbors := ix.Graph().Neighbors(filePath, depth)
	result := make([]map[string]interface{}, 0, len(neighbors))
	for _, n := range neighbors {
		syms := make([]string, 0, len(n.Symbols))
		for _, s := range n.Symbols {
			syms = append(syms, s.Name)
		}
		result = append(result, map[string]interface{}{
			"path":     n.Path,
			"language": n.Language,
			"symbols":  syms,
		})
	}
	return result
}

func (a *App) Shutdown(ctx context.Context) {
	a.shutdownOnce.Do(func() {
		a.doTeardown(true)
	})
}

// doTeardown stops background services in a safe order. When persistTerminalState
// is false (factory reset), terminal scrollback is not written to disk or DB.
func (a *App) doTeardown(persistTerminalState bool) {
	// Shutdown order: file indexers → snapshots → collectors → terminals → DB.

	a.fileIndexersMu.RLock()
	indexers := make([]*filegraph.Indexer, 0, len(a.fileIndexers))
	for _, ix := range a.fileIndexers {
		indexers = append(indexers, ix)
	}
	a.fileIndexersMu.RUnlock()
	for _, ix := range indexers {
		ix.Stop()
	}

	if a.Terminal != nil {
		if persistTerminalState {
			a.saveTerminalSnapshots()
			a.saveScrollbacksToDB()
		} else {
			_ = os.Remove(snapshotPath())
			_ = os.Remove(snapshotPath() + ".tmp")
		}
	}

	a.terminalSubsMu.Lock()
	for _, cancel := range a.terminalSubs {
		cancel()
	}
	clear(a.terminalSubs)
	a.terminalSubsMu.Unlock()

	if a.gitWatcher != nil {
		a.gitWatcher.Stop()
	}

	if a.gitPriorityPool != nil {
		a.gitPriorityPool.Stop()
	}

	if a.collectorRegistry != nil {
		a.collectorRegistry.StopAll()
	}

	if a.Stream != nil {
		a.Stream.StopAll()
	}

	// Stop all Composer V2 sessions before terminals are destroyed.
	if a.ComposerV2Mgr != nil {
		a.ComposerV2Mgr.CloseAll()
	}

	if a.Terminal != nil {
		a.Terminal.DestroyAll()
	}

	a.tuiSessionsMu.Lock()
	for id, sess := range a.tuiSessions {
		sess.Close()
		delete(a.tuiSessions, id)
	}
	a.tuiSessionsMu.Unlock()

	a.shutdownNativeTerminals()

	if a.cancel != nil {
		a.cancel()
	}

	if a.DB != nil {
		if err := a.DB.Close(); err != nil {
			log.Error("app: close db failed", "err", err)
		}
		a.DB = nil
	}
}

// QuitApp is called by the frontend after the shutdown ceremony completes.
func (a *App) QuitApp() {
	wailsRuntime.Quit(a.ctx)
}

// GetShutdownStats returns session stats for the shutdown ceremony display.
func (a *App) GetShutdownStats() map[string]interface{} {
	result := map[string]interface{}{
		"session_count": 0,
		"total_tokens":  int64(0),
		"total_cost":    float64(0),
		"uptime":        "",
	}
	if a.DB == nil {
		return result
	}

	q := db.New(a.DB.Reader)
	allSessions, err := q.ListSessions(a.ctx)
	if err != nil {
		return result
	}

	todayStart := time.Date(time.Now().Year(), time.Now().Month(), time.Now().Day(), 0, 0, 0, 0, time.Local).Unix()
	var count int
	var totalTokens int64
	var totalCostMicros int64
	for _, s := range allSessions {
		if s.StartedAt.Valid && s.StartedAt.Int64 >= todayStart {
			count++
			if s.InputTokens.Valid {
				totalTokens += s.InputTokens.Int64
			}
			if s.OutputTokens.Valid {
				totalTokens += s.OutputTokens.Int64
			}
			if s.EstimatedCostMicros.Valid {
				totalCostMicros += s.EstimatedCostMicros.Int64
			}
		}
	}
	result["session_count"] = count
	result["total_tokens"] = totalTokens
	result["total_cost"] = float64(totalCostMicros) / 1_000_000

	if a.startTime.IsZero() {
		result["uptime"] = ""
	} else {
		dur := time.Since(a.startTime)
		if dur >= time.Hour {
			result["uptime"] = fmt.Sprintf("%dh%dm", int(dur.Hours()), int(dur.Minutes())%60)
		} else {
			result["uptime"] = fmt.Sprintf("%dm", int(dur.Minutes()))
		}
	}

	return result
}

func snapshotPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, branding.ConfigDirName, "terminal-snapshots.json")
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
		Version:    "0.1.1",
		UptimeMs:   time.Since(a.startTime).Milliseconds(),
		WsPort:     9741,
		GoVersion:  runtime.Version(),
		Goroutines: runtime.NumGoroutine(),
		MemAllocMB: float64(m.Alloc) / 1024 / 1024,
	}
}

// OnWindowFocused is called by the frontend when the app window gains focus.
// It re-enables full-speed background polling (GitHub, etc.).
func (a *App) OnWindowFocused() {
	a.windowFocusedMu.Lock()
	a.windowFocused = true
	a.windowFocusedMu.Unlock()
	log.Debug("app/OnWindowFocused: window gained focus")
}

// OnWindowBlurred is called by the frontend when the app window loses focus.
// Background pollers will skip API calls and use a slower tick interval.
func (a *App) OnWindowBlurred() {
	a.windowFocusedMu.Lock()
	a.windowFocused = false
	a.windowFocusedMu.Unlock()
	log.Debug("app/OnWindowBlurred: window lost focus")
}

// isWindowFocused returns whether the app window currently has focus.
func (a *App) isWindowFocused() bool {
	a.windowFocusedMu.RLock()
	defer a.windowFocusedMu.RUnlock()
	return a.windowFocused
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
