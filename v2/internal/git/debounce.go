// Author: Subash Karki
package git

import (
	"sync"
	"time"

	"github.com/charmbracelet/log"
)

// Debouncer coalesces rapid calls into a single execution after a quiet period.
// After execution, it enforces a cooldown before allowing the next trigger.
// This mirrors VS Code's 3-tier suppression:
//
//	FS event → debounce(delay) → execute → cooldown(cooldown)
//
// During cooldown, new triggers are remembered but not acted on until the
// cooldown expires, at which point one trailing execution fires automatically.
type Debouncer struct {
	mu        sync.Mutex
	timer     *time.Timer
	coolUntil time.Time
	trailing  bool // a trigger arrived during cooldown
	delay     time.Duration
	cooldown  time.Duration
	fn        func()
}

// NewDebouncer creates a debouncer that waits for `delay` of quiet time before
// calling fn, then enforces `cooldown` before allowing the next call.
func NewDebouncer(delay, cooldown time.Duration, fn func()) *Debouncer {
	return &Debouncer{
		delay:    delay,
		cooldown: cooldown,
		fn:       fn,
	}
}

// Trigger signals that an event occurred. The debouncer will coalesce rapid
// triggers and fire fn once after a quiet period. If currently in cooldown,
// the trigger is noted and fn will fire once the cooldown expires.
func (d *Debouncer) Trigger() {
	d.mu.Lock()
	defer d.mu.Unlock()

	now := time.Now()

	// If we're in cooldown, mark trailing and schedule a deferred fire
	if now.Before(d.coolUntil) {
		if !d.trailing {
			d.trailing = true
			remaining := d.coolUntil.Sub(now)
			log.Debug("debouncer: in cooldown, scheduling trailing fire", "remaining", remaining)
			// Schedule trailing fire after cooldown + debounce delay
			if d.timer != nil {
				d.timer.Stop()
			}
			d.timer = time.AfterFunc(remaining+d.delay, d.fire)
		}
		return
	}

	// Normal path: reset the debounce timer
	if d.timer != nil {
		d.timer.Stop()
	}
	d.timer = time.AfterFunc(d.delay, d.fire)
}

// fire executes the callback and sets the cooldown. Called by timer goroutine.
func (d *Debouncer) fire() {
	d.fn()

	d.mu.Lock()
	d.coolUntil = time.Now().Add(d.cooldown)
	d.trailing = false
	d.mu.Unlock()

	log.Debug("debouncer: fired, cooldown active", "cooldown", d.cooldown)
}

// Stop cancels any pending debounce timer.
func (d *Debouncer) Stop() {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.timer != nil {
		d.timer.Stop()
	}
}
