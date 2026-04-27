// bindings_plans.go — Wails bindings for scanning plan files on disk.
// Scans ~/.claude/plans/ (global) and project-local plan directories,
// matching plans to a specific worktree by content inspection.
//
// Author: Subash Karki
package app

import (
	"fmt"
	"io"
	"log"
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
		log.Printf("bindings_plans: cannot determine home dir: %v", err)
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
				log.Printf("bindings_plans: read %s: %v", fullPath, err)
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
