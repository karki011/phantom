// Phantom — Terminal-facts gatherer for the daily journal.
//
// Reads a day's worth of per-session transcript files written by
// terminal.AttachTranscript, strips ANSI control sequences, and extracts
// lightweight structured signals (commands run, exit codes, error
// signatures) for inclusion in the end-of-day work log.
//
// Stays inline-sync because (a) it only runs when the user views/generates
// EOD, (b) regex over a few hundred MB completes in ~100ms, (c) no LLM
// or network calls are made — those are layered on top in a later phase
// using an async generate-and-update flow so the work log never blocks.
//
// Author: Subash Karki
package journal

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/subashkarki/phantom-os-v2/internal/branding"
)

// CommandRun is a single shell command observed in a transcript.
type CommandRun struct {
	Cmd   string
	Count int
}

// TerminalFacts is the structured summary of a day's terminal activity.
type TerminalFacts struct {
	Date          string
	SessionCount  int
	TotalBytes    int64
	TopCommands   []CommandRun
	ErrorSamples  []string
	FailedExits   int
	SuccessfulRun int
}

// Empty reports whether the facts contain anything worth surfacing.
func (f TerminalFacts) Empty() bool {
	return f.SessionCount == 0 &&
		len(f.TopCommands) == 0 &&
		len(f.ErrorSamples) == 0 &&
		f.FailedExits == 0
}

// ansiPattern matches CSI/OSC/ESC sequences plus a few common control
// bytes. Replaces them with empty string before regex parsing.
var ansiPattern = regexp.MustCompile(`\x1b\[[0-9;?]*[a-zA-Z]|\x1b\][^\x07]*\x07|\x1b[()][\x20-\x7E]|[\r\x07\x08\x0b\x0c\x0e\x0f]`)

// promptCmdPattern detects "shell-prompt-like + command" lines after ANSI
// strip. It deliberately tolerates many shell prompt formats by anchoring
// only on a `$ ` or `% ` or `# ` boundary near end-of-prompt.
var promptCmdPattern = regexp.MustCompile(`(?m)(?:[$%#]|❯|➜|→)\s+([A-Za-z_][A-Za-z0-9_./+-]*(?:\s+[^\n]*)?)$`)

// errorPattern catches common error / failure signatures.
var errorPattern = regexp.MustCompile(`(?i)(error[: ]|exception[: ]|failed[: ]|cannot |permission denied|command not found|fatal:)`)

// exitCodePattern catches shell exit-code echoes from `$?` prints or
// known framework outputs.
var exitCodePattern = regexp.MustCompile(`(?m)\bexit (?:code |status )?([0-9]{1,3})\b`)

// GatherTerminalFacts scans the user's transcript directory for files
// belonging to the given date (YYYY-MM-DD) and returns a structured
// summary. Errors at any individual file are logged silently — a missing
// or malformed transcript should never break EOD generation.
func GatherTerminalFacts(date string) TerminalFacts {
	facts := TerminalFacts{Date: date}

	home, err := os.UserHomeDir()
	if err != nil {
		return facts
	}
	dir := filepath.Join(home, branding.ConfigDirName, "transcripts")

	entries, err := os.ReadDir(dir)
	if err != nil {
		return facts
	}

	// Transcript filenames look like "<sessionID>-20260429T143005Z.log".
	// Match the date portion against YYYYMMDD.
	stamp := strings.ReplaceAll(date, "-", "")
	cmdCounts := map[string]int{}

	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if !strings.Contains(name, "-"+stamp) || !strings.HasSuffix(name, ".log") {
			continue
		}
		facts.SessionCount++

		path := filepath.Join(dir, name)
		fi, statErr := os.Stat(path)
		if statErr == nil {
			facts.TotalBytes += fi.Size()
		}

		f, openErr := os.Open(path)
		if openErr != nil {
			continue
		}
		scanFile(f, cmdCounts, &facts)
		_ = f.Close()
	}

	facts.TopCommands = topCommands(cmdCounts, 10)
	return facts
}

// scanFile streams a single transcript line-by-line, tallying commands,
// errors, and exit codes. Uses a generous buffer so long lines (4MB+)
// don't break scanning.
func scanFile(f *os.File, cmdCounts map[string]int, facts *TerminalFacts) {
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 64*1024), 4*1024*1024)

	for sc.Scan() {
		line := ansiPattern.ReplaceAllString(sc.Text(), "")
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		if m := promptCmdPattern.FindStringSubmatch(line); len(m) == 2 {
			cmd := strings.Fields(m[1])
			if len(cmd) > 0 {
				cmdCounts[cmd[0]]++
			}
		}

		if errorPattern.MatchString(line) && len(facts.ErrorSamples) < 8 {
			facts.ErrorSamples = append(facts.ErrorSamples, truncate(line, 160))
		}

		if m := exitCodePattern.FindStringSubmatch(line); len(m) == 2 {
			if m[1] == "0" {
				facts.SuccessfulRun++
			} else {
				facts.FailedExits++
			}
		}
	}
}

func topCommands(counts map[string]int, n int) []CommandRun {
	out := make([]CommandRun, 0, len(counts))
	for cmd, c := range counts {
		out = append(out, CommandRun{Cmd: cmd, Count: c})
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Count == out[j].Count {
			return out[i].Cmd < out[j].Cmd
		}
		return out[i].Count > out[j].Count
	})
	if len(out) > n {
		out = out[:n]
	}
	return out
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

// FormatTerminalFactsSection renders the facts as a markdown section ready
// to append to the journal entry. Returns "" when there's nothing useful.
func FormatTerminalFactsSection(f TerminalFacts) string {
	if f.Empty() {
		return ""
	}

	var b strings.Builder
	b.WriteString("**Terminal activity**\n")

	if f.SessionCount > 0 {
		b.WriteString(fmt.Sprintf("- %d session%s captured (%s)\n",
			f.SessionCount, pluralS(int64(f.SessionCount)), formatBytes(f.TotalBytes)))
	}
	if f.SuccessfulRun > 0 || f.FailedExits > 0 {
		b.WriteString(fmt.Sprintf("- Exit codes: %d ok, %d failed\n", f.SuccessfulRun, f.FailedExits))
	}
	if len(f.TopCommands) > 0 {
		b.WriteString("- Top commands:")
		for i, cr := range f.TopCommands {
			if i > 0 {
				b.WriteString(",")
			}
			b.WriteString(fmt.Sprintf(" `%s`×%d", cr.Cmd, cr.Count))
		}
		b.WriteString("\n")
	}
	if len(f.ErrorSamples) > 0 {
		b.WriteString("- Notable errors:\n")
		for _, e := range f.ErrorSamples {
			b.WriteString(fmt.Sprintf("  - `%s`\n", e))
		}
	}
	return strings.TrimRight(b.String(), "\n")
}

func formatBytes(n int64) string {
	const (
		kb = 1024
		mb = kb * 1024
	)
	switch {
	case n >= mb:
		return fmt.Sprintf("%.1fMB", float64(n)/float64(mb))
	case n >= kb:
		return fmt.Sprintf("%dKB", n/kb)
	default:
		return fmt.Sprintf("%dB", n)
	}
}
