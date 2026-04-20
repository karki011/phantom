// Package git provides diff operations for git repositories.
//
// Author: Subash Karki
package git

import (
	"context"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// DiffFile summarises changes to one file between two refs.
type DiffFile struct {
	Path      string `json:"path"`
	OldPath   string `json:"old_path,omitempty"`
	Status    string `json:"status"` // "added", "modified", "deleted", "renamed"
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
}

// DiffLine represents a single line within a diff hunk.
type DiffLine struct {
	Type    string `json:"type"` // "add", "remove", "context"
	Content string `json:"content"`
	OldNum  int    `json:"old_num,omitempty"`
	NewNum  int    `json:"new_num,omitempty"`
}

// DiffHunk represents a contiguous block of diff lines.
type DiffHunk struct {
	OldStart int        `json:"old_start"`
	OldCount int        `json:"old_count"`
	NewStart int        `json:"new_start"`
	NewCount int        `json:"new_count"`
	Lines    []DiffLine `json:"lines"`
}

// FileDiff holds the full diff (hunks) for one file.
type FileDiff struct {
	File  DiffFile   `json:"file"`
	Hunks []DiffHunk `json:"hunks"`
}

// hunkHeaderRe matches "@@ -oldStart,oldCount +newStart,newCount @@" lines.
var hunkHeaderRe = regexp.MustCompile(`^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@`)

// parseNumstat parses one line of `git diff --numstat` output.
// Format: additions\tdeletions\tfilepath  (or "additions\tdeletions\told{TAB}new" for renames)
func parseNumstat(line string) (DiffFile, error) {
	parts := strings.SplitN(line, "\t", 3)
	if len(parts) != 3 {
		return DiffFile{}, fmt.Errorf("unexpected numstat line: %q", line)
	}

	add, err := strconv.Atoi(parts[0])
	if err != nil {
		// binary files show "-" — treat as 0
		add = 0
	}
	del, err2 := strconv.Atoi(parts[1])
	if err2 != nil {
		del = 0
	}

	filePath := parts[2]

	df := DiffFile{
		Additions: add,
		Deletions: del,
	}

	// Detect renames: "old\tnew" joined by a tab or brace notation {old => new}
	if strings.Contains(filePath, "\t") {
		renamed := strings.SplitN(filePath, "\t", 2)
		df.OldPath = renamed[0]
		df.Path = renamed[1]
		df.Status = "renamed"
	} else {
		df.Path = filePath
		switch {
		case add > 0 && del == 0:
			df.Status = "added"
		case add == 0 && del > 0:
			df.Status = "deleted"
		default:
			df.Status = "modified"
		}
	}

	return df, nil
}

// runNumstat executes git diff --numstat with the given args and parses results.
func runNumstat(ctx context.Context, repoPath string, args []string) ([]DiffFile, error) {
	out, err := runGit(ctx, repoPath, args...)
	if err != nil {
		return nil, err
	}
	if out == "" {
		return nil, nil
	}

	var files []DiffFile
	for _, line := range strings.Split(out, "\n") {
		if line == "" {
			continue
		}
		df, err := parseNumstat(line)
		if err != nil {
			continue // skip unparseable lines
		}
		files = append(files, df)
	}
	return files, nil
}

// ChangedFiles returns files changed between two refs.
// If ref2 is empty, compares ref1 against the working tree.
func ChangedFiles(ctx context.Context, repoPath, ref1, ref2 string) ([]DiffFile, error) {
	var args []string
	if ref2 == "" {
		args = []string{"diff", "--numstat", ref1}
	} else {
		args = []string{"diff", "--numstat", ref1 + ".." + ref2}
	}
	return runNumstat(ctx, repoPath, args)
}

// StagedChanges returns files staged for commit.
func StagedChanges(ctx context.Context, repoPath string) ([]DiffFile, error) {
	return runNumstat(ctx, repoPath, []string{"diff", "--cached", "--numstat"})
}

// WorkingTreeChanges returns unstaged changes.
func WorkingTreeChanges(ctx context.Context, repoPath string) ([]DiffFile, error) {
	return runNumstat(ctx, repoPath, []string{"diff", "--numstat"})
}

// FileDiffDetail returns the full unified diff with hunks for a specific file.
func FileDiffDetail(ctx context.Context, repoPath, ref1, ref2, filePath string) (*FileDiff, error) {
	var rangeArg string
	if ref2 == "" {
		rangeArg = ref1
	} else {
		rangeArg = ref1 + ".." + ref2
	}

	out, err := runGit(ctx, repoPath, "diff", "-U3", rangeArg, "--", filePath)
	if err != nil {
		return nil, err
	}

	fd := &FileDiff{
		File: DiffFile{Path: filePath, Status: "modified"},
	}
	fd.Hunks = parseUnifiedDiff(out, &fd.File)
	return fd, nil
}

// parseUnifiedDiff parses the text of a `git diff -U3` output for a single file
// and returns the hunks. It also accumulates addition/deletion counts into file.
func parseUnifiedDiff(text string, file *DiffFile) []DiffHunk {
	var hunks []DiffHunk
	var current *DiffHunk
	oldLine, newLine := 0, 0

	lines := strings.Split(text, "\n")
	for _, raw := range lines {
		if m := hunkHeaderRe.FindStringSubmatch(raw); m != nil {
			if current != nil {
				hunks = append(hunks, *current)
			}
			oldStart, _ := strconv.Atoi(m[1])
			oldCount := 1
			if m[2] != "" {
				oldCount, _ = strconv.Atoi(m[2])
			}
			newStart, _ := strconv.Atoi(m[3])
			newCount := 1
			if m[4] != "" {
				newCount, _ = strconv.Atoi(m[4])
			}
			current = &DiffHunk{
				OldStart: oldStart,
				OldCount: oldCount,
				NewStart: newStart,
				NewCount: newCount,
			}
			oldLine = oldStart
			newLine = newStart
			continue
		}

		if current == nil {
			// Check for file header markers to detect added/deleted files.
			if strings.HasPrefix(raw, "new file mode") {
				file.Status = "added"
			} else if strings.HasPrefix(raw, "deleted file mode") {
				file.Status = "deleted"
			} else if strings.HasPrefix(raw, "rename from ") {
				file.OldPath = strings.TrimPrefix(raw, "rename from ")
				file.Status = "renamed"
			} else if strings.HasPrefix(raw, "rename to ") {
				file.Path = strings.TrimPrefix(raw, "rename to ")
			}
			continue
		}

		switch {
		case strings.HasPrefix(raw, "+") && !strings.HasPrefix(raw, "+++"):
			current.Lines = append(current.Lines, DiffLine{
				Type:    "add",
				Content: raw[1:],
				NewNum:  newLine,
			})
			file.Additions++
			newLine++
		case strings.HasPrefix(raw, "-") && !strings.HasPrefix(raw, "---"):
			current.Lines = append(current.Lines, DiffLine{
				Type:    "remove",
				Content: raw[1:],
				OldNum:  oldLine,
			})
			file.Deletions++
			oldLine++
		case strings.HasPrefix(raw, " "):
			current.Lines = append(current.Lines, DiffLine{
				Type:    "context",
				Content: raw[1:],
				OldNum:  oldLine,
				NewNum:  newLine,
			})
			oldLine++
			newLine++
		}
	}

	if current != nil {
		hunks = append(hunks, *current)
	}
	return hunks
}
