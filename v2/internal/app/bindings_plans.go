// bindings_plans.go — Wails bindings for scanning plan files on disk.
// Scans ~/.claude/plans/ (global) and project-local plan directories,
// matching plans to a specific worktree by content inspection.
//
// Author: Subash Karki
package app

import (
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// PlanFile represents a single plan document found on disk.
type PlanFile struct {
	FilePath   string `json:"filePath"`
	Title      string `json:"title"`
	TotalTasks int    `json:"totalTasks"`
	DoneTasks  int    `json:"doneTasks"`
	ModifiedAt int64  `json:"modifiedAt"` // unix seconds
	Age        string `json:"age"`        // "2h ago", "today", etc.
}

const (
	planMaxAge     = 48 * time.Hour
	planReadLimit  = 4096 // 4KB — enough for matching + initial task counts
	planCacheTTL   = 10 * time.Second
	planFileMaxBytes = 1 << 20 // 1 MiB cap for ReadPlanFile / WritePlanFile
)

// planCacheEntry holds a cached scan result for a worktree.
type planCacheEntry struct {
	plans     []PlanFile
	fetchedAt time.Time
}

// planCache is an in-memory cache keyed by worktreePath.
// Concurrent access is safe because Wails bindings are called from the JS
// thread sequentially; no mutex is needed for single-threaded callers.
var planCache = map[string]*planCacheEntry{}

// GetPlansForWorktree scans all known plan directories and returns plans
// that are relevant to the given worktree, repo, or branch.
//
// Global (~/.claude/plans/) plans require a content match.
// Local project plans are always included (they are already project-scoped).
// Results are cached per worktreePath for planCacheTTL.
func (a *App) GetPlansForWorktree(worktreePath, repoPath, branchName string) []PlanFile {
	if entry, ok := planCache[worktreePath]; ok {
		if time.Since(entry.fetchedAt) < planCacheTTL {
			return entry.plans
		}
	}

	home, err := os.UserHomeDir()
	if err != nil {
		slog.Error("bindings_plans: cannot determine home dir", "err", err)
		return nil
	}

	// Collect search terms used to match global plan content.
	worktreeSegment := filepath.Base(worktreePath)
	repoSegment := filepath.Base(repoPath)

	matchTerms := []string{branchName, worktreePath, repoPath, worktreeSegment, repoSegment}
	// Remove empty strings to avoid false positives.
	filteredTerms := matchTerms[:0]
	for _, t := range matchTerms {
		if t != "" {
			filteredTerms = append(filteredTerms, t)
		}
	}

	type scanDir struct {
		path        string
		requireMatch bool // true = global, must match content
	}

	dirs := []scanDir{
		{path: filepath.Join(home, ".claude", "plans"), requireMatch: true},
		{path: filepath.Join(worktreePath, ".claude", "plans"), requireMatch: false},
		{path: filepath.Join(worktreePath, "docs", "superpowers", "plans"), requireMatch: false},
		{path: filepath.Join(repoPath, ".claude", "plans"), requireMatch: false},
		{path: filepath.Join(repoPath, "docs", "superpowers", "plans"), requireMatch: false},
	}

	seen := map[string]struct{}{} // deduplicate by base filename
	var results []PlanFile

	for _, d := range dirs {
		entries, err := os.ReadDir(d.path)
		if err != nil {
			// Directory may not exist — skip silently.
			continue
		}

		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".md") {
				continue
			}

			// Deduplicate by filename across all scan directories.
			if _, already := seen[entry.Name()]; already {
				continue
			}

			fullPath := filepath.Join(d.path, entry.Name())

			info, err := entry.Info()
			if err != nil {
				continue
			}

			modTime := info.ModTime()
			if time.Since(modTime) > planMaxAge {
				continue
			}

			content, err := readFirstBytes(fullPath, planReadLimit)
			if err != nil {
				slog.Error("bindings_plans: read plan file", "path", fullPath, "err", err)
				continue
			}

			if d.requireMatch && !contentMatchesWorktree(content, filteredTerms) {
				continue
			}

			title, total, done := parsePlanContent(content)

			seen[entry.Name()] = struct{}{}
			results = append(results, PlanFile{
				FilePath:   fullPath,
				Title:      title,
				TotalTasks: total,
				DoneTasks:  done,
				ModifiedAt: modTime.Unix(),
				Age:        formatAge(modTime),
			})
		}
	}

	// Sort newest first.
	sortPlansByModTime(results)

	planCache[worktreePath] = &planCacheEntry{plans: results, fetchedAt: time.Now()}
	return results
}

// contentMatchesWorktree returns true if any of the provided search terms
// appears in the plan content (case-insensitive).
func contentMatchesWorktree(content string, terms []string) bool {
	lower := strings.ToLower(content)
	for _, term := range terms {
		if term != "" && strings.Contains(lower, strings.ToLower(term)) {
			return true
		}
	}
	return false
}

// readFirstBytes reads up to limit bytes from the file at path.
func readFirstBytes(path string, limit int) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	buf := make([]byte, limit)
	n, err := f.Read(buf)
	if err != nil && err != io.EOF {
		return "", err
	}
	return string(buf[:n]), nil
}

// formatAge converts a past time into a human-readable age string.
func formatAge(t time.Time) string {
	d := time.Since(t)
	if d < time.Hour {
		return fmt.Sprintf("%dm ago", int(d.Minutes()))
	}
	if d < 24*time.Hour {
		return fmt.Sprintf("%dh ago", int(d.Hours()))
	}
	return fmt.Sprintf("%dd ago", int(d.Hours()/24))
}

// sortPlansByModTime sorts plans slice in-place, newest first.
func sortPlansByModTime(plans []PlanFile) {
	for i := 1; i < len(plans); i++ {
		for j := i; j > 0 && plans[j].ModifiedAt > plans[j-1].ModifiedAt; j-- {
			plans[j], plans[j-1] = plans[j-1], plans[j]
		}
	}
}

// validatePlanPath checks an absolute path against the allow-list of plan
// roots used by GetPlansForWorktree. Accepted shapes:
//   <...>/.claude/plans/<name>.md
//   <...>/docs/superpowers/plans/<name>.md
// Returns the cleaned absolute path or an error.
func validatePlanPath(absPath string) (string, error) {
	if !filepath.IsAbs(absPath) {
		return "", fmt.Errorf("plan path must be absolute: %s", absPath)
	}
	clean := filepath.Clean(absPath)
	if !strings.HasSuffix(strings.ToLower(clean), ".md") {
		return "", fmt.Errorf("plan path must end with .md: %s", clean)
	}
	parent := filepath.Dir(clean)
	grand := filepath.Dir(parent)

	if filepath.Base(parent) == "plans" && filepath.Base(grand) == ".claude" {
		return clean, nil
	}
	if filepath.Base(parent) == "plans" &&
		filepath.Base(grand) == "superpowers" &&
		filepath.Base(filepath.Dir(grand)) == "docs" {
		return clean, nil
	}
	return "", fmt.Errorf("plan path not under allowed roots (.claude/plans or docs/superpowers/plans): %s", clean)
}

// ReadPlanFile reads a plan markdown file by absolute path. The path must
// resolve to one of the allow-listed plan directories. Used by the Plan tab
// "Open in Editor" action — those paths originate from GetPlansForWorktree
// and are absolute, including global plans under ~/.claude/plans/ that live
// outside any workspace root.
func (a *App) ReadPlanFile(absPath string) (string, error) {
	slog.Info("app/ReadPlanFile: called", "absPath", absPath)

	clean, err := validatePlanPath(absPath)
	if err != nil {
		slog.Error("app/ReadPlanFile: invalid path", "absPath", absPath, "err", err)
		return "", err
	}

	info, err := os.Stat(clean)
	if err != nil {
		slog.Error("app/ReadPlanFile: stat failed", "absPath", clean, "err", err)
		return "", err
	}
	if info.Size() > planFileMaxBytes {
		slog.Error("app/ReadPlanFile: file too large", "absPath", clean, "size", info.Size())
		return "", fmt.Errorf("plan file too large: %d bytes (max %d)", info.Size(), planFileMaxBytes)
	}

	data, err := os.ReadFile(clean)
	if err != nil {
		slog.Error("app/ReadPlanFile: read failed", "absPath", clean, "err", err)
		return "", err
	}

	slog.Info("app/ReadPlanFile: success", "absPath", clean, "bytes", len(data))
	return string(data), nil
}

// WritePlanFile writes a plan markdown file by absolute path. The path must
// resolve to one of the allow-listed plan directories. Parent directories
// are created if missing.
func (a *App) WritePlanFile(absPath, content string) error {
	slog.Info("app/WritePlanFile: called", "absPath", absPath, "bytes", len(content))

	clean, err := validatePlanPath(absPath)
	if err != nil {
		slog.Error("app/WritePlanFile: invalid path", "absPath", absPath, "err", err)
		return err
	}
	if len(content) > planFileMaxBytes {
		err := fmt.Errorf("plan content too large: %d bytes (max %d)", len(content), planFileMaxBytes)
		slog.Error("app/WritePlanFile: oversized payload", "absPath", clean, "err", err)
		return err
	}

	if err := os.MkdirAll(filepath.Dir(clean), 0755); err != nil {
		slog.Error("app/WritePlanFile: mkdir failed", "dir", filepath.Dir(clean), "err", err)
		return err
	}
	if err := os.WriteFile(clean, []byte(content), 0644); err != nil {
		slog.Error("app/WritePlanFile: write failed", "absPath", clean, "err", err)
		return err
	}

	slog.Info("app/WritePlanFile: success", "absPath", clean)
	return nil
}
