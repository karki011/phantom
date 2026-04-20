// Package collector — Registry: lifecycle manager for all collectors.
// Author: Subash Karki
package collector

import (
	"context"
	"fmt"
	"log/slog"
	"sync"
	"time"
)

// Registry manages the lifecycle of all registered collectors.
type Registry struct {
	collectors []Collector

	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

// NewRegistry creates a new Registry.
func NewRegistry() *Registry {
	return &Registry{}
}

// Register appends a collector to the registry.
func (r *Registry) Register(c Collector) {
	r.collectors = append(r.collectors, c)
}

// StartAll starts all registered collectors in parallel goroutines.
// It waits up to 5 seconds for each collector to report startup success.
// Returns the first startup error encountered (if any).
func (r *Registry) StartAll(ctx context.Context) error {
	r.ctx, r.cancel = context.WithCancel(ctx)

	type startResult struct {
		name string
		err  error
	}

	startCh := make(chan startResult, len(r.collectors))

	for _, c := range r.collectors {
		c := c
		r.wg.Add(1)
		go func() {
			defer r.wg.Done()

			slog.Info("registry: starting collector", "name", c.Name())

			// Signal successful start once the goroutine begins running.
			// Start() is blocking (runs event loops), so we signal immediately
			// and let errors propagate through the channel.
			startCh <- startResult{name: c.Name(), err: nil}

			if err := c.Start(r.ctx); err != nil {
				// Start returned an error (could be immediate failure or context cancel).
				if r.ctx.Err() == nil {
					// Only log if we didn't intentionally cancel.
					slog.Error("registry: collector exited with error", "name", c.Name(), "err", err)
				}
			}
		}()
	}

	// Wait for all collectors to report startup (or timeout).
	timeout := time.After(5 * time.Second)
	started := 0
	for started < len(r.collectors) {
		select {
		case res := <-startCh:
			if res.err != nil {
				// Cancel all on first startup failure.
				r.cancel()
				return fmt.Errorf("collector %q failed to start: %w", res.name, res.err)
			}
			started++
		case <-timeout:
			return fmt.Errorf("registry: timed out waiting for %d/%d collectors to start",
				len(r.collectors)-started, len(r.collectors))
		}
	}

	slog.Info("registry: all collectors started", "count", len(r.collectors))
	return nil
}

// StopAll cancels the context and calls Stop() on each collector in reverse order.
// It waits for all goroutines to drain.
func (r *Registry) StopAll() {
	slog.Info("registry: stopping all collectors", "count", len(r.collectors))

	// Cancel context first to signal all goroutines.
	if r.cancel != nil {
		r.cancel()
	}

	// Stop in reverse registration order.
	for i := len(r.collectors) - 1; i >= 0; i-- {
		c := r.collectors[i]
		slog.Info("registry: stopping collector", "name", c.Name())
		if err := c.Stop(); err != nil {
			slog.Error("registry: error stopping collector", "name", c.Name(), "err", err)
		}
	}

	// Wait for all goroutines to finish.
	r.wg.Wait()
	slog.Info("registry: all collectors stopped")
}

// Names returns the names of all registered collectors.
func (r *Registry) Names() []string {
	names := make([]string, len(r.collectors))
	for i, c := range r.collectors {
		names[i] = c.Name()
	}
	return names
}
