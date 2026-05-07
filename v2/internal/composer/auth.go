// Author: Subash Karki
//
// auth.go coordinates OAuth token management across concurrent Claude CLI
// sessions. It serializes subprocess spawns so only one process at a time
// can trigger a token refresh, and provides coordinated refresh that pauses
// all active sessions while a single refresh subprocess runs.
package composer

import (
	"context"
	"fmt"
	"os/exec"
	"sync"
	"time"

	"github.com/charmbracelet/log"
)

// tokenProbeTimeout is how long we wait for the token validity probe.
const tokenProbeTimeout = 5 * time.Second

// tokenRefreshTimeout is how long we wait for the refresh subprocess.
const tokenRefreshTimeout = 15 * time.Second

// ProbeFactory builds the *exec.Cmd used to check token validity.
// Inject a test double to avoid calling the real claude CLI in tests.
type ProbeFactory func(ctx context.Context) *exec.Cmd

// RefreshFactory builds the *exec.Cmd used to refresh the OAuth token.
// Inject a test double to avoid calling the real claude CLI in tests.
type RefreshFactory func(ctx context.Context) *exec.Cmd

// AuthCoordinator serializes subprocess spawns and coordinates token
// refresh across all active sessions managed by a Manager.
type AuthCoordinator struct {
	mu      sync.Mutex
	manager *Manager

	// ProbeCmd builds the token-validity probe command.
	// Defaults to: claude auth status
	ProbeCmd ProbeFactory

	// RefreshCmd builds the token-refresh command.
	// Defaults to: claude auth login
	RefreshCmd RefreshFactory
}

// NewAuthCoordinator creates an AuthCoordinator linked to the given Manager.
func NewAuthCoordinator(m *Manager) *AuthCoordinator {
	return &AuthCoordinator{
		manager: m,
		ProbeCmd: func(ctx context.Context) *exec.Cmd {
			bin, err := DetectClaudeBinary()
			if err != nil {
				bin = "claude"
			}
			cmd := exec.CommandContext(ctx, bin, "auth", "status")
			cmd.Env = AugmentedEnv()
			return cmd
		},
		RefreshCmd: func(ctx context.Context) *exec.Cmd {
			bin, err := DetectClaudeBinary()
			if err != nil {
				bin = "claude"
			}
			cmd := exec.CommandContext(ctx, bin, "auth", "login")
			cmd.Env = AugmentedEnv()
			return cmd
		},
	}
}

// SerializedSpawn acquires the coordinator lock so only one spawn runs at
// a time, then spawns the session. Auth probe runs in the background after
// spawn to avoid blocking the UI — the CLI manages its own tokens internally,
// so a pre-spawn probe is not required for correctness.
func (ac *AuthCoordinator) SerializedSpawn(s *Session) error {
	ac.mu.Lock()
	defer ac.mu.Unlock()

	if err := s.Spawn(); err != nil {
		return err
	}

	// Background auth probe — if it fails, attempt a coordinated refresh.
	// This is best-effort and does not affect the already-spawned session.
	go func() {
		if err := ac.probeToken(); err != nil {
			ac.mu.Lock()
			if refreshErr := ac.coordinatedRefreshLocked(); refreshErr != nil {
				log.Warn("composer: background auth probe/refresh failed", "err", refreshErr)
			}
			ac.mu.Unlock()
		}
	}()

	return nil
}

// CoordinatedRefresh pauses all active sessions, runs a single token
// refresh, then resumes or marks sessions as auth_failed.
func (ac *AuthCoordinator) CoordinatedRefresh() error {
	ac.mu.Lock()
	defer ac.mu.Unlock()
	return ac.coordinatedRefreshLocked()
}

// HandleAuthEvent is called when any session emits an auth-related error.
// It triggers a coordinated refresh for all sessions.
func (ac *AuthCoordinator) HandleAuthEvent(_ string) {
	// Fire-and-forget — callers don't need to block on this.
	// The mutex ensures only one refresh runs at a time.
	_ = ac.CoordinatedRefresh()
}

// probeToken runs a lightweight claude invocation to check token validity.
func (ac *AuthCoordinator) probeToken() error {
	ctx, cancel := context.WithTimeout(context.Background(), tokenProbeTimeout)
	defer cancel()

	cmd := ac.ProbeCmd(ctx)
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("token probe failed: %w", err)
	}
	return nil
}

// coordinatedRefreshLocked performs the actual refresh. Caller must hold ac.mu.
func (ac *AuthCoordinator) coordinatedRefreshLocked() error {
	// Collect and pause all running sessions.
	paused := ac.pauseActiveSessions()

	// Run a single refresh subprocess.
	ctx, cancel := context.WithTimeout(context.Background(), tokenRefreshTimeout)
	defer cancel()

	cmd := ac.RefreshCmd(ctx)
	if err := cmd.Run(); err != nil {
		// Refresh failed — mark all paused sessions as auth_failed.
		for _, s := range paused {
			s.setStatus(StatusAuthFailed)
		}
		return fmt.Errorf("auth refresh: %w", err)
	}

	// Refresh succeeded — resume all paused sessions.
	for _, s := range paused {
		s.setStatus(StatusRunning)
	}
	return nil
}

// pauseActiveSessions sets all running sessions to StatusPaused and returns
// the list of sessions that were paused.
func (ac *AuthCoordinator) pauseActiveSessions() []*Session {
	ac.manager.mu.RLock()
	defer ac.manager.mu.RUnlock()

	var paused []*Session
	for _, s := range ac.manager.sessions {
		if s.Status() == StatusRunning {
			s.setStatus(StatusPaused)
			paused = append(paused, s)
		}
	}
	return paused
}
