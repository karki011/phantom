// Author: Subash Karki
package persona

import (
	"context"
	"strings"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/collector"
	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/ai/graph/filegraph"
	"github.com/subashkarki/phantom-os-v2/internal/git"
	"github.com/subashkarki/phantom-os-v2/internal/terminal"
)

// ContextDeps holds references to live v2 services.
// All fields are optional — nil means unavailable; safe defaults are returned.
type ContextDeps struct {
	DB           *db.DB
	Terminal     *terminal.Manager
	CollectorReg *collector.Registry
	// FileIndexers is a lazy getter that returns the live indexer map.
	// Using a func allows Persona (created before Startup) to read
	// indexers that are initialized later inside App.Startup → initFileGraph.
	FileIndexers func() map[string]*filegraph.Indexer
	GitStatusFn  func(ctx context.Context, path string) (*git.RepoStatus, error)
	GitLogFn     func(ctx context.Context, path string, limit int) ([]git.CommitInfo, error)
}

// ContextEngine provides read-only access to runtime state.
type ContextEngine struct {
	deps ContextDeps
}

// NewContextEngine constructs a ContextEngine with the given deps.
func NewContextEngine(deps ContextDeps) *ContextEngine {
	return &ContextEngine{deps: deps}
}

// ClaudeSessions returns active Claude sessions filtered by project path prefix.
// Returns an empty (non-nil) slice when deps are unavailable or no sessions match.
func (e *ContextEngine) ClaudeSessions(ctx context.Context, projectFilter string) []ClaudeSessionStatus {
	out := []ClaudeSessionStatus{}
	if e == nil || e.deps.DB == nil {
		return out
	}

	q := db.New(e.deps.DB.Reader)
	sessions, err := q.ListActiveSessions(ctx)
	if err != nil {
		return out
	}

	for _, s := range sessions {
		cwd := s.Cwd.String
		if projectFilter != "" && !strings.HasPrefix(cwd, projectFilter) {
			continue
		}
		var startedAt time.Time
		if s.StartedAt.Valid {
			startedAt = time.Unix(s.StartedAt.Int64, 0)
		}
		out = append(out, ClaudeSessionStatus{
			SessionID:   s.ID,
			ProjectPath: cwd,
			LiveState:   s.Status.String,
			LastTool:    s.ToolSummary.String,
			StartedAt:   startedAt,
		})
	}
	return out
}

// TerminalSessions returns open terminal sessions mapped to TerminalStatus.
// Returns an empty (non-nil) slice when the terminal manager is unavailable.
func (e *ContextEngine) TerminalSessions(_ context.Context) []TerminalStatus {
	out := []TerminalStatus{}
	if e == nil || e.deps.Terminal == nil {
		return out
	}
	for _, info := range e.deps.Terminal.List() {
		out = append(out, TerminalStatus{
			ID:  info.ID,
			CWD: info.CWD,
		})
	}
	return out
}

// GitSummary returns a GitSummary for repoPath using the injected git functions.
// Returns a zero-value struct on missing deps or errors.
func (e *ContextEngine) GitSummary(ctx context.Context, repoPath string) GitSummary {
	if e == nil || repoPath == "" || e.deps.GitStatusFn == nil || e.deps.GitLogFn == nil {
		return GitSummary{}
	}

	status, err := e.deps.GitStatusFn(ctx, repoPath)
	if err != nil || status == nil {
		return GitSummary{}
	}

	commits, _ := e.deps.GitLogFn(ctx, repoPath, 10)
	var recent []CommitSummary
	for _, c := range commits {
		recent = append(recent, CommitSummary{
			Hash:    c.ShortHash,
			Message: c.Subject,
			Author:  c.Author,
			When:    time.Unix(c.Date, 0),
		})
	}

	return GitSummary{
		Branch:        status.Branch,
		IsClean:       status.IsClean,
		Staged:        len(status.Staged),
		Unstaged:      len(status.Unstaged),
		Untracked:     len(status.Untracked),
		RecentCommits: recent,
	}
}

// GraphSummary finds the matching indexer by RootDir prefix and returns graph stats.
// Returns a zero-value struct when no matching indexer is found.
func (e *ContextEngine) GraphSummary(projectCwd string) GraphSummary {
	if e == nil || projectCwd == "" || e.deps.FileIndexers == nil {
		return GraphSummary{}
	}
	indexers := e.deps.FileIndexers()
	for _, ix := range indexers {
		if ix == nil {
			continue
		}
		if strings.HasPrefix(projectCwd, ix.RootDir()) {
			files, symbols, edges := ix.Graph().Stats()
			return GraphSummary{
				FileCount:   files,
				SymbolCount: symbols,
				EdgeCount:   edges,
			}
		}
	}
	return GraphSummary{}
}

// Assemble collects all context signals for the given project path / worktree.
func (e *ContextEngine) Assemble(ctx context.Context, projectPath string, _ string) PersonaContext {
	return PersonaContext{
		ActiveProject:    projectPath,
		ClaudeSessions:   e.ClaudeSessions(ctx, projectPath),
		TerminalSessions: e.TerminalSessions(ctx),
		RecentGit:        e.GitSummary(ctx, projectPath),
		FileGraph:        e.GraphSummary(projectPath),
	}
}
