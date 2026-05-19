// Author: Subash Karki
package git

import (
	"sync/atomic"
	"testing"
	"time"
)

func TestDebouncerCoalesces(t *testing.T) {
	var count atomic.Int32
	d := NewDebouncer(50*time.Millisecond, 200*time.Millisecond, func() {
		count.Add(1)
	})
	defer d.Stop()

	// Rapid triggers within the debounce window should coalesce to 1 fire.
	for i := 0; i < 10; i++ {
		d.Trigger()
		time.Sleep(10 * time.Millisecond)
	}

	// Wait for debounce to fire (50ms after last trigger).
	time.Sleep(100 * time.Millisecond)

	if got := count.Load(); got != 1 {
		t.Errorf("expected 1 fire, got %d", got)
	}
}

func TestDebouncerCooldown(t *testing.T) {
	var count atomic.Int32
	d := NewDebouncer(50*time.Millisecond, 300*time.Millisecond, func() {
		count.Add(1)
	})
	defer d.Stop()

	// First trigger → fires after 50ms.
	d.Trigger()
	time.Sleep(100 * time.Millisecond) // fire happened
	if got := count.Load(); got != 1 {
		t.Fatalf("expected 1 fire after first trigger, got %d", got)
	}

	// Trigger during cooldown → should schedule trailing fire.
	d.Trigger()
	time.Sleep(50 * time.Millisecond) // still in cooldown, should NOT have fired yet
	if got := count.Load(); got != 1 {
		t.Fatalf("expected still 1 fire during cooldown, got %d", got)
	}

	// Wait for cooldown (300ms) + debounce (50ms) + margin.
	time.Sleep(400 * time.Millisecond)
	if got := count.Load(); got != 2 {
		t.Errorf("expected 2 fires after cooldown trailing, got %d", got)
	}
}

func TestDebouncerNoCooldownBlock(t *testing.T) {
	var count atomic.Int32
	d := NewDebouncer(30*time.Millisecond, 100*time.Millisecond, func() {
		count.Add(1)
	})
	defer d.Stop()

	// Fire once.
	d.Trigger()
	time.Sleep(60 * time.Millisecond) // debounce fires

	// Wait out cooldown.
	time.Sleep(120 * time.Millisecond)

	// Trigger again — should fire normally (not blocked).
	d.Trigger()
	time.Sleep(60 * time.Millisecond)

	if got := count.Load(); got != 2 {
		t.Errorf("expected 2 fires after cooldown expired, got %d", got)
	}
}

func TestDebouncerStop(t *testing.T) {
	var count atomic.Int32
	d := NewDebouncer(50*time.Millisecond, 100*time.Millisecond, func() {
		count.Add(1)
	})

	d.Trigger()
	d.Stop()
	time.Sleep(100 * time.Millisecond)

	if got := count.Load(); got != 0 {
		t.Errorf("expected 0 fires after Stop, got %d", got)
	}
}
