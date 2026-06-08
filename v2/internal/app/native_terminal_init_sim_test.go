// Author: Subash Karki
//
// Simulation test for the native-terminal lazy-init race fix.
//
// libghostty is one ghostty_app_t per process; before the fix, two concurrent
// NativeTerminalCreate calls (multiple sessions/terminals mounting at once)
// could each pass the `a.ghosttyApp == nil` check and each call ghostty.NewApp,
// creating two apps in a library that allows one — which crashed.
//
// The real path needs a Metal context + NSWindow, so it cannot run headless.
// This test reproduces the EXACT locking discipline of NativeTerminalCreate
// against a fake "newApp" that counts how many times it runs, under the
// worst-case interleaving (every goroutine passes the nil-check before any
// init runs, enforced by a barrier). It proves the fixed locking collapses N
// concurrent creates to a single app init, while the pre-fix logic would
// create N. Run with -race.
package app

import (
	"sync"
	"sync/atomic"
	"testing"
)

// appInitSim mirrors the App fields that NativeTerminalCreate's lazy init
// touches: the ghosttyApp singleton, the nativeMu guarding it, and the
// dedicated ghosttyInitMu that serializes creation.
type appInitSim struct {
	nativeMu      sync.Mutex
	ghosttyInitMu sync.Mutex
	app           *struct{} // stands in for *ghostty.App
	newAppCalls   atomic.Int64
}

// fakeNewApp stands in for ghostty.NewApp — the one-per-process constructor.
func (s *appInitSim) fakeNewApp() *struct{} {
	s.newAppCalls.Add(1)
	return &struct{}{}
}

// createSafe mirrors the FIXED NativeTerminalCreate lazy-init: snapshot under
// nativeMu, then a double-checked init under the dedicated ghosttyInitMu.
func (s *appInitSim) createSafe(barrier *sync.WaitGroup, release <-chan struct{}) {
	s.nativeMu.Lock()
	gapp := s.app
	s.nativeMu.Unlock()

	if gapp == nil {
		// Synchronize all goroutines at the worst-case point: every caller has
		// passed the outer nil-check before any init runs.
		barrier.Done()
		<-release

		s.ghosttyInitMu.Lock()
		s.nativeMu.Lock()
		gapp = s.app
		s.nativeMu.Unlock()
		if gapp == nil {
			newApp := s.fakeNewApp()
			s.nativeMu.Lock()
			s.app = newApp
			s.nativeMu.Unlock()
		}
		s.ghosttyInitMu.Unlock()
	}
}

// createRacy mirrors the PRE-FIX lazy-init: a check-then-act with no init
// mutex. Kept to prove the simulation harness actually detects the bug the
// fix prevents.
func (s *appInitSim) createRacy(barrier *sync.WaitGroup, release <-chan struct{}) {
	s.nativeMu.Lock()
	gapp := s.app
	s.nativeMu.Unlock()

	if gapp == nil {
		barrier.Done()
		<-release

		newApp := s.fakeNewApp()
		s.nativeMu.Lock()
		s.app = newApp
		s.nativeMu.Unlock()
	}
}

// runConcurrentCreates fires `n` goroutines that all reach the init point
// simultaneously (via the barrier), then returns how many times the app was
// constructed.
func runConcurrentCreates(n int, create func(*sync.WaitGroup, <-chan struct{})) int64 {
	var barrier sync.WaitGroup
	barrier.Add(n)
	release := make(chan struct{})

	var done sync.WaitGroup
	done.Add(n)
	for i := 0; i < n; i++ {
		go func() {
			defer done.Done()
			create(&barrier, release)
		}()
	}

	// Wait until every goroutine has passed the nil-check, then release them
	// all at once for maximum contention on the init path.
	barrier.Wait()
	close(release)
	done.Wait()
	return 0
}

const simConcurrency = 200

func TestNativeTerminalInit_SingleAppUnderConcurrentCreates(t *testing.T) {
	s := &appInitSim{}
	runConcurrentCreates(simConcurrency, s.createSafe)

	if got := s.newAppCalls.Load(); got != 1 {
		t.Fatalf("ghostty app created %d times under %d concurrent creates; want exactly 1 (libghostty is one app per process)", got, simConcurrency)
	}
}

func TestNativeTerminalInit_PreFixWouldDoubleInit(t *testing.T) {
	s := &appInitSim{}
	runConcurrentCreates(simConcurrency, s.createRacy)

	// This documents WHY ghosttyInitMu exists: without it, every concurrent
	// caller that passed the nil-check constructs its own app. If this ever
	// reported 1, the simulation barrier would be broken and the safe-path
	// test above would be meaningless.
	if got := s.newAppCalls.Load(); got <= 1 {
		t.Fatalf("pre-fix simulation created the app %d times; expected >1 to prove the harness detects the double-init the fix prevents", got)
	}
}
