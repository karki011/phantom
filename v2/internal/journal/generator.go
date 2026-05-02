// JournalGenerator — Generates morning brief and end-of-day recap.
// Pulls data from git, sessions DB, tasks, and gh CLI per project.
// Author: Subash Karki
package journal

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/ai/extractor"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/provider"
)

// ProjectInfo holds the minimal project data the generator needs.
type ProjectInfo struct {
	ID       string
	Name     string
	RepoPath string
}

// Generator creates morning brief and end-of-day content using
// git/gh commands and DB queries (sessions, tasks, worktrees).
type Generator struct {
	queries      *db.Queries
	aiGatherer   *AIDigestGatherer
	prov         provider.Provider
	extractions  []*extractor.ExtractionResult
	extractionMu sync.Mutex
}

// NewGenerator creates a Generator backed by a read-only Queries handle.
func NewGenerator(q *db.Queries) *Generator {
	return &Generator{queries: q}
}

// NewGeneratorWithDB creates a Generator with AI digest capabilities.
// The rawDB is needed for AI digest queries against graph_meta and activity_log.
func NewGeneratorWithDB(q *db.Queries, rawDB db.DBTX) *Generator {
	return &Generator{
		queries:    q,
		aiGatherer: NewAIDigestGatherer(q, rawDB),
	}
}

// SetProvider attaches an AI provider for narrative enrichment. Optional —
// when nil, EnrichEndOfDay is a no-op and the journal stays at the
// deterministic recap level.
func (g *Generator) SetProvider(p provider.Provider) {
	g.prov = p
}

// Provider returns the attached provider (may be nil).
func (g *Generator) Provider() provider.Provider {
	return g.prov
}

// AddExtraction records an extraction result for inclusion in the daily
// digest. Thread-safe — called from session-completion goroutines.
func (g *Generator) AddExtraction(result *extractor.ExtractionResult) {
	if result == nil {
		return
	}
	g.extractionMu.Lock()
	defer g.extractionMu.Unlock()
	g.extractions = append(g.extractions, result)
}

// Extractions returns a snapshot of all extraction results added so far.
func (g *Generator) Extractions() []*extractor.ExtractionResult {
	g.extractionMu.Lock()
	defer g.extractionMu.Unlock()
	out := make([]*extractor.ExtractionResult, len(g.extractions))
	copy(out, g.extractions)
	return out
}

// EnrichEndOfDay runs the configured AI provider over the deterministic
// end-of-day recap and returns a prose narrative. Synchronous — call from
// a goroutine if you need non-blocking behaviour. Returns "" + error if
// no provider is configured, the command fails, or the timeout expires.
//
// Timeout is bounded at 60s so a hung CLI never wedges the caller.
func (g *Generator) EnrichEndOfDay(ctx context.Context, recap string) (string, error) {
	if g.prov == nil {
		return "", fmt.Errorf("journal: no provider configured for enrichment")
	}
	if strings.TrimSpace(recap) == "" {
		return "", fmt.Errorf("journal: empty recap, nothing to enrich")
	}

	prompt := buildEnrichmentPrompt(recap)
	// Escape single quotes for the shell command template (typical pattern:
	// `claude --print -p '${PROMPT}'`).
	escaped := strings.ReplaceAll(prompt, `'`, `'\''`)
	cmdLine := g.prov.AIGenerateCommand(escaped)
	if strings.TrimSpace(cmdLine) == "" {
		return "", fmt.Errorf("journal: provider returned empty command")
	}

	enrichCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	c := exec.CommandContext(enrichCtx, "sh", "-c", cmdLine)
	out, err := c.Output()
	if err != nil {
		return "", fmt.Errorf("journal: enrichment exec: %w", err)
	}
	narrative := strings.TrimSpace(string(out))
	if narrative == "" {
		return "", fmt.Errorf("journal: enrichment produced empty narrative")
	}
	slog.Info("journal: enrichment complete", "bytes", len(narrative))
	return narrative, nil
}

// buildEnrichmentPrompt produces a focused prompt asking the LLM to
// summarise the structured recap into a 4-6 sentence narrative.
func buildEnrichmentPrompt(recap string) string {
	return strings.Join([]string{
		"You are summarising a developer's day from a structured journal recap.",
		"Write 4-6 sentences in plain prose, second person ('you'). Highlight what",
		"the developer accomplished, the main friction points, and any in-flight work.",
		"Do not add bullet lists, headers, or new facts not present in the recap.",
		"Do not preface with 'Here is your summary' — start directly with the narrative.",
		"",
		"Structured recap:",
		recap,
	}, "\n")
}

// run executes a shell command with a 10s timeout. Returns empty string on error.
func run(cmd string, cwd string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	c := exec.CommandContext(ctx, "sh", "-c", cmd)
	if cwd != "" {
		c.Dir = cwd
	}
	out, err := c.Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func formatCost(micros int64) string {
	return fmt.Sprintf("$%.2f", float64(micros)/1_000_000)
}

func todayStr() string {
	return time.Now().Format("2006-01-02")
}

func yesterdayStr() string {
	return time.Now().AddDate(0, 0, -1).Format("2006-01-02")
}

func pluralize(n int, singular string) string {
	if n == 1 {
		return fmt.Sprintf("%d %s", n, singular)
	}
	return fmt.Sprintf("%d %ss", n, singular)
}

// --------------------------------------------------------------------------
// Morning Brief
// --------------------------------------------------------------------------

// GenerateMorningBrief builds the morning brief text: what happened since yesterday.
// If filterProject is non-empty, only the matching project is included.
func (g *Generator) GenerateMorningBrief(ctx context.Context, projects []ProjectInfo, filterProject ...string) string {
	if len(filterProject) > 0 && filterProject[0] != "" {
		var filtered []ProjectInfo
		for _, p := range projects {
			if p.Name == filterProject[0] {
				filtered = append(filtered, p)
			}
		}
		projects = filtered
	}
	var lines []string
	lines = append(lines, "Since yesterday:")

	yesterday := time.Now().AddDate(0, 0, -1)
	yesterday = time.Date(yesterday.Year(), yesterday.Month(), yesterday.Day(), 0, 0, 0, 0, time.Local)
	yesterdayEpoch := yesterday.Unix()

	// --- Per-project git data (grouped) ---
	for _, p := range projects {
		projectLines := g.collectProjectGit(p)
		if len(projectLines) > 0 {
			lines = append(lines, "")
			lines = append(lines, fmt.Sprintf("**[%s]**", p.Name))
			lines = append(lines, projectLines...)
		}
	}

	// --- Session data (since yesterday) ---
	lines = append(lines, "")
	g.morningSessionData(ctx, &lines, yesterdayEpoch)

	// --- Completed tasks since yesterday ---
	g.morningTasks(ctx, &lines, yesterdayEpoch)

	// --- Active worktrees ---
	g.morningWorktrees(&lines, projects)

	// --- AI Engine Insights (yesterday's data) ---
	if g.aiGatherer != nil {
		aiData := g.aiGatherer.GatherAIDigestData(ctx, yesterdayStr())
		aiSection := FormatAIDigestSection(aiData)
		if aiSection != "" {
			lines = append(lines, "")
			lines = append(lines, aiSection)
		}
	}

	// --- Session Intelligence (extraction data) ---
	if extractionSection := DailyExtractionDigest(g.Extractions()); extractionSection != "" {
		lines = append(lines, "")
		lines = append(lines, extractionSection)
	}

	// --- Yesterday's terminal activity ---
	if termSection := FormatTerminalFactsSection(GatherTerminalFacts(yesterdayStr())); termSection != "" {
		lines = append(lines, "")
		lines = append(lines, termSection)
	}

	// Fallback
	bulletCount := 0
	for _, l := range lines {
		if strings.HasPrefix(l, "- ") {
			bulletCount++
		}
	}
	if bulletCount == 0 {
		lines = append(lines, "- No activity detected since yesterday")
	}

	return strings.Join(lines, "\n")
}

func (g *Generator) collectProjectGit(p ProjectInfo) []string {
	var lines []string

	// Commits since yesterday
	commitLog := run(`git log --since="yesterday" --oneline --format="%s"`, p.RepoPath)
	commits := filterEmpty(strings.Split(commitLog, "\n"))
	branch := run("git rev-parse --abbrev-ref HEAD", p.RepoPath)

	if len(commits) > 0 {
		lines = append(lines, fmt.Sprintf("- %s on %s", pluralize(len(commits), "commit"), orDefault(branch, "unknown")))
		top := commits
		if len(top) > 3 {
			top = top[:3]
		}
		for _, msg := range top {
			lines = append(lines, fmt.Sprintf("  · %s", msg))
		}
		if len(commits) > 3 {
			lines = append(lines, fmt.Sprintf("  · ...and %d more", len(commits)-3))
		}
	}

	// Lines changed
	numstat := run(`git log --since="yesterday" --numstat --format=""`, p.RepoPath)
	if numstat != "" {
		added, removed := parseNumstat(numstat)
		if added > 0 || removed > 0 {
			lines = append(lines, fmt.Sprintf("- +%d / -%d lines", added, removed))
		}
	}

	// Open PRs
	openPrJSON := run(`gh pr list --state open --json title,number,url --limit 5`, p.RepoPath)
	if openPrJSON != "" {
		var prs []struct {
			Title  string `json:"title"`
			Number int    `json:"number"`
			URL    string `json:"url"`
		}
		if json.Unmarshal([]byte(openPrJSON), &prs) == nil {
			for _, pr := range prs {
				lines = append(lines, fmt.Sprintf("- [PR #%d](%s) open: \"%s\"", pr.Number, pr.URL, pr.Title))
			}
		}
	}

	// CI status
	ciJSON := run(`gh run list --branch main --limit 1 --json conclusion`, p.RepoPath)
	if ciJSON != "" {
		var runs []struct {
			Conclusion string `json:"conclusion"`
		}
		if json.Unmarshal([]byte(ciJSON), &runs) == nil && len(runs) > 0 && runs[0].Conclusion != "" {
			lines = append(lines, fmt.Sprintf("- CI: %s on main", runs[0].Conclusion))
		}
	}

	// Stale branches (>7 days)
	staleRaw := run(`git for-each-ref --sort=-committerdate --format="%(refname:short) %(committerdate:relative)" refs/heads/ | head -20`, p.RepoPath)
	if staleRaw != "" {
		staleCount := 0
		for _, line := range strings.Split(staleRaw, "\n") {
			if strings.Contains(line, "weeks ago") || strings.Contains(line, "months ago") || strings.Contains(line, "week ago") || strings.Contains(line, "month ago") {
				staleCount++
			}
		}
		if staleCount > 0 {
			lines = append(lines, fmt.Sprintf("- %s (>1 week)", pluralize(staleCount, "stale branch")))
		}
	}

	return lines
}

func (g *Generator) morningSessionData(ctx context.Context, lines *[]string, sinceEpoch int64) {
	sessions, err := g.queries.ListSessionsByDate(ctx, sql.NullString{String: yesterdayStr(), Valid: true})
	if err != nil {
		return
	}

	sessionCount := len(sessions)
	var totalCost int64
	var totalTokens int64
	for _, s := range sessions {
		if s.EstimatedCostMicros.Valid {
			totalCost += s.EstimatedCostMicros.Int64
		}
		if s.InputTokens.Valid {
			totalTokens += s.InputTokens.Int64
		}
		if s.OutputTokens.Valid {
			totalTokens += s.OutputTokens.Int64
		}
	}

	if sessionCount > 0 {
		tokenStr := formatTokensK(totalTokens)
		*lines = append(*lines, fmt.Sprintf("- %s, %s spent, %s tokens", pluralize(sessionCount, "session"), formatCost(totalCost), tokenStr))

		// Per-session first prompt summaries — shows what each session was about.
		for _, s := range sessions {
			if s.FirstPrompt.Valid && s.FirstPrompt.String != "" {
				prompt := s.FirstPrompt.String
				// Skip system prompts (XML-like content injected by tooling)
				if strings.HasPrefix(prompt, "<") {
					continue
				}
				if len(prompt) > 80 {
					prompt = prompt[:80] + "..."
				}
				*lines = append(*lines, fmt.Sprintf("  · %s", prompt))
			}
		}
	}
}

func (g *Generator) morningTasks(ctx context.Context, lines *[]string, sinceEpoch int64) {
	// We query completed tasks by looking at sessions from yesterday
	// and counting completed_tasks from those sessions.
	sessions, _ := g.queries.ListSessionsByDate(ctx, sql.NullString{String: yesterdayStr(), Valid: true})
	var completedCount int64
	for _, s := range sessions {
		if s.CompletedTasks.Valid {
			completedCount += s.CompletedTasks.Int64
		}
	}
	if completedCount > 0 {
		*lines = append(*lines, fmt.Sprintf("- %d task%s completed", completedCount, pluralS(completedCount)))
	}
}

func (g *Generator) morningWorktrees(lines *[]string, projects []ProjectInfo) {
	totalWorktrees := 0
	for _, p := range projects {
		raw := run("git worktree list --porcelain", p.RepoPath)
		if raw != "" {
			// Each worktree block starts with "worktree "
			count := strings.Count(raw, "worktree ")
			if count > 1 { // subtract the main worktree
				totalWorktrees += count
			}
		}
	}
	if totalWorktrees > 0 {
		*lines = append(*lines, fmt.Sprintf("- %s", pluralize(totalWorktrees, "active worktree")))
	}
}

// --------------------------------------------------------------------------
// End of Day
// --------------------------------------------------------------------------

// GenerateEndOfDay builds the end-of-day recap text: what happened today.
// If filterProject is non-empty, only the matching project is included.
func (g *Generator) GenerateEndOfDay(ctx context.Context, projects []ProjectInfo, filterProject ...string) string {
	if len(filterProject) > 0 && filterProject[0] != "" {
		var filtered []ProjectInfo
		for _, p := range projects {
			if p.Name == filterProject[0] {
				filtered = append(filtered, p)
			}
		}
		projects = filtered
	}
	var lines []string

	var totalCommits, totalAdded, totalRemoved, totalFilesChanged int
	var totalSessionCount int
	var totalCostMicros, totalTokens, totalToolUses int64

	var projectLines []string
	for _, p := range projects {
		g.eodProjectGit(&projectLines, p, &totalCommits, &totalAdded, &totalRemoved, &totalFilesChanged)
	}

	// --- Session data ---
	sessions, _ := g.queries.ListSessionsByDate(ctx, sql.NullString{String: todayStr(), Valid: true})
	totalSessionCount = len(sessions)
	for _, s := range sessions {
		if s.EstimatedCostMicros.Valid {
			totalCostMicros += s.EstimatedCostMicros.Int64
		}
		if s.InputTokens.Valid {
			totalTokens += s.InputTokens.Int64
		}
		if s.OutputTokens.Valid {
			totalTokens += s.OutputTokens.Int64
		}
		if s.ToolUseCount.Valid {
			totalToolUses += s.ToolUseCount.Int64
		}
	}

	// --- Summary header ---
	lines = append(lines,
		fmt.Sprintf("Today: %s, %s touched, +%d/-%d lines",
			pluralize(totalCommits, "commit"),
			pluralize(totalFilesChanged, "file"),
			totalAdded, totalRemoved),
	)
	lines = append(lines,
		fmt.Sprintf("Sessions: %d, %s spent, %s tokens, %d tool calls",
			totalSessionCount, formatCost(totalCostMicros), formatTokensK(totalTokens), totalToolUses),
	)

	// Per-session first prompt summaries — shows what each session worked on.
	for _, s := range sessions {
		if s.FirstPrompt.Valid && s.FirstPrompt.String != "" {
			prompt := s.FirstPrompt.String
			// Skip system prompts (XML-like content injected by tooling)
			if strings.HasPrefix(prompt, "<") {
				continue
			}
			if len(prompt) > 80 {
				prompt = prompt[:80] + "..."
			}
			lines = append(lines, fmt.Sprintf("  · %s", prompt))
		}
	}

	if len(projectLines) > 0 {
		lines = append(lines, "")
		lines = append(lines, projectLines...)
	}

	// --- Tasks completed today ---
	var completedCount int64
	for _, s := range sessions {
		if s.CompletedTasks.Valid {
			completedCount += s.CompletedTasks.Int64
		}
	}
	if completedCount > 0 {
		lines = append(lines, "")
		lines = append(lines, fmt.Sprintf("Tasks completed: %d", completedCount))
	}

	// --- Pending tasks ---
	// Count all tasks from today's sessions that are not completed
	var pendingCount int64
	for _, s := range sessions {
		if s.TaskCount.Valid && s.CompletedTasks.Valid {
			pending := s.TaskCount.Int64 - s.CompletedTasks.Int64
			if pending > 0 {
				pendingCount += pending
			}
		}
	}
	if pendingCount > 0 {
		lines = append(lines, fmt.Sprintf("- %d task%s still pending", pendingCount, pluralS(pendingCount)))
	}

	// --- AI Engine Insights (today's data) ---
	if g.aiGatherer != nil {
		aiData := g.aiGatherer.GatherAIDigestData(ctx, todayStr())

		aiSection := FormatAIDigestSection(aiData)
		if aiSection != "" {
			lines = append(lines, "")
			lines = append(lines, aiSection)
		}

		hunterSection := FormatHunterDigestSection(aiData)
		if hunterSection != "" {
			lines = append(lines, "")
			lines = append(lines, hunterSection)
		}
	}

	// --- Session Intelligence (extraction data) ---
	if extractionSection := DailyExtractionDigest(g.Extractions()); extractionSection != "" {
		lines = append(lines, "")
		lines = append(lines, extractionSection)
	}

	// --- Terminal activity (today's transcripts) ---
	if termSection := FormatTerminalFactsSection(GatherTerminalFacts(todayStr())); termSection != "" {
		lines = append(lines, "")
		lines = append(lines, termSection)
	}

	// Fallback
	if totalCommits == 0 && totalSessionCount == 0 {
		lines = append(lines, "")
		lines = append(lines, "- No commits or sessions recorded today")
	}

	return strings.Join(lines, "\n")
}

func (g *Generator) eodProjectGit(projectLines *[]string, p ProjectInfo,
	totalCommits, totalAdded, totalRemoved, totalFilesChanged *int) {

	// Today's commits
	commitLog := run(`git log --since="today 00:00" --oneline --format="%s"`, p.RepoPath)
	commits := filterEmpty(strings.Split(commitLog, "\n"))
	*totalCommits += len(commits)

	if len(commits) == 0 {
		return
	}

	// Files changed
	diffStat := run(fmt.Sprintf(`git diff --stat HEAD~%d 2>/dev/null`, len(commits)), p.RepoPath)
	filesChanged := 0
	if diffStat != "" {
		for _, l := range strings.Split(diffStat, "\n") {
			if strings.Contains(l, "|") {
				filesChanged++
			}
		}
	}
	*totalFilesChanged += filesChanged

	// Lines changed
	numstat := run(`git log --since="today 00:00" --numstat --format=""`, p.RepoPath)
	projAdded, projRemoved := parseNumstat(numstat)
	*totalAdded += projAdded
	*totalRemoved += projRemoved

	*projectLines = append(*projectLines,
		fmt.Sprintf("- [%s] %s, %s changed (+%d/-%d)",
			p.Name, pluralize(len(commits), "commit"), pluralize(filesChanged, "file"), projAdded, projRemoved),
	)

	// Top commit messages
	top := commits
	if len(top) > 3 {
		top = top[:3]
	}
	for _, msg := range top {
		*projectLines = append(*projectLines, fmt.Sprintf("  · %s", msg))
	}
	if len(commits) > 3 {
		*projectLines = append(*projectLines, fmt.Sprintf("  · ...and %d more", len(commits)-3))
	}

	// Merged PRs today
	mergedJSON := run(fmt.Sprintf(`gh pr list --state merged --search "merged:>=%s" --json title,number,url --limit 5`, todayStr()), p.RepoPath)
	if mergedJSON != "" {
		var prs []struct {
			Title  string `json:"title"`
			Number int    `json:"number"`
			URL    string `json:"url"`
		}
		if json.Unmarshal([]byte(mergedJSON), &prs) == nil {
			for _, pr := range prs {
				*projectLines = append(*projectLines, fmt.Sprintf("- [%s] [PR #%d](%s) merged: \"%s\"", p.Name, pr.Number, pr.URL, pr.Title))
			}
		}
	}

	// Still open PRs
	openJSON := run(`gh pr list --state open --json title,number,url --limit 5`, p.RepoPath)
	if openJSON != "" {
		var prs []struct {
			Title  string `json:"title"`
			Number int    `json:"number"`
			URL    string `json:"url"`
		}
		if json.Unmarshal([]byte(openJSON), &prs) == nil {
			for _, pr := range prs {
				*projectLines = append(*projectLines, fmt.Sprintf("- [%s] [PR #%d](%s) open: \"%s\"", p.Name, pr.Number, pr.URL, pr.Title))
			}
		}
	}
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

func filterEmpty(ss []string) []string {
	var out []string
	for _, s := range ss {
		if strings.TrimSpace(s) != "" {
			out = append(out, s)
		}
	}
	return out
}

func parseNumstat(raw string) (added, removed int) {
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 3)
		if len(parts) < 2 {
			continue
		}
		if parts[0] != "-" {
			var a int
			fmt.Sscanf(parts[0], "%d", &a)
			added += a
		}
		if parts[1] != "-" {
			var r int
			fmt.Sscanf(parts[1], "%d", &r)
			removed += r
		}
	}
	return
}

func orDefault(s, def string) string {
	if s == "" {
		return def
	}
	return s
}

func formatTokensK(n int64) string {
	if n >= 1_000_000 {
		return fmt.Sprintf("%.1fM", float64(n)/1_000_000)
	}
	if n >= 1_000 {
		return fmt.Sprintf("%dk", n/1_000)
	}
	return fmt.Sprintf("%d", n)
}

func pluralS(n int64) string {
	if n == 1 {
		return ""
	}
	return "s"
}
