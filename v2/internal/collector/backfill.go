// backfill.go — One-shot backfill of journal work-log lines from completed sessions.
// Author: Subash Karki
package collector

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/db"
	"github.com/subashkarki/phantom-os-v2/internal/journal"
)

// BackfillJournal walks every completed session in the database, runs enrichment,
// and rewrites each day's journal Work Log section using the canonical formatter.
// Existing Highlights / Morning Brief / Notes sections are preserved.
func BackfillJournal(ctx context.Context, queries *db.Queries, rawDB db.DBTX, journalSvc *journal.Service) error {
	enricher := NewSessionEnricher(queries, rawDB, func(string, interface{}) {})

	sessions, err := queries.ListSessions(ctx)
	if err != nil {
		return fmt.Errorf("list sessions: %w", err)
	}

	completed := make([]db.Session, 0, len(sessions))
	for _, s := range sessions {
		if s.EndedAt.Valid && s.EndedAt.Int64 > 0 {
			completed = append(completed, s)
		}
	}
	sort.Slice(completed, func(i, j int) bool {
		return startedAtOrZero(completed[i]) < startedAtOrZero(completed[j])
	})

	linesByDate := make(map[string][]string)
	for _, s := range completed {
		enricher.EnrichSession(ctx, s.ID)

		fresh, err := queries.GetSession(ctx, s.ID)
		if err != nil {
			continue
		}

		date := backfillDate(fresh)
		if date == "" {
			continue
		}
		ts := backfillTimestamp(fresh)
		linesByDate[date] = append(linesByDate[date], FormatSessionEndLine(fresh, ts))
	}

	dates := make([]string, 0, len(linesByDate))
	for d := range linesByDate {
		dates = append(dates, d)
	}
	sort.Strings(dates)

	totalSessions := 0
	for _, d := range dates {
		lines := linesByDate[d]
		fmt.Printf("[backfill] processing %s (%d sessions)\n", d, len(lines))
		if err := journalSvc.ReplaceWorkLog(d, lines); err != nil {
			return fmt.Errorf("replace work log %s: %w", d, err)
		}
		totalSessions += len(lines)
	}
	fmt.Printf("[backfill] done — %d sessions across %d dates rewritten\n", totalSessions, len(dates))
	return nil
}

func startedAtOrZero(s db.Session) int64 {
	if s.StartedAt.Valid {
		return s.StartedAt.Int64
	}
	return 0
}

func backfillDate(s db.Session) string {
	if s.Date.Valid && s.Date.String != "" {
		return s.Date.String
	}
	if s.StartedAt.Valid && s.StartedAt.Int64 > 0 {
		return time.Unix(s.StartedAt.Int64, 0).Format("2006-01-02")
	}
	if s.EndedAt.Valid && s.EndedAt.Int64 > 0 {
		return time.Unix(s.EndedAt.Int64, 0).Format("2006-01-02")
	}
	return ""
}

func backfillTimestamp(s db.Session) string {
	if s.EndedAt.Valid && s.EndedAt.Int64 > 0 {
		return time.Unix(s.EndedAt.Int64, 0).Format("15:04")
	}
	if s.StartedAt.Valid && s.StartedAt.Int64 > 0 {
		return time.Unix(s.StartedAt.Int64, 0).Format("15:04")
	}
	return "00:00"
}
