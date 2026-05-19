// Author: Subash Karki
package git

import "sync"

// Throttle ensures only one invocation of fn runs at a time.
// If called while fn is running, exactly one additional call is queued (latest-wins).
// Additional calls while one is already queued are coalesced — the queue depth is 1.
// This matches VS Code's @throttle decorator behavior on status(), fetch(), push().
type Throttle struct {
	mu      sync.Mutex
	running bool
	queued  bool
	fn      func()
}

// NewThrottle creates a Throttle that guards fn.
func NewThrottle(fn func()) *Throttle {
	return &Throttle{fn: fn}
}

// Trigger requests an invocation of fn. If fn is already running, at most one
// additional invocation is queued. Subsequent calls while queued are dropped.
func (t *Throttle) Trigger() {
	t.mu.Lock()
	if t.running {
		t.queued = true
		t.mu.Unlock()
		return
	}
	t.running = true
	t.mu.Unlock()

	go func() {
		for {
			t.fn()
			t.mu.Lock()
			if !t.queued {
				t.running = false
				t.mu.Unlock()
				return
			}
			t.queued = false
			t.mu.Unlock()
		}
	}()
}
