// Author: Subash Karki
package terminal

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/log"
	"github.com/creack/pty"
)

// defaultLingerHours is the default time a detached PTY is kept alive
// before the reaper kills it. Override via PHANTOM_PTY_LINGER_HOURS.
const defaultLingerHours = 24

// reaperTickInterval is how often the reaper checks for stale detached PTYs.
const reaperTickInterval = 5 * time.Minute

// Manager is the terminal lifecycle manager. It owns all active sessions
// and serialises create/destroy operations.
type Manager struct {
	sessions sync.Map // map[string]*Session
	mu       sync.Mutex
}

// New creates a Manager.
func New() *Manager {
	return &Manager{}
}

// Create spawns a new PTY session. It resolves the user's shell, builds a
// clean environment, starts the process inside a PTY, and registers the
// session. ctx is the parent context; cancelling it will stop the session.
func (m *Manager) Create(ctx context.Context, id, cwd string, cols, rows uint16) (*Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Prevent duplicate IDs.
	if _, loaded := m.sessions.Load(id); loaded {
		return nil, fmt.Errorf("terminal/manager: session %q already exists", id)
	}

	// Resolve shell binary.
	shell := resolveShell()

	// Build clean env.
	env := buildCleanEnv()

	// Default args + integration tweaks. When shell integration is enabled
	// for this shell we replace `--login` with shell-specific flags and
	// append a few env vars that the integration scripts read.
	args := []string{"--login"}
	if cfg, ok := shellIntegrationFor(shell); ok {
		args = cfg.args
		env = append(env, cfg.env...)
	}

	ctx, cancel := context.WithCancel(ctx)

	cmd := exec.CommandContext(ctx, shell, args...)
	cmd.Dir = cwd
	cmd.Env = env

	// Start the command inside a PTY with the requested window size.
	ptmx, err := pty.StartWithSize(cmd, &pty.Winsize{Cols: cols, Rows: rows})
	if err != nil {
		cancel()
		return nil, fmt.Errorf("terminal/manager: pty.StartWithSize: %w", err)
	}

	now := time.Now()
	sess := &Session{
		ID:           id,
		PTY:          ptmx,
		Cmd:          cmd,
		Ctx:          ctx,
		Cancel:       cancel,
		listeners:    make(map[string]chan []byte),
		Scrollback:   NewRingBuffer(defaultScrollbackSize),
		Cols:         cols,
		Rows:         rows,
		CWD:          cwd,
		Shell:        shell,
		CreatedAt:    now,
		LastActiveAt: now,
	}

	sess.Start()
	m.sessions.Store(id, sess)

	return sess, nil
}

// Get retrieves a session by ID.
func (m *Manager) Get(id string) (*Session, bool) {
	v, ok := m.sessions.Load(id)
	if !ok {
		return nil, false
	}
	return v.(*Session), true
}

// Write delegates a write to the identified session's PTY input.
func (m *Manager) Write(id string, data []byte) error {
	sess, ok := m.Get(id)
	if !ok {
		return fmt.Errorf("terminal/manager: session %q not found", id)
	}
	return sess.Write(data)
}

// Resize delegates a resize to the identified session.
func (m *Manager) Resize(id string, cols, rows uint16) error {
	sess, ok := m.Get(id)
	if !ok {
		return fmt.Errorf("terminal/manager: session %q not found", id)
	}
	return sess.Resize(cols, rows)
}

// Destroy closes and removes a session.
func (m *Manager) Destroy(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	v, loaded := m.sessions.LoadAndDelete(id)
	if !loaded {
		return fmt.Errorf("terminal/manager: session %q not found", id)
	}
	v.(*Session).Close()
	return nil
}

// DestroyAll closes every session. Used during graceful application shutdown.
func (m *Manager) DestroyAll() {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.sessions.Range(func(key, value any) bool {
		value.(*Session).Close()
		m.sessions.Delete(key)
		return true
	})
}

// List returns metadata for all active sessions.
func (m *Manager) List() []SessionInfo {
	var infos []SessionInfo
	m.sessions.Range(func(_, value any) bool {
		infos = append(infos, value.(*Session).Info())
		return true
	})
	return infos
}

// Count returns the number of active sessions.
func (m *Manager) Count() int {
	count := 0
	m.sessions.Range(func(_, _ any) bool {
		count++
		return true
	})
	return count
}

// MarkAttached records that a frontend listener attached to the session.
// Clears any prior detach timestamp so the reaper won't kill it.
func (m *Manager) MarkAttached(id string) {
	if sess, ok := m.Get(id); ok {
		sess.mu.Lock()
		sess.LastDetachedAt = time.Time{}
		sess.mu.Unlock()
	}
}

// MarkDetached records that the last frontend listener dropped. Once
// detached for longer than the linger window the reaper destroys the PTY.
func (m *Manager) MarkDetached(id string) {
	if sess, ok := m.Get(id); ok {
		sess.mu.Lock()
		sess.LastDetachedAt = time.Now()
		sess.mu.Unlock()
	}
}

// StartReaper launches a background goroutine that, every reaperTickInterval,
// destroys any session whose LastDetachedAt is older than the linger window.
// The window defaults to 24h and is overridable via PHANTOM_PTY_LINGER_HOURS.
// The goroutine exits when ctx is cancelled.
func (m *Manager) StartReaper(ctx context.Context) {
	go m.reapLoop(ctx)
}

func (m *Manager) reapLoop(ctx context.Context) {
	ticker := time.NewTicker(reaperTickInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.reapStale()
		}
	}
}

// reapStale destroys sessions detached longer than the configured linger window.
// Attached sessions (LastDetachedAt zero) are never reaped.
func (m *Manager) reapStale() {
	linger := lingerWindow()
	cutoff := time.Now().Add(-linger)

	var toReap []string
	m.sessions.Range(func(key, value any) bool {
		sess := value.(*Session)
		sess.mu.RLock()
		detachedAt := sess.LastDetachedAt
		sess.mu.RUnlock()
		if !detachedAt.IsZero() && detachedAt.Before(cutoff) {
			toReap = append(toReap, key.(string))
		}
		return true
	})

	for _, id := range toReap {
		log.Info("terminal/manager: reaping stale detached session", "id", id, "linger", linger.String())
		_ = m.Destroy(id)
	}
}

// lingerWindow reads PHANTOM_PTY_LINGER_HOURS, falling back to defaultLingerHours.
func lingerWindow() time.Duration {
	if raw := os.Getenv("PHANTOM_PTY_LINGER_HOURS"); raw != "" {
		if hours, err := strconv.Atoi(raw); err == nil && hours > 0 {
			return time.Duration(hours) * time.Hour
		}
	}
	return defaultLingerHours * time.Hour
}

// AdoptOrphans is a stub for future PTY-survives-Go-restart support. Today,
// PTYs are children of the Go process and die with it on full quit (Cmd+Q),
// so there are no live orphans to adopt. The MarkOrphanedTerminalsEnded DB
// reconciliation already handles the post-restart cleanup. Method exists so
// callers can wire it now and we can fill in a real implementation when the
// detached-helper mode lands.
func (m *Manager) AdoptOrphans(_ context.Context) {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// resolveShell picks the best available shell. It checks $SHELL first, then
// falls back through zsh → bash → sh.
func resolveShell() string {
	if sh := os.Getenv("SHELL"); sh != "" {
		if _, err := os.Stat(sh); err == nil {
			return sh
		}
	}

	for _, candidate := range []string{"/bin/zsh", "/bin/bash", "/bin/sh"} {
		if _, err := os.Stat(candidate); err == nil {
			return candidate
		}
	}

	// Last resort — rely on PATH lookup.
	return "sh"
}

// buildCleanEnv creates a sanitised copy of the current environment suitable
// for a terminal session.
func buildCleanEnv() []string {
	// Keys to strip — these leak Electron/Node context into the shell.
	strip := map[string]bool{
		"ELECTRON_RUN_AS_NODE": true,
		"npm_config_prefix":    true,
	}

	var env []string
	hasTerm := false
	hasLang := false
	hasPath := false

	for _, kv := range os.Environ() {
		key := kv
		if idx := strings.IndexByte(kv, '='); idx >= 0 {
			key = kv[:idx]
		}

		if strip[key] {
			continue
		}

		switch key {
		case "TERM":
			// Override to ensure 256-color support.
			env = append(env, "TERM=xterm-256color")
			hasTerm = true
		case "LANG":
			env = append(env, "LANG=en_US.UTF-8")
			hasLang = true
		case "PATH":
			env = append(env, ensurePATH(kv))
			hasPath = true
		default:
			env = append(env, kv)
		}
	}

	if !hasTerm {
		env = append(env, "TERM=xterm-256color")
	}
	if !hasLang {
		env = append(env, "LANG=en_US.UTF-8")
	}
	if !hasPath {
		env = append(env, "PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin")
	}

	return env
}

// ensurePATH makes sure /usr/local/bin and /opt/homebrew/bin appear in PATH.
func ensurePATH(pathKV string) string {
	const prefix = "PATH="
	val := pathKV[len(prefix):]

	needed := []string{"/usr/local/bin", "/opt/homebrew/bin"}
	for _, dir := range needed {
		if !strings.Contains(val, dir) {
			val = dir + ":" + val
		}
	}
	return prefix + val
}
