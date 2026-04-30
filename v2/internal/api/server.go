// Package api provides a lightweight HTTP API server for Phantom.
// It exposes the endpoints that Claude Code hooks (prompt-enricher,
// outcome-capture, file-changed, feedback-detector, async-analyzer,
// post-edit-verifier) call at http://localhost:3849/api/...
//
// The server uses stdlib net/http only — no frameworks.
//
// Author: Subash Karki
package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/ai/graph/filegraph"
	"github.com/subashkarki/phantom-os-v2/internal/ai/knowledge"
)

// DefaultPort is the port hooks expect.
const DefaultPort = 3849

// FallbackPort is tried when DefaultPort is busy (e.g. v1 server running).
const FallbackPort = 3850

// ServerDeps holds external dependencies injected at construction time.
type ServerDeps struct {
	// FileIndexers provides graph queries per project. The map key is the
	// project ID. The caller must supply a function that returns a snapshot
	// to avoid shared-lock complexity.
	FileIndexers func() map[string]*filegraph.Indexer

	// DecisionStore persists AI strategy decisions and outcomes.
	DecisionStore *knowledge.DecisionStore

	// DB is the SQLite writer connection for preferences.
	DB *sql.DB
}

// hookHealthEntry records the last health report from a hook.
type hookHealthEntry struct {
	Hook      string    `json:"hook"`
	Status    string    `json:"status"`
	Error     string    `json:"error,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

// Server is a lightweight HTTP server for hook communication.
type Server struct {
	port   int
	mux    *http.ServeMux
	server *http.Server
	deps   ServerDeps

	hookHealthMu sync.RWMutex
	hookHealth   map[string]hookHealthEntry

	errorsMu sync.RWMutex
	errors   []errorEntry

	// editGate tracks phantom_before_edit "touches" so the edit-gate hook
	// can permit edits to files that were just analysed.
	editGate *EditGateStore
}

// errorEntry is a structured error log entry.
type errorEntry struct {
	Source    string    `json:"source"`
	Message  string    `json:"message"`
	Timestamp time.Time `json:"timestamp"`
}

// NewServer creates a new API server with the given port and dependencies.
func NewServer(port int, deps ServerDeps) *Server {
	s := &Server{
		port:       port,
		mux:        http.NewServeMux(),
		deps:       deps,
		hookHealth: make(map[string]hookHealthEntry),
		editGate:   NewEditGateStore(),
	}
	s.registerRoutes()
	return s
}

// Start listens on the configured port and serves until the context is
// cancelled. If the primary port is busy it falls back to FallbackPort.
// The method returns http.ErrServerClosed on graceful shutdown.
func (s *Server) Start(ctx context.Context) error {
	addr := fmt.Sprintf("localhost:%d", s.port)
	listener, err := net.Listen("tcp", addr)
	if err != nil {
		// Port busy — try fallback.
		slog.Warn("🧠 api: primary port busy, trying fallback",
			"port", s.port, "fallback", FallbackPort, "err", err)
		s.port = FallbackPort
		addr = fmt.Sprintf("localhost:%d", s.port)
		listener, err = net.Listen("tcp", addr)
		if err != nil {
			return fmt.Errorf("api: listen on %s: %w", addr, err)
		}
	}

	s.server = &http.Server{Handler: s.mux}
	slog.Info("🧠 api: server started", "addr", addr)

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := s.server.Shutdown(shutdownCtx); err != nil {
			slog.Error("🧠 api: shutdown error", "err", err)
		}
	}()

	return s.server.Serve(listener)
}

// Port returns the port the server is (or will be) listening on.
func (s *Server) Port() int {
	return s.port
}

// registerRoutes wires all HTTP endpoints.
func (s *Server) registerRoutes() {
	// Health
	s.mux.HandleFunc("GET /health", s.handleHealth)

	// AI Preferences (hooks check toggles here)
	s.mux.HandleFunc("GET /api/preferences/ai", s.handleGetAIPrefs)
	s.mux.HandleFunc("PUT /api/preferences/ai", s.handleSetAIPrefs)

	// Hook health reporting
	s.mux.HandleFunc("GET /api/hook-health", s.handleGetHookHealth)
	s.mux.HandleFunc("POST /api/hook-health/report", s.handleReportHookHealth)

	s.mux.HandleFunc("POST /api/edit-gate/touch", s.handleEditGateTouch)
	s.mux.HandleFunc("GET /api/edit-gate/check", s.handleEditGateCheck)

	// Graph (for prompt-enricher hook)
	s.mux.HandleFunc("GET /api/graph/auto/context", s.handleGraphAutoContext)
	s.mux.HandleFunc("POST /api/graph/auto/incremental", s.handleGraphAutoIncremental)
	s.mux.HandleFunc("GET /api/graph/stats/all", s.handleGraphStatsAll)
	s.mux.HandleFunc("GET /api/graph/{projectId}/context", s.handleGraphContext)
	s.mux.HandleFunc("GET /api/graph/{projectId}/blast-radius", s.handleGraphBlastRadius)

	// Orchestrator (for outcome capture + feedback)
	s.mux.HandleFunc("POST /api/orchestrator/record-outcome", s.handleRecordOutcome)
	s.mux.HandleFunc("POST /api/orchestrator/record-feedback", s.handleRecordFeedback)
	s.mux.HandleFunc("POST /api/orchestrator/check-retry", s.handleCheckRetry)
	s.mux.HandleFunc("GET /api/orchestrator/{projectId}/history", s.handleOrchestratorHistory)

	// Verification (for post-edit-verifier hook)
	s.mux.HandleFunc("POST /api/verify/queue", s.handleVerifyQueue)
	s.mux.HandleFunc("GET /api/verify/latest", s.handleVerifyLatest)

	// Errors (for structured error logging)
	s.mux.HandleFunc("GET /api/errors", s.handleGetErrors)
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"version": "2.0.0",
		"port":    s.port,
	})
}

// ---------------------------------------------------------------------------
// AI Preferences
// ---------------------------------------------------------------------------

// defaultAIPrefs are the fallback preference values when no DB row exists.
var defaultAIPrefs = map[string]bool{
	"ai.autoContext":     true,
	"ai.editGate":        true,
	"ai.outcomeCapture":  true,
	"ai.fileSync":        true,
	"ai.mcpTools":        true,
}

func (s *Server) handleGetAIPrefs(w http.ResponseWriter, _ *http.Request) {
	start := time.Now()
	slog.Info("🧠 Preferences query", "type", "get-ai-prefs")

	prefs := make(map[string]bool, len(defaultAIPrefs))
	for k, v := range defaultAIPrefs {
		prefs[k] = v
	}

	if s.deps.DB != nil {
		rows, err := s.deps.DB.Query("SELECT key, value FROM user_preferences WHERE key LIKE 'ai.%'")
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var k, v string
				if err := rows.Scan(&k, &v); err == nil {
					prefs[k] = v == "true"
				}
			}
		}
	}

	slog.Info("🧠 Preferences done", "type", "get-ai-prefs", "ms", time.Since(start).Milliseconds())
	writeJSON(w, http.StatusOK, prefs)
}

func (s *Server) handleSetAIPrefs(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	slog.Info("🧠 Preferences update", "type", "set-ai-prefs")

	var body map[string]bool
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}

	if s.deps.DB == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "database not available"})
		return
	}

	now := time.Now().Unix()
	for k, v := range body {
		val := "false"
		if v {
			val = "true"
		}
		_, err := s.deps.DB.Exec(
			"INSERT INTO user_preferences (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
			k, val, now,
		)
		if err != nil {
			slog.Warn("🧠 Preferences write error", "key", k, "err", err)
		}
	}

	slog.Info("🧠 Preferences updated", "type", "set-ai-prefs", "count", len(body), "ms", time.Since(start).Milliseconds())
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---------------------------------------------------------------------------
// Hook Health
// ---------------------------------------------------------------------------

func (s *Server) handleGetHookHealth(w http.ResponseWriter, _ *http.Request) {
	s.hookHealthMu.RLock()
	defer s.hookHealthMu.RUnlock()

	entries := make([]hookHealthEntry, 0, len(s.hookHealth))
	for _, e := range s.hookHealth {
		entries = append(entries, e)
	}
	writeJSON(w, http.StatusOK, entries)
}

func (s *Server) handleReportHookHealth(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Hook   string `json:"hook"`
		Status string `json:"status"`
		Error  string `json:"error,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}

	if body.Status == "success" {
		slog.Info("🧠 Hook fired", "hook", body.Hook, "status", "✓")
	} else {
		slog.Warn("🧠 Hook failed", "hook", body.Hook, "error", body.Error)
	}

	s.hookHealthMu.Lock()
	s.hookHealth[body.Hook] = hookHealthEntry{
		Hook:      body.Hook,
		Status:    body.Status,
		Error:     body.Error,
		Timestamp: time.Now(),
	}
	s.hookHealthMu.Unlock()

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ---------------------------------------------------------------------------
// Graph — Auto Context (search across all projects)
// ---------------------------------------------------------------------------

func (s *Server) handleGraphAutoContext(w http.ResponseWriter, r *http.Request) {
	file := r.URL.Query().Get("file")
	if file == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "file query param required"})
		return
	}

	start := time.Now()
	slog.Info("🧠 Graph query", "type", "auto-context", "file", file)

	scores := make(map[string]float64)
	var modules []string

	indexers := s.getIndexers()
	for _, ix := range indexers {
		g := ix.Graph()
		neighbors := g.Neighbors(file, 1)
		if len(neighbors) > 0 {
			for i, n := range neighbors {
				scores[n.Path] = 1.0 / float64(i+2)
			}
			break // found in this project
		}
	}

	ms := time.Since(start).Milliseconds()
	slog.Info("🧠 Graph done", "type", "auto-context", "file", file, "results", len(scores), "ms", ms)

	writeJSON(w, http.StatusOK, map[string]any{
		"scores":  scores,
		"modules": modules,
	})
}

// handleGraphAutoIncremental triggers an incremental re-index for a changed file.
func (s *Server) handleGraphAutoIncremental(w http.ResponseWriter, r *http.Request) {
	var body struct {
		File string `json:"file"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.File == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "file field required"})
		return
	}

	start := time.Now()
	slog.Info("🧠 Graph incremental", "file", body.File)

	// Re-parse the file and upsert into the matching indexer's graph.
	indexers := s.getIndexers()
	updated := false
	for _, ix := range indexers {
		if len(body.File) > len(ix.RootDir()) && body.File[:len(ix.RootDir())] == ix.RootDir() {
			node := filegraph.ParseFile(body.File)
			if node != nil {
				ix.Graph().Upsert(node)
				updated = true
			}
			break
		}
	}

	ms := time.Since(start).Milliseconds()
	slog.Info("🧠 Graph incremental done", "file", body.File, "updated", updated, "ms", ms)
	writeJSON(w, http.StatusOK, map[string]bool{"updated": updated})
}

// handleGraphStatsAll returns graph stats for all indexed projects.
func (s *Server) handleGraphStatsAll(w http.ResponseWriter, _ *http.Request) {
	start := time.Now()
	slog.Info("🧠 Graph stats", "type", "all")

	type projectStats struct {
		ProjectID string `json:"project_id"`
		Indexing  bool   `json:"indexing"`
		Files     int    `json:"files"`
		Symbols   int    `json:"symbols"`
		Edges     int    `json:"edges"`
	}

	indexers := s.getIndexers()
	result := make([]projectStats, 0, len(indexers))
	for id, ix := range indexers {
		files, symbols, edges := ix.Graph().Stats()
		result = append(result, projectStats{
			ProjectID: id,
			Indexing:  ix.IsIndexing(),
			Files:     files,
			Symbols:   symbols,
			Edges:     edges,
		})
	}

	ms := time.Since(start).Milliseconds()
	slog.Info("🧠 Graph stats done", "projects", len(result), "ms", ms)
	writeJSON(w, http.StatusOK, result)
}

// handleGraphContext returns neighbors for a file within a specific project.
func (s *Server) handleGraphContext(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectId")
	file := r.URL.Query().Get("file")
	depthStr := r.URL.Query().Get("depth")

	if file == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "file query param required"})
		return
	}

	depth := 1
	if d, err := strconv.Atoi(depthStr); err == nil && d > 0 && d <= 3 {
		depth = d
	}

	start := time.Now()
	slog.Info("🧠 Graph context", "project", projectID, "file", file, "depth", depth)

	indexers := s.getIndexers()
	ix, ok := indexers[projectID]
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "project not indexed"})
		return
	}

	neighbors := ix.Graph().Neighbors(file, depth)
	result := make([]map[string]any, 0, len(neighbors))
	for _, n := range neighbors {
		syms := make([]string, 0, len(n.Symbols))
		for _, sym := range n.Symbols {
			syms = append(syms, sym.Name)
		}
		result = append(result, map[string]any{
			"path":     n.Path,
			"language": n.Language,
			"symbols":  syms,
		})
	}

	ms := time.Since(start).Milliseconds()
	slog.Info("🧠 Graph context done", "project", projectID, "file", file, "results", len(result), "ms", ms)
	writeJSON(w, http.StatusOK, result)
}

// handleGraphBlastRadius returns files affected by changes to a given file.
func (s *Server) handleGraphBlastRadius(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectId")
	file := r.URL.Query().Get("file")

	if file == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "file query param required"})
		return
	}

	start := time.Now()
	slog.Info("🧠 Graph blast-radius", "project", projectID, "file", file)

	indexers := s.getIndexers()
	ix, ok := indexers[projectID]
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "project not indexed"})
		return
	}

	// Blast radius = depth-2 neighbors (imports + importers + their dependents).
	neighbors := ix.Graph().Neighbors(file, 2)
	paths := make([]string, 0, len(neighbors))
	for _, n := range neighbors {
		paths = append(paths, n.Path)
	}

	ms := time.Since(start).Milliseconds()
	slog.Info("🧠 Graph blast-radius done", "project", projectID, "file", file, "affected", len(paths), "ms", ms)
	writeJSON(w, http.StatusOK, map[string]any{
		"file":     file,
		"affected": paths,
		"count":    len(paths),
	})
}

// ---------------------------------------------------------------------------
// Orchestrator — Outcome Capture + Feedback
// ---------------------------------------------------------------------------

func (s *Server) handleRecordOutcome(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Goal       string  `json:"goal"`
		StrategyID string  `json:"strategy_id"`
		Confidence float64 `json:"confidence"`
		Complexity string  `json:"complexity"`
		Risk       string  `json:"risk"`
		Success    bool    `json:"success"`
		Error      string  `json:"error,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}

	start := time.Now()
	slog.Info("🧠 Outcome capture", "goal", body.Goal, "strategy", body.StrategyID, "success", body.Success)

	if s.deps.DecisionStore == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "decision store not available"})
		return
	}

	decisionID, err := s.deps.DecisionStore.Record(body.Goal, body.StrategyID, body.Confidence, body.Complexity, body.Risk)
	if err != nil {
		slog.Error("🧠 Outcome record failed", "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	if err := s.deps.DecisionStore.RecordOutcome(decisionID, body.Success, body.Error); err != nil {
		slog.Error("🧠 Outcome result failed", "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	ms := time.Since(start).Milliseconds()
	slog.Info("🧠 Outcome captured", "decision_id", decisionID, "ms", ms)
	writeJSON(w, http.StatusOK, map[string]any{"decision_id": decisionID, "ok": true})
}

func (s *Server) handleRecordFeedback(w http.ResponseWriter, r *http.Request) {
	var body struct {
		DecisionID string `json:"decision_id"`
		Success    bool   `json:"success"`
		Reason     string `json:"reason,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}

	start := time.Now()
	slog.Info("🧠 Feedback received", "decision_id", body.DecisionID, "success", body.Success)

	if s.deps.DecisionStore == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "decision store not available"})
		return
	}

	if err := s.deps.DecisionStore.RecordOutcome(body.DecisionID, body.Success, body.Reason); err != nil {
		slog.Error("🧠 Feedback record failed", "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	ms := time.Since(start).Milliseconds()
	slog.Info("🧠 Feedback recorded", "decision_id", body.DecisionID, "ms", ms)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleCheckRetry(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Goal string `json:"goal"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}

	start := time.Now()
	slog.Info("🧠 Check retry", "goal", body.Goal)

	if s.deps.DecisionStore == nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"failed_approaches": []any{},
			"suggestion":        "no decision store — proceed freely",
		})
		return
	}

	failures, err := s.deps.DecisionStore.GetFailedApproaches(body.Goal)
	if err != nil {
		slog.Error("🧠 Check retry failed", "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	approaches := make([]map[string]any, 0, len(failures))
	for _, f := range failures {
		approaches = append(approaches, map[string]any{
			"strategy_id": f.StrategyID,
			"created_at":  f.CreatedAt.Format(time.RFC3339),
		})
	}

	suggestion := "no previous failures — proceed freely"
	if len(approaches) > 0 {
		suggestion = fmt.Sprintf("avoid these %d previously failed strategies", len(approaches))
	}

	ms := time.Since(start).Milliseconds()
	slog.Info("🧠 Check retry done", "goal", body.Goal, "failures", len(approaches), "ms", ms)
	writeJSON(w, http.StatusOK, map[string]any{
		"failed_approaches": approaches,
		"suggestion":        suggestion,
	})
}

func (s *Server) handleOrchestratorHistory(w http.ResponseWriter, r *http.Request) {
	projectID := r.PathValue("projectId")
	start := time.Now()
	slog.Info("🧠 Orchestrator history", "project", projectID)

	if s.deps.DecisionStore == nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}

	// Return recent decisions (similarity search with empty goal returns recent).
	decisions, err := s.deps.DecisionStore.FindSimilar("", 0, 50)
	if err != nil {
		slog.Error("🧠 History query failed", "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	result := make([]map[string]any, 0, len(decisions))
	for _, d := range decisions {
		result = append(result, map[string]any{
			"id":          d.ID,
			"goal":        d.Goal,
			"strategy_id": d.StrategyID,
			"confidence":  d.Confidence,
			"complexity":  d.Complexity,
			"risk":        d.Risk,
			"created_at":  d.CreatedAt.Format(time.RFC3339),
		})
	}

	ms := time.Since(start).Milliseconds()
	slog.Info("🧠 History done", "project", projectID, "results", len(result), "ms", ms)
	writeJSON(w, http.StatusOK, result)
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

// verifyEntry tracks queued and completed verification results.
type verifyEntry struct {
	ID        string    `json:"id"`
	File      string    `json:"file"`
	Status    string    `json:"status"` // "queued", "running", "passed", "failed"
	Error     string    `json:"error,omitempty"`
	QueuedAt  time.Time `json:"queued_at"`
	DoneAt    time.Time `json:"done_at,omitempty"`
}

func (s *Server) handleVerifyQueue(w http.ResponseWriter, r *http.Request) {
	var body struct {
		File   string `json:"file"`
		Reason string `json:"reason,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}

	slog.Info("🧠 Verify queued", "file", body.File, "reason", body.Reason)

	// For now, acknowledge the queue request. The actual verification runs
	// through the file graph indexer's incremental re-index pipeline.
	writeJSON(w, http.StatusOK, map[string]any{
		"queued": true,
		"file":   body.File,
	})
}

func (s *Server) handleVerifyLatest(w http.ResponseWriter, _ *http.Request) {
	slog.Info("🧠 Verify latest query")

	// Return a summary of indexer states as a proxy for verification status.
	indexers := s.getIndexers()
	anyIndexing := false
	for _, ix := range indexers {
		if ix.IsIndexing() {
			anyIndexing = true
			break
		}
	}

	status := "idle"
	if anyIndexing {
		status = "indexing"
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":   status,
		"projects": len(indexers),
	})
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

func (s *Server) handleGetErrors(w http.ResponseWriter, _ *http.Request) {
	s.errorsMu.RLock()
	defer s.errorsMu.RUnlock()

	writeJSON(w, http.StatusOK, s.errors)
}

// RecordError adds a structured error entry (callable from outside the server).
func (s *Server) RecordError(source, message string) {
	s.errorsMu.Lock()
	defer s.errorsMu.Unlock()

	s.errors = append(s.errors, errorEntry{
		Source:    source,
		Message:   message,
		Timestamp: time.Now(),
	})

	// Keep last 100 errors.
	if len(s.errors) > 100 {
		s.errors = s.errors[len(s.errors)-100:]
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// getIndexers safely retrieves the current file indexer map via the deps
// function. Returns an empty map if the function is nil.
func (s *Server) getIndexers() map[string]*filegraph.Indexer {
	if s.deps.FileIndexers == nil {
		return make(map[string]*filegraph.Indexer)
	}
	return s.deps.FileIndexers()
}

// writeJSON encodes a value as JSON and writes it with the given status code.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("🧠 api: json encode error", "err", err)
	}
}
