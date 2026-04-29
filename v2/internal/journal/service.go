// JournalService — File-based daily developer journal.
// Stores markdown files at ~/.phantom-os/journal/YYYY-MM-DD.md
// with YAML frontmatter + 4 sections: Morning Brief, Work Log, End of Day, Notes.
// Author: Subash Karki
package journal

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/subashkarki/phantom-os-v2/internal/branding"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// JournalEntry is the frontend-facing journal data for a day.
type JournalEntry struct {
	Date               string   `json:"date"`
	MorningBrief       string   `json:"morning_brief"`
	MorningGeneratedAt int64    `json:"morning_generated_at"`
	WorkLog            []string `json:"work_log"`
	EndOfDayRecap      string   `json:"end_of_day_recap"`
	EodGeneratedAt     int64    `json:"eod_generated_at"`
	Notes              string   `json:"notes"`
}

// Service manages file-based journal entries.
type Service struct {
	dir string
	mu  sync.Mutex
}

// NewService creates a Service that stores journals in the given directory.
// Defaults to ~/.phantom-os/journal/ if dir is empty.
func NewService(dir string) *Service {
	if dir == "" {
		home, _ := os.UserHomeDir()
		dir = filepath.Join(home, branding.ConfigDirName, "journal")
	}
	return &Service{dir: dir}
}

func (s *Service) ensureDir() {
	_ = os.MkdirAll(s.dir, 0o755)
}

func (s *Service) journalPath(date string, project ...string) string {
	p := ""
	if len(project) > 0 {
		p = project[0]
	}
	if p != "" {
		return filepath.Join(s.dir, fmt.Sprintf("%s--%s.md", date, sanitizeProject(p)))
	}
	return filepath.Join(s.dir, date+".md")
}

// sanitizeProject replaces characters unsafe for filenames with hyphens.
func sanitizeProject(name string) string {
	r := strings.NewReplacer("/", "-", " ", "-", "\\", "-")
	return r.Replace(name)
}

func emptyEntry(date string) JournalEntry {
	return JournalEntry{
		Date:    date,
		WorkLog: []string{},
	}
}

// --------------------------------------------------------------------------
// Frontmatter
// --------------------------------------------------------------------------

type frontmatter struct {
	date               string
	morningGeneratedAt int64
	eodGeneratedAt     int64
}

func parseFrontmatter(raw string) (frontmatter, string) {
	fm := frontmatter{}
	if !strings.HasPrefix(raw, "---") {
		return fm, raw
	}
	end := strings.Index(raw[3:], "---")
	if end == -1 {
		return fm, raw
	}
	fmRaw := strings.TrimSpace(raw[3 : end+3])
	body := strings.TrimSpace(raw[end+6:])

	for _, line := range strings.Split(fmRaw, "\n") {
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		val = strings.Trim(val, `"`)

		switch key {
		case "date":
			fm.date = val
		case "morningGeneratedAt":
			if val != "null" && val != "" {
				fm.morningGeneratedAt, _ = strconv.ParseInt(val, 10, 64)
			}
		case "eodGeneratedAt":
			if val != "null" && val != "" {
				fm.eodGeneratedAt, _ = strconv.ParseInt(val, 10, 64)
			}
		}
	}
	return fm, body
}

func serializeFrontmatter(fm frontmatter) string {
	morningAt := "null"
	if fm.morningGeneratedAt > 0 {
		morningAt = strconv.FormatInt(fm.morningGeneratedAt, 10)
	}
	eodAt := "null"
	if fm.eodGeneratedAt > 0 {
		eodAt = strconv.FormatInt(fm.eodGeneratedAt, 10)
	}
	return fmt.Sprintf("---\ndate: \"%s\"\nmorningGeneratedAt: %s\neodGeneratedAt: %s\n---", fm.date, morningAt, eodAt)
}

// --------------------------------------------------------------------------
// Section parser / serializer
// --------------------------------------------------------------------------

type sections struct {
	morningBrief string
	workLog      string
	endOfDay     string
	notes        string
}

func parseSections(body string) sections {
	result := sections{}
	parts := strings.Split(body, "## ")

	for _, part := range parts {
		nlIdx := strings.Index(part, "\n")
		if nlIdx == -1 {
			continue
		}
		header := strings.TrimSpace(part[:nlIdx])
		content := strings.TrimSpace(part[nlIdx+1:])

		switch header {
		case "Morning Brief":
			result.morningBrief = content
		case "Work Log":
			result.workLog = content
		case "End of Day":
			result.endOfDay = content
		case "Notes":
			result.notes = content
		}
	}
	return result
}

func parseWorkLogLines(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return []string{}
	}
	var lines []string
	for _, l := range strings.Split(raw, "\n") {
		if strings.HasPrefix(l, "- ") {
			lines = append(lines, strings.TrimSpace(l[2:]))
		}
	}
	if lines == nil {
		return []string{}
	}
	return lines
}

func parseJournal(raw string) JournalEntry {
	fm, body := parseFrontmatter(raw)
	secs := parseSections(body)

	morningBrief := secs.morningBrief
	if morningBrief == "_Not yet generated_" {
		morningBrief = ""
	}

	eod := secs.endOfDay
	if eod == "_Not yet generated_" {
		eod = ""
	}

	return JournalEntry{
		Date:               fm.date,
		MorningBrief:       morningBrief,
		MorningGeneratedAt: fm.morningGeneratedAt,
		WorkLog:            parseWorkLogLines(secs.workLog),
		EndOfDayRecap:      eod,
		EodGeneratedAt:     fm.eodGeneratedAt,
		Notes:              secs.notes,
	}
}

func serializeJournal(entry JournalEntry) string {
	fm := serializeFrontmatter(frontmatter{
		date:               entry.Date,
		morningGeneratedAt: entry.MorningGeneratedAt,
		eodGeneratedAt:     entry.EodGeneratedAt,
	})

	morningSection := entry.MorningBrief
	if morningSection == "" {
		morningSection = "_Not yet generated_"
	}

	workLogSection := ""
	if len(entry.WorkLog) > 0 {
		workLines := make([]string, len(entry.WorkLog))
		for i, l := range entry.WorkLog {
			workLines[i] = "- " + l
		}
		workLogSection = strings.Join(workLines, "\n")
	}

	eodSection := entry.EndOfDayRecap
	if eodSection == "" {
		eodSection = "_Not yet generated_"
	}

	return strings.Join([]string{
		fm,
		"",
		"## Morning Brief",
		"",
		morningSection,
		"",
		"## Work Log",
		"",
		workLogSection,
		"",
		"## End of Day",
		"",
		eodSection,
		"",
		"## Notes",
		"",
		entry.Notes,
		"",
	}, "\n")
}

// --------------------------------------------------------------------------
// Public API
// --------------------------------------------------------------------------

// GetEntry returns the journal entry for a date, or an empty entry if none exists.
// If project is non-empty, reads the project-scoped journal file.
func (s *Service) GetEntry(date string, project ...string) JournalEntry {
	s.ensureDir()
	p := ""
	if len(project) > 0 {
		p = project[0]
	}
	path := s.journalPath(date, p)
	data, err := os.ReadFile(path)
	if err != nil {
		return emptyEntry(date)
	}
	entry := parseJournal(string(data))
	if entry.Date == "" {
		entry.Date = date
	}
	if entry.WorkLog == nil {
		entry.WorkLog = []string{}
	}
	return entry
}

// SetMorningBrief stores the morning brief (immutable once set).
// Returns false if already generated.
// If project is non-empty, writes to the project-scoped journal file.
func (s *Service) SetMorningBrief(date, content string, project ...string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureDir()

	p := ""
	if len(project) > 0 {
		p = project[0]
	}
	entry := s.GetEntry(date, p)
	if entry.MorningGeneratedAt > 0 {
		return false // already generated — immutable
	}
	entry.MorningBrief = content
	entry.MorningGeneratedAt = time.Now().UnixMilli()
	if entry.Date == "" {
		entry.Date = date
	}
	_ = os.WriteFile(s.journalPath(date, p), []byte(serializeJournal(entry)), 0o644)
	return true
}

// SetEndOfDay stores the end-of-day recap (immutable once set).
// Returns false if already generated.
// If project is non-empty, writes to the project-scoped journal file.
func (s *Service) SetEndOfDay(date, content string, project ...string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureDir()

	p := ""
	if len(project) > 0 {
		p = project[0]
	}
	entry := s.GetEntry(date, p)
	if entry.EodGeneratedAt > 0 {
		return false // already generated — immutable
	}
	entry.EndOfDayRecap = content
	entry.EodGeneratedAt = time.Now().UnixMilli()
	if entry.Date == "" {
		entry.Date = date
	}
	_ = os.WriteFile(s.journalPath(date, p), []byte(serializeJournal(entry)), 0o644)
	return true
}

// AppendWorkLog appends a line to the work log for a date.
// Deduplicates: if the same line was appended within the last 30 seconds, skip it
// (git events and other watchers can fire multiple times for the same action).
// Always writes to the global (all-projects) journal file. Work log lines already
// contain [project-name] tags, and the frontend filters them when a project is selected.
func (s *Service) AppendWorkLog(date, line string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureDir()

	entry := s.GetEntry(date)
	if entry.Date == "" {
		entry.Date = date
	}

	// Deduplicate: skip if the last entry matches and was recent (within ~30s).
	// We compare the text after stripping the "HH:MM " timestamp prefix to handle
	// events that fire at different seconds but represent the same action.
	if len(entry.WorkLog) > 0 {
		last := entry.WorkLog[len(entry.WorkLog)-1]
		lastBody := stripTimePrefix(last)
		newBody := stripTimePrefix(line)
		if lastBody == newBody {
			// Same content — skip duplicate
			return
		}
	}

	entry.WorkLog = append(entry.WorkLog, line)
	_ = os.WriteFile(s.journalPath(date), []byte(serializeJournal(entry)), 0o644)
}

// ReplaceWorkLog replaces the entire Work Log section for a date with the
// supplied lines, preserving all other sections. If no journal file exists
// for the date, one is created with the given lines and empty other sections.
func (s *Service) ReplaceWorkLog(date string, lines []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureDir()

	entry := s.GetEntry(date)
	if entry.Date == "" {
		entry.Date = date
	}
	if lines == nil {
		entry.WorkLog = []string{}
	} else {
		entry.WorkLog = lines
	}
	return os.WriteFile(s.journalPath(date), []byte(serializeJournal(entry)), 0o644)
}

// stripTimePrefix removes a leading "HH:MM " timestamp from a work log line
// so we can compare the semantic content for deduplication.
func stripTimePrefix(s string) string {
	if len(s) >= 6 && s[2] == ':' && s[5] == ' ' {
		return s[6:]
	}
	return s
}

// SetNotes updates the notes section (user-editable).
// If project is non-empty, writes to the project-scoped journal file.
func (s *Service) SetNotes(date, content string, project ...string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ensureDir()

	p := ""
	if len(project) > 0 {
		p = project[0]
	}
	entry := s.GetEntry(date, p)
	if entry.Date == "" {
		entry.Date = date
	}
	entry.Notes = content
	_ = os.WriteFile(s.journalPath(date, p), []byte(serializeJournal(entry)), 0o644)
}

// ListDates returns the most recent journal dates, newest first.
func (s *Service) ListDates(limit int) []string {
	s.ensureDir()
	if limit <= 0 {
		limit = 30
	}

	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return []string{}
	}

	var dates []string
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		dates = append(dates, strings.TrimSuffix(e.Name(), ".md"))
	}
	sort.Sort(sort.Reverse(sort.StringSlice(dates)))
	if len(dates) > limit {
		dates = dates[:limit]
	}
	return dates
}
