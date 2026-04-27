// jsonl_scanner.go parses JSONL conversation logs under the provider's
// conversations directory to extract token usage, cost estimates, and tool
// breakdowns per session.
// Author: Subash Karki
package collector

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/provider"
)

const (
	activeContextDebounce         = 2 * time.Second
	activeContextFallbackInterval = 30 * time.Second
	activeContextRewatchInterval  = 60 * time.Second
)


// rescanMaxAttempts caps how many times periodicRescan will retry a session
// that's missing tokens or model data. Raised from 5 to 20 so short sessions
// that eventually get an assistant turn are still captured.
const rescanMaxAttempts = 20

// JSONLScanner scans JSONL conversation files and enriches sessions with
// token usage, cost estimates, message counts, and tool breakdowns.
type JSONLScanner struct {
	queries   *db.Queries
	prov      provider.Provider
	ctx       context.Context
	cancel    context.CancelFunc
	emitEvent func(name string, data interface{})

	mu             sync.Mutex
	rescanAttempts map[string]int // session ID → retry count
}

// NewJSONLScanner creates a new scanner. queries must be backed by db.Writer.
func NewJSONLScanner(queries *db.Queries, prov provider.Provider, emitEvent func(string, interface{})) *JSONLScanner {
	return &JSONLScanner{
		queries:        queries,
		prov:           prov,
		emitEvent:      emitEvent,
		rescanAttempts: make(map[string]int),
	}
}

func (js *JSONLScanner) Name() string { return "jsonl-scanner" }

// Start performs an initial scan and launches periodic rescan and active polling goroutines.
func (js *JSONLScanner) Start(ctx context.Context) error {
	js.ctx, js.cancel = context.WithCancel(ctx)

	// Initial full scan
	js.fullScan()

	// Periodic rescan for sessions with 0 tokens (every 60s)
	go js.periodicRescan()

	// Active context poller (every 10s)
	go js.activeContextPoller()

	log.Printf("jsonl_scanner: started")
	return nil
}

// Stop cancels all background goroutines.
func (js *JSONLScanner) Stop() error {
	if js.cancel != nil {
		js.cancel()
	}
	return nil
}

// projectsDir returns the conversations directory from the provider.
func (js *JSONLScanner) projectsDir() string {
	return js.prov.ConversationsDir()
}

// fullScan walks the conversations directory and processes every .jsonl file found.
func (js *JSONLScanner) fullScan() {
	root := js.projectsDir()
	if _, err := os.Stat(root); os.IsNotExist(err) {
		log.Printf("jsonl_scanner: projects dir %s does not exist, skipping initial scan", root)
		return
	}

	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil // skip unreadable entries
		}
		if d.IsDir() || !strings.HasSuffix(d.Name(), ".jsonl") {
			return nil
		}
		js.processJSONLFile(path)
		return nil
	})
	if err != nil {
		log.Printf("jsonl_scanner: walk error: %v", err)
	}
}

// sessionIDFromPath extracts the session ID from a JSONL filename.
// The filename (without extension) is the session ID.
func sessionIDFromPath(path string) string {
	base := filepath.Base(path)
	return strings.TrimSuffix(base, ".jsonl")
}

// jsonlLine represents a single line in a JSONL conversation file.
type jsonlLine struct {
	Type     string          `json:"type"`
	Role     string          `json:"role"`
	Model    string          `json:"model"`
	Message  json.RawMessage `json:"message"`
	ToolName string          `json:"tool_name"`
	Usage    *usageBlock     `json:"usage"`
	Content  json.RawMessage `json:"content"`
}

// assistantMessage is the shape of assistant messages that may carry usage.
type assistantMessage struct {
	Usage   *usageBlock `json:"usage"`
	Model   string      `json:"model"`
	Content []struct {
		Type string `json:"type"`
		Name string `json:"name"`
	} `json:"content"`
}

type usageBlock struct {
	InputTokens              int64 `json:"input_tokens"`
	OutputTokens             int64 `json:"output_tokens"`
	CacheCreationInputTokens int64 `json:"cache_creation_input_tokens"`
	CacheReadInputTokens     int64 `json:"cache_read_input_tokens"`
}

// scanResult holds aggregated data from scanning a JSONL file.
type scanResult struct {
	InputTokens  int64
	OutputTokens int64
	CacheRead    int64
	CacheWrite   int64
	MessageCount int64
	ToolUseCount int64
	Model        string
	FirstPrompt  string
	ToolBreakdown map[string]int
}

// processJSONLFile stream-parses a JSONL file and upserts token data.
func (js *JSONLScanner) processJSONLFile(path string) {
	sessionID := sessionIDFromPath(path)
	if sessionID == "" {
		return
	}

	// Skip sessions already fully enriched (tokens AND model both populated).
	// Don't skip on tokens alone — model may still need backfilling if it was
	// empty on the first write.
	if existing, err := js.queries.GetSession(js.ctx, sessionID); err == nil {
		if existing.InputTokens.Valid && existing.InputTokens.Int64 > 0 &&
			existing.Model.Valid && existing.Model.String != "" {
			return
		}
	}

	result, err := js.scanFile(path)
	if err != nil {
		log.Printf("jsonl_scanner: scan %s: %v", path, err)
		return
	}

	if result.InputTokens == 0 && result.OutputTokens == 0 {
		return // nothing to update
	}

	costMicros := js.calculateCostMicros(result)

	// Serialize tool breakdown to JSON
	toolBreakdownJSON := ""
	if len(result.ToolBreakdown) > 0 {
		if b, err := json.Marshal(result.ToolBreakdown); err == nil {
			toolBreakdownJSON = string(b)
		}
	}

	// Get existing session to preserve fields not set by the scanner
	existing, getErr := js.queries.GetSession(js.ctx, sessionID)
	if getErr != nil {
		// Session may not exist yet in DB — skip enrichment for now,
		// the periodic rescan will catch it later.
		return
	}

	if err := js.queries.UpdateSessionEnrichment(js.ctx, db.UpdateSessionEnrichmentParams{
		ID:                  sessionID,
		Model:               nullStringOr(result.Model, existing.Model),
		InputTokens:         sql.NullInt64{Int64: result.InputTokens, Valid: true},
		OutputTokens:        sql.NullInt64{Int64: result.OutputTokens, Valid: true},
		CacheReadTokens:     sql.NullInt64{Int64: result.CacheRead, Valid: true},
		CacheWriteTokens:    sql.NullInt64{Int64: result.CacheWrite, Valid: true},
		EstimatedCostMicros: sql.NullInt64{Int64: costMicros, Valid: true},
		MessageCount:        sql.NullInt64{Int64: result.MessageCount, Valid: true},
		ToolUseCount:        sql.NullInt64{Int64: result.ToolUseCount, Valid: true},
		FirstPrompt:         nullStringOr(result.FirstPrompt, existing.FirstPrompt),
		ToolBreakdown:       nullStringOr(toolBreakdownJSON, existing.ToolBreakdown),
		LastInputTokens:     sql.NullInt64{Int64: result.InputTokens, Valid: true},
	}); err != nil {
		log.Printf("jsonl_scanner: update session %s: %v", sessionID, err)
	}
}

// scanFile stream-parses a JSONL file line-by-line using bufio.Scanner.
func (js *JSONLScanner) scanFile(path string) (*scanResult, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	result := &scanResult{
		ToolBreakdown: make(map[string]int),
	}

	scanner := bufio.NewScanner(f)
	// 10MB max: Claude lines can contain thinking signatures, base64 images, large tool outputs
	scanner.Buffer(make([]byte, 0, 64*1024), 10*1024*1024)

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		js.parseLine(line, result)
	}

	return result, scanner.Err()
}

// parseLine processes a single JSONL line and accumulates into the result.
func (js *JSONLScanner) parseLine(line []byte, result *scanResult) {
	var entry jsonlLine
	if err := json.Unmarshal(line, &entry); err != nil {
		return // skip malformed lines
	}

	switch {
	case entry.Type == "human" || entry.Role == "human" || entry.Role == "user":
		result.MessageCount++
		// Capture first prompt
		if result.FirstPrompt == "" {
			result.FirstPrompt = extractTextContent(entry.Content, line)
		}

	case entry.Type == "assistant" || entry.Role == "assistant":
		result.MessageCount++

		// Extract usage from top-level usage field
		if entry.Usage != nil {
			result.InputTokens += entry.Usage.InputTokens
			result.OutputTokens += entry.Usage.OutputTokens
			result.CacheRead += entry.Usage.CacheReadInputTokens
			result.CacheWrite += entry.Usage.CacheCreationInputTokens
		}

		// Try nested message.usage
		if entry.Message != nil {
			var msg assistantMessage
			if err := json.Unmarshal(entry.Message, &msg); err == nil {
				if msg.Usage != nil && entry.Usage == nil {
					result.InputTokens += msg.Usage.InputTokens
					result.OutputTokens += msg.Usage.OutputTokens
					result.CacheRead += msg.Usage.CacheReadInputTokens
					result.CacheWrite += msg.Usage.CacheCreationInputTokens
				}
				if msg.Model != "" {
					result.Model = msg.Model
				}
				// Count tool uses from content blocks
				for _, c := range msg.Content {
					if c.Type == "tool_use" {
						result.ToolUseCount++
						if c.Name != "" {
							result.ToolBreakdown[c.Name]++
						}
					}
				}
			}
		}

		// Top-level model
		if entry.Model != "" {
			result.Model = entry.Model
		}

	case entry.Type == "tool_use":
		result.ToolUseCount++
		if entry.ToolName != "" {
			result.ToolBreakdown[entry.ToolName]++
		}

	case entry.Type == "tool_result":
		// tool results don't count as messages or tools
	}
}

// extractTextContent tries to get a text string from the content field.
func extractTextContent(content json.RawMessage, fullLine []byte) string {
	if len(content) > 0 {
		// Try plain string
		var s string
		if err := json.Unmarshal(content, &s); err == nil && s != "" {
			return truncate(s, 500)
		}
		// Try array of content blocks
		var blocks []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		}
		if err := json.Unmarshal(content, &blocks); err == nil {
			for _, b := range blocks {
				if b.Type == "text" && b.Text != "" {
					return truncate(b.Text, 500)
				}
			}
		}
	}

	// Fallback: try top-level "message" field as string
	var wrapper struct {
		Message string `json:"message"`
	}
	if err := json.Unmarshal(fullLine, &wrapper); err == nil && wrapper.Message != "" {
		return truncate(wrapper.Message, 500)
	}

	return ""
}

// truncate is defined in activity_poller.go (same package)

// calculateCostMicros computes estimated cost in microdollars using the provider.
func (js *JSONLScanner) calculateCostMicros(r *scanResult) int64 {
	return js.prov.CalculateCost(r.Model, provider.TokenUsage{
		Input:      r.InputTokens,
		Output:     r.OutputTokens,
		CacheRead:  r.CacheRead,
		CacheWrite: r.CacheWrite,
	})
}

// periodicRescan re-processes sessions with 0 tokens every 60 seconds.
func (js *JSONLScanner) periodicRescan() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-js.ctx.Done():
			return
		case <-ticker.C:
			js.rescan()
		}
	}
}

func (js *JSONLScanner) rescan() {
	sessions, err := js.queries.ListSessions(js.ctx)
	if err != nil {
		log.Printf("jsonl_scanner: list sessions for rescan: %v", err)
		return
	}

	rescanned := 0

	// Build set of active session IDs for cleanup.
	activeIDs := make(map[string]struct{}, len(sessions))
	for _, s := range sessions {
		activeIDs[s.ID] = struct{}{}
	}

	for _, s := range sessions {
		// Skip only if fully enriched (both tokens AND model populated).
		// Rescan sessions missing either tokens or model.
		hasTokens := s.InputTokens.Valid && s.InputTokens.Int64 > 0
		hasModel := s.Model.Valid && s.Model.String != ""
		if hasTokens && hasModel {
			continue
		}

		js.mu.Lock()
		attempts := js.rescanAttempts[s.ID]
		if attempts >= rescanMaxAttempts {
			js.mu.Unlock()
			continue
		}
		js.rescanAttempts[s.ID] = attempts + 1
		js.mu.Unlock()

		// Search for the JSONL file via the provider
		jsonlPath, err := js.prov.FindConversationFile(s.ID, "")
		if err != nil || jsonlPath == "" {
			continue
		}

		js.processJSONLFile(jsonlPath)
		rescanned++
	}

	// Evict entries for sessions that are no longer tracked or have hit max
	// retries, so rescanAttempts doesn't grow without bound.
	js.mu.Lock()
	for id, attempts := range js.rescanAttempts {
		if _, active := activeIDs[id]; !active || attempts >= rescanMaxAttempts {
			delete(js.rescanAttempts, id)
		}
	}
	js.mu.Unlock()

	if rescanned > 0 {
		js.emitEvent(EventJSONLRescan, map[string]interface{}{
			"rescanned": rescanned,
		})
	}
}

// findJSONLFile locates a JSONL file for a session via the provider.
func (js *JSONLScanner) findJSONLFile(sessionID string) string {
	path, err := js.prov.FindConversationFile(sessionID, "")
	if err != nil {
		return ""
	}
	return path
}

// activeContextPoller watches project dirs for JSONL changes via fsnotify and
// re-scans token/cost data. Falls back to 10s polling if fsnotify fails.
func (js *JSONLScanner) activeContextPoller() {
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Printf("jsonl_scanner: fsnotify unavailable for active context, polling: %v", err)
		js.activeContextPoll()
		return
	}
	defer watcher.Close()

	js.watchProjectDirs(watcher)

	var debounceTimer *time.Timer
	debounceCh := make(chan struct{}, 1)
	fallback := time.NewTicker(activeContextFallbackInterval)
	defer fallback.Stop()

	rewatch := time.NewTicker(activeContextRewatchInterval)
	defer rewatch.Stop()

	for {
		select {
		case <-js.ctx.Done():
			if debounceTimer != nil {
				debounceTimer.Stop()
			}
			return

		case ev, ok := <-watcher.Events:
			if !ok {
				return
			}
			if !strings.HasSuffix(ev.Name, ".jsonl") {
				continue
			}
			if !ev.Has(fsnotify.Write) && !ev.Has(fsnotify.Create) {
				continue
			}
			if debounceTimer != nil {
				debounceTimer.Stop()
			}
			debounceTimer = time.AfterFunc(activeContextDebounce, func() {
				select {
				case debounceCh <- struct{}{}:
				default:
				}
			})

		case <-debounceCh:
			js.pollActiveContext()

		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			log.Printf("jsonl_scanner: active context watcher error: %v", err)

		case <-fallback.C:
			js.pollActiveContext()

		case <-rewatch.C:
			js.watchProjectDirs(watcher)
		}
	}
}

// activeContextPoll is the legacy 10s polling fallback.
func (js *JSONLScanner) activeContextPoll() {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-js.ctx.Done():
			return
		case <-ticker.C:
			js.pollActiveContext()
		}
	}
}

// watchProjectDirs adds fsnotify watches on conversations subdirectories.
func (js *JSONLScanner) watchProjectDirs(watcher *fsnotify.Watcher) {
	root := js.projectsDir()
	entries, err := os.ReadDir(root)
	if err != nil {
		return
	}
	for _, e := range entries {
		if e.IsDir() {
			_ = watcher.Add(filepath.Join(root, e.Name()))
		}
	}
}

func (js *JSONLScanner) pollActiveContext() {
	sessions, err := js.queries.ListActiveSessions(js.ctx)
	if err != nil {
		log.Printf("jsonl_scanner: list active for polling: %v", err)
		return
	}

	for _, s := range sessions {
		jsonlPath := js.findJSONLFile(s.ID)
		if jsonlPath == "" {
			continue
		}

		result, err := js.tailScan(jsonlPath)
		if err != nil {
			continue
		}

		if result.InputTokens == 0 {
			continue
		}

		costMicros := js.calculateCostMicros(result)

		if err := js.queries.UpdateSessionTokens(js.ctx, db.UpdateSessionTokensParams{
			ID:                  s.ID,
			InputTokens:         sql.NullInt64{Int64: result.InputTokens, Valid: true},
			OutputTokens:        sql.NullInt64{Int64: result.OutputTokens, Valid: true},
			CacheReadTokens:     sql.NullInt64{Int64: result.CacheRead, Valid: true},
			CacheWriteTokens:    sql.NullInt64{Int64: result.CacheWrite, Valid: true},
			EstimatedCostMicros: sql.NullInt64{Int64: costMicros, Valid: true},
			MessageCount:        sql.NullInt64{Int64: result.MessageCount, Valid: true},
			ToolUseCount:        sql.NullInt64{Int64: result.ToolUseCount, Valid: true},
			LastInputTokens:     sql.NullInt64{Int64: result.InputTokens, Valid: true},
			ContextUsedPct:      s.ContextUsedPct, // preserve existing
		}); err != nil {
			log.Printf("jsonl_scanner: update active context %s: %v", s.ID, err)
			continue
		}

		// Backfill model if the scan found one and the DB doesn't have it yet.
		// Use UpdateSessionEnrichment which never touches status or ended_at,
		// avoiding the race with session_watcher.
		if result.Model != "" && (!s.Model.Valid || s.Model.String == "") {
			if err := js.queries.UpdateSessionEnrichment(js.ctx, db.UpdateSessionEnrichmentParams{
				ID:                  s.ID,
				Model:               sql.NullString{String: result.Model, Valid: true},
				InputTokens:         sql.NullInt64{Int64: result.InputTokens, Valid: true},
				OutputTokens:        sql.NullInt64{Int64: result.OutputTokens, Valid: true},
				CacheReadTokens:     sql.NullInt64{Int64: result.CacheRead, Valid: true},
				CacheWriteTokens:    sql.NullInt64{Int64: result.CacheWrite, Valid: true},
				EstimatedCostMicros: sql.NullInt64{Int64: costMicros, Valid: true},
				MessageCount:        sql.NullInt64{Int64: result.MessageCount, Valid: true},
				ToolUseCount:        sql.NullInt64{Int64: result.ToolUseCount, Valid: true},
				FirstPrompt:         s.FirstPrompt,
				ToolBreakdown:       s.ToolBreakdown,
				LastInputTokens:     sql.NullInt64{Int64: result.InputTokens, Valid: true},
			}); err != nil {
				log.Printf("jsonl_scanner: backfill model for %s: %v", s.ID, err)
			}
		}

		js.emitEvent(EventSessionContext, map[string]interface{}{
			"sessionId":   s.ID,
			"inputTokens": result.InputTokens,
			"costMicros":  costMicros,
		})
	}
}

// tailScan reads the last 50KB of a JSONL file and parses for token data.
// This gives an efficient approximation for active sessions without reading
// the entire (potentially large) conversation log.
func (js *JSONLScanner) tailScan(path string) (*scanResult, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	// Seek to last 50KB
	const tailSize = 50 * 1024
	info, err := f.Stat()
	if err != nil {
		return nil, err
	}

	offset := int64(0)
	if info.Size() > tailSize {
		offset = info.Size() - tailSize
	}

	if _, err := f.Seek(offset, io.SeekStart); err != nil {
		return nil, err
	}

	// If we seeked into the middle, skip the first (likely partial) line
	result := &scanResult{
		ToolBreakdown: make(map[string]int),
	}
	scanner := bufio.NewScanner(f)
	// 10MB max: Claude lines can contain thinking signatures, base64 images, large tool outputs
	scanner.Buffer(make([]byte, 0, 64*1024), 10*1024*1024)

	first := true
	for scanner.Scan() {
		if first && offset > 0 {
			first = false
			continue // skip partial first line after seeking
		}
		first = false
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		js.parseLine(line, result)
	}

	return result, scanner.Err()
}

// ListSessions is a convenience wrapper used by the rescan loop.
// This uses the reader-backed queries if available. For now we rely on
// the writer-backed queries passed at construction, which works correctly
// for single-connection setups.
func (js *JSONLScanner) listSessions() ([]db.Session, error) {
	return js.queries.ListSessions(js.ctx)
}
