// Author: Subash Karki
package terminal

import "context"

// Snapshot captures the state of a terminal session for cold restore.
// It is serialised to/from JSON by the collector layer (not this package).
type Snapshot struct {
	PaneID      string `json:"pane_id"`
	WorktreeID  string `json:"worktree_id"`
	Shell       string `json:"shell"`
	CWD         string `json:"cwd"`
	Cols        uint16 `json:"cols"`
	Rows        uint16 `json:"rows"`
	Scrollback  []byte `json:"scrollback"`
	LastActiveAt int64  `json:"last_active_at"`
}

const restoreBanner = "--- Previous session restored ---\r\n"

// TakeSnapshots iterates all active sessions and captures their current
// state, including the scrollback ring buffer contents.
func (m *Manager) TakeSnapshots() []Snapshot {
	var snaps []Snapshot

	m.sessions.Range(func(_, value any) bool {
		s := value.(*Session)
		info := s.Info()

		snaps = append(snaps, Snapshot{
			PaneID:       info.ID,
			Shell:        info.Shell,
			CWD:          info.CWD,
			Cols:         info.Cols,
			Rows:         info.Rows,
			Scrollback:   s.Scrollback.Bytes(),
			LastActiveAt: info.LastActiveAt.Unix(),
		})
		return true
	})

	return snaps
}

// RestoreFromSnapshots recreates sessions from previously captured snapshots.
// Each snapshot results in a new PTY session at the original CWD with the
// same dimensions. The previous scrollback is written to the new PTY (with
// a banner prefix) so the user sees prior output. Returns the list of
// successfully restored session IDs.
func (m *Manager) RestoreFromSnapshots(ctx context.Context, snapshots []Snapshot) []string {
	var restored []string

	for _, snap := range snapshots {
		id := snap.PaneID
		if id == "" {
			continue
		}

		sess, err := m.Create(ctx, id, snap.CWD, snap.Cols, snap.Rows)
		if err != nil {
			// Skip this snapshot — log upstream can handle the gap.
			continue
		}

		// Prepend the restore banner to the scrollback, then write
		// the old content into the new session's scrollback buffer so
		// subscribers that attach later get the history.
		banner := []byte(restoreBanner)
		_, _ = sess.Scrollback.Write(banner)
		if len(snap.Scrollback) > 0 {
			_, _ = sess.Scrollback.Write(snap.Scrollback)
		}

		restored = append(restored, id)
	}

	return restored
}
