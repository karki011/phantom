// Author: Subash Karki
//
// manager.go manages multiple concurrent Claude CLI sessions with
// thread-safe lifecycle operations and configurable capacity limits.
package composer

import (
	"fmt"
	"path/filepath"
	"sync"
)

// defaultMaxSessions is used when ManagerOptions.MaxSessions <= 0.
const defaultMaxSessions = 8

// ManagerOptions configures a Manager.
type ManagerOptions struct {
	MaxSessions int    // Maximum concurrent sessions (defaults to 8).
	BaseDir     string // Root directory for per-session artifacts.
}

// ManagerSessionInfo is a snapshot of a session's metadata for listing.
type ManagerSessionInfo struct {
	ID     string        `json:"id"`
	CWD    string        `json:"cwd"`
	Status SessionStatus `json:"status"`
	Name   string        `json:"name"`
}

// Manager tracks multiple Sessions behind a read-write mutex.
type Manager struct {
	mu       sync.RWMutex
	sessions map[string]*Session
	opts     ManagerOptions
	auth     *AuthCoordinator
}

// NewManager creates a Manager. If opts.MaxSessions <= 0 it defaults to 8.
func NewManager(opts ManagerOptions) *Manager {
	if opts.MaxSessions <= 0 {
		opts.MaxSessions = defaultMaxSessions
	}
	m := &Manager{
		sessions: make(map[string]*Session),
		opts:     opts,
	}
	m.auth = NewAuthCoordinator(m)
	return m
}

// Open returns an existing session for id, or creates and spawns a new one.
// Optional EventHandler arguments are registered on the session BEFORE the
// subprocess is spawned, guaranteeing no events are lost to a registration race.
// Returns a ManagerSessionInfo snapshot.
// Returns an error if the capacity limit is reached or Spawn fails.
//
// Two-phase locking: the session is inserted as a placeholder before Spawn,
// and the lock is released so a slow fork doesn't block concurrent operations.
// On spawn failure the placeholder is rolled back.
func (m *Manager) Open(id, cwd string, opts SessionOptions, handlers ...EventHandler) (ManagerSessionInfo, error) {
	m.mu.Lock()

	// Return existing session if found.
	if s, ok := m.sessions[id]; ok {
		info := ManagerSessionInfo{ID: s.ID, CWD: s.CWD, Status: s.Status(), Name: s.Name}
		m.mu.Unlock()
		return info, nil
	}

	// Purge dead sessions before checking capacity.
	for kid, ks := range m.sessions {
		st := ks.Status()
		if st == StatusStopped || st == StatusCrashed || st == StatusAuthFailed {
			delete(m.sessions, kid)
		}
	}

	// Enforce capacity.
	if len(m.sessions) >= m.opts.MaxSessions {
		m.mu.Unlock()
		return ManagerSessionInfo{}, fmt.Errorf("max sessions reached (%d)", m.opts.MaxSessions)
	}

	// Derive SessionDir from BaseDir + id when not explicitly set.
	if opts.SessionDir == "" && m.opts.BaseDir != "" {
		opts.SessionDir = filepath.Join(m.opts.BaseDir, id)
	}

	s := NewSession(id, cwd, opts)

	// Register handlers BEFORE Spawn so no early events are lost.
	for _, h := range handlers {
		s.OnEvent(h)
	}

	// Insert placeholder so capacity checks account for this session.
	m.sessions[id] = s
	m.mu.Unlock()

	// Spawn outside the lock — process fork can be slow.
	// Use AuthCoordinator to serialize spawns and handle token refresh.
	if err := m.auth.SerializedSpawn(s); err != nil {
		// Rollback: remove the placeholder on failure.
		m.mu.Lock()
		delete(m.sessions, id)
		m.mu.Unlock()
		return ManagerSessionInfo{}, fmt.Errorf("spawn session %q: %w", id, err)
	}

	return ManagerSessionInfo{ID: s.ID, CWD: s.CWD, Status: s.Status(), Name: s.Name}, nil
}

// Get returns the session for id. The bool indicates whether it was found.
func (m *Manager) Get(id string) (*Session, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	s, ok := m.sessions[id]
	return s, ok
}

// List returns a snapshot of all tracked sessions.
func (m *Manager) List() []ManagerSessionInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()

	out := make([]ManagerSessionInfo, 0, len(m.sessions))
	for _, s := range m.sessions {
		out = append(out, ManagerSessionInfo{
			ID:     s.ID,
			CWD:    s.CWD,
			Status: s.Status(),
			Name:   s.Name,
		})
	}
	return out
}

// PurgeDead removes sessions whose subprocess is no longer running.
func (m *Manager) PurgeDead() int {
	m.mu.Lock()
	var dead []string
	for id, s := range m.sessions {
		st := s.Status()
		if st == StatusStopped || st == StatusCrashed || st == StatusAuthFailed {
			dead = append(dead, id)
		}
	}
	for _, id := range dead {
		delete(m.sessions, id)
	}
	m.mu.Unlock()
	return len(dead)
}

// Close stops and removes a single session by id.
func (m *Manager) Close(id string) {
	m.mu.Lock()
	s, ok := m.sessions[id]
	if ok {
		delete(m.sessions, id)
	}
	m.mu.Unlock()

	if ok {
		s.Stop()
	}
}

// CloseAll stops every session and clears the map.
func (m *Manager) CloseAll() {
	m.mu.Lock()
	all := make([]*Session, 0, len(m.sessions))
	for _, s := range m.sessions {
		all = append(all, s)
	}
	m.sessions = make(map[string]*Session)
	m.mu.Unlock()

	for _, s := range all {
		s.Stop()
	}
}
