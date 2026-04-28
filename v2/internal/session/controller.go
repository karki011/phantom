// controller.go is the high-level session lifecycle service for PhantomOS v2.
// Author: Subash Karki
package session

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/subashkarki/phantom-os-v2/internal/stream"
)

// Controller orchestrates pause/resume, branching, rewinding, and policy
// management for all active sessions.
type Controller struct {
	states    *StateManager
	policies  *PolicyStore
	branches  *BranchStore
	pauses    sync.Map // sessionID -> *PauseBuffer
	stream    *stream.Store
	emitEvent func(string, interface{})
	pidLookup func(sessionID string) (int64, error)
}

// SetPIDLookup registers a callback to resolve a session ID to its process PID.
func (c *Controller) SetPIDLookup(fn func(string) (int64, error)) {
	c.pidLookup = fn
}

// NewController creates a Controller wired to the given dependencies.
// emitEvent is typically wailsRuntime.EventsEmit (or a test stub).
func NewController(writer *sql.DB, streamStore *stream.Store, emitEvent func(string, interface{})) *Controller {
	return &Controller{
		states:    NewStateManager(writer),
		policies:  NewPolicyStore(writer),
		branches:  NewBranchStore(writer),
		stream:    streamStore,
		emitEvent: emitEvent,
	}
}

// Init creates all required tables and loads persisted state into memory.
func (c *Controller) Init(ctx context.Context) error {
	if err := c.states.Init(ctx); err != nil {
		return fmt.Errorf("session/controller: init states: %w", err)
	}
	if err := c.branches.Init(ctx); err != nil {
		return fmt.Errorf("session/controller: init branches: %w", err)
	}
	if err := c.states.LoadFromDB(ctx); err != nil {
		return fmt.Errorf("session/controller: load state from db: %w", err)
	}
	return nil
}

// Pause pauses a session, starting output buffering and suspending the process via SIGTSTP.
func (c *Controller) Pause(ctx context.Context, sessionID string) error {
	pb := NewPauseBuffer()
	pb.Pause()
	c.pauses.Store(sessionID, pb)

	if err := c.states.SetState(ctx, sessionID, StatePaused); err != nil {
		return fmt.Errorf("session/controller: pause %s: %w", sessionID, err)
	}
	c.emitEvent("session:paused", map[string]string{"session_id": sessionID})

	// Attempt real process suspension via SIGTSTP.
	if c.pidLookup != nil {
		if pid, err := c.pidLookup(sessionID); err == nil && pid > 0 {
			if suspendErr := SuspendProcess(int(pid)); suspendErr != nil {
				slog.Warn("session/controller: suspend process failed", "pid", pid, "sessionID", sessionID, "err", suspendErr)
			}
		}
	}
	return nil
}

// Resume flushes buffered output via flushTo, transitions the session back to active,
// and sends SIGCONT to the Claude process.
func (c *Controller) Resume(ctx context.Context, sessionID string, flushTo func([]byte)) error {
	if v, ok := c.pauses.Load(sessionID); ok {
		pb := v.(*PauseBuffer)
		pb.Resume(flushTo)
		c.pauses.Delete(sessionID)
	}

	if err := c.states.SetState(ctx, sessionID, StateActive); err != nil {
		return fmt.Errorf("session/controller: resume %s: %w", sessionID, err)
	}
	c.emitEvent("session:resumed", map[string]string{"session_id": sessionID})

	// Resume suspended process via SIGCONT.
	if c.pidLookup != nil {
		if pid, err := c.pidLookup(sessionID); err == nil && pid > 0 {
			if resumeErr := ResumeProcess(int(pid)); resumeErr != nil {
				slog.Warn("session/controller: resume process failed", "pid", pid, "sessionID", sessionID, "err", resumeErr)
			}
		}
	}
	return nil
}

// Branch creates a new session forked from sessionID at atEventSeq.
// Events up to (and including) atEventSeq are copied to the new session.
func (c *Controller) Branch(ctx context.Context, sessionID string, atEventSeq int) (*BranchInfo, error) {
	// Fetch events to copy. Use a large limit and filter by SeqNum.
	allEvents, err := c.stream.GetEvents(ctx, sessionID, 0, atEventSeq+1)
	if err != nil {
		return nil, fmt.Errorf("session/controller: branch fetch events: %w", err)
	}

	branchID := uuid.New().String()
	now := time.Now().Unix()

	// Copy events (preserving seq_num semantics).
	var toSave []stream.Event
	for _, ev := range allEvents {
		if ev.SeqNum > atEventSeq {
			break
		}
		cp := ev
		cp.SessionID = branchID
		toSave = append(toSave, cp)
	}

	if err := c.stream.SaveBatch(ctx, toSave); err != nil {
		return nil, fmt.Errorf("session/controller: branch save events: %w", err)
	}

	info := BranchInfo{
		ID:          branchID,
		ParentID:    sessionID,
		BranchPoint: atEventSeq,
		CreatedAt:   now,
	}
	if err := c.branches.Create(ctx, info); err != nil {
		return nil, fmt.Errorf("session/controller: branch record: %w", err)
	}

	// Initialise state for the new branch session.
	ss := &SessionState{
		SessionID:    branchID,
		State:        StateBranched,
		Policy:       c.policies.GetDefault(ctx),
		BranchParent: sessionID,
		BranchPoint:  atEventSeq,
		EventCount:   len(toSave),
	}
	c.states.states.Store(branchID, ss)
	if err := c.states.persist(ctx, ss); err != nil {
		return nil, fmt.Errorf("session/controller: branch state: %w", err)
	}

	c.emitEvent("session:branched", map[string]interface{}{
		"session_id": sessionID,
		"branch_id":  branchID,
		"at_seq":     atEventSeq,
	})
	return &info, nil
}

// Rewind soft-marks a session as rewound to toEventSeq.
// Events after toEventSeq are not deleted — they remain in the DB but the
// session state records the rewind point so the UI can grey them out.
func (c *Controller) Rewind(ctx context.Context, sessionID string, toEventSeq int) error {
	var ss *SessionState
	if v, ok := c.states.states.Load(sessionID); ok {
		ss = v.(*SessionState)
	} else {
		ss = &SessionState{SessionID: sessionID, Policy: PolicySupervised}
	}

	ss.State = StateRewound
	ss.BranchPoint = toEventSeq // reuse BranchPoint to record rewind target
	c.states.states.Store(sessionID, ss)

	if err := c.states.persist(ctx, ss); err != nil {
		return fmt.Errorf("session/controller: rewind %s to %d: %w", sessionID, toEventSeq, err)
	}

	c.emitEvent("session:rewound", map[string]interface{}{
		"session_id": sessionID,
		"to_seq":     toEventSeq,
	})
	return nil
}

// SetPolicy changes the approval policy for a session and updates state.
func (c *Controller) SetPolicy(ctx context.Context, sessionID string, policy Policy) error {
	if err := c.policies.Set(ctx, sessionID, policy); err != nil {
		return err
	}
	// Reflect policy change in the in-memory state snapshot.
	if v, ok := c.states.states.Load(sessionID); ok {
		ss := v.(*SessionState)
		ss.Policy = policy
		c.states.states.Store(sessionID, ss)
	}
	return nil
}

// GetState returns the current in-memory state for a session (nil if unknown).
func (c *Controller) GetState(sessionID string) *SessionState {
	return c.states.Get(sessionID)
}

// GetBranches returns all recorded branches of a session.
func (c *Controller) GetBranches(ctx context.Context, sessionID string) ([]BranchInfo, error) {
	return c.branches.ListForSession(ctx, sessionID)
}

// IsPaused returns true when output buffering is active for the session.
func (c *Controller) IsPaused(sessionID string) bool {
	if v, ok := c.pauses.Load(sessionID); ok {
		return v.(*PauseBuffer).IsPaused()
	}
	return false
}

// Kill terminates a session by sending SIGTERM to its process group and cleaning up state.
func (c *Controller) Kill(ctx context.Context, sessionID string) error {
	// Stop buffering.
	if v, ok := c.pauses.LoadAndDelete(sessionID); ok {
		pb := v.(*PauseBuffer)
		pb.Resume(func([]byte) {})
	}

	// Kill process.
	if c.pidLookup != nil {
		if pid, err := c.pidLookup(sessionID); err == nil && pid > 0 {
			if killErr := KillProcess(int(pid)); killErr != nil {
				slog.Warn("session/controller: kill process failed", "pid", pid, "sessionID", sessionID, "err", killErr)
			}
		}
	}

	if err := c.states.SetState(ctx, sessionID, StateComplete); err != nil {
		return fmt.Errorf("session/controller: kill %s: %w", sessionID, err)
	}
	c.emitEvent("session:killed", map[string]string{"session_id": sessionID})
	return nil
}

// BufferIfPaused captures data if the session is paused. Returns true if buffered.
func (c *Controller) BufferIfPaused(sessionID string, data []byte) bool {
	if v, ok := c.pauses.Load(sessionID); ok {
		return v.(*PauseBuffer).Write(data)
	}
	return false
}
