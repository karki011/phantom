// Author: Subash Karki
package git

import (
	"context"
	"sync"
)

// PriorityPool runs git tasks across a fixed worker pool with a high/low lane.
// Workers prefer high-priority work; low-priority work runs only when the high
// lane is empty. Follows the standard Go priority-select pattern.
type PriorityPool struct {
	workers int
	high    chan priorityTask
	low     chan priorityTask
	ctx     context.Context
	cancel  context.CancelFunc
	once    sync.Once
}

type priorityTask struct {
	fn func()
}

// NewPriorityPool spins up a pool. workers<=0 falls back to defaultWorkers.
func NewPriorityPool(ctx context.Context, workers int) *PriorityPool {
	if workers <= 0 {
		workers = defaultWorkers
	}
	pCtx, cancel := context.WithCancel(ctx)
	p := &PriorityPool{
		workers: workers,
		high:    make(chan priorityTask, 256),
		low:     make(chan priorityTask, 256),
		ctx:     pCtx,
		cancel:  cancel,
	}
	for i := 0; i < workers; i++ {
		go p.worker()
	}
	return p
}

// SubmitHigh enqueues a high-priority task (e.g., active project refresh).
// Non-blocking when buffer has space; falls back to synchronous run if full.
func (p *PriorityPool) SubmitHigh(fn func()) {
	if fn == nil {
		return
	}
	select {
	case p.high <- priorityTask{fn: fn}:
	default:
		fn()
	}
}

// SubmitLow enqueues a low-priority task (e.g., background project refresh).
// Drops the task if the low queue is full — callers should treat low-priority
// work as best-effort.
func (p *PriorityPool) SubmitLow(fn func()) {
	if fn == nil {
		return
	}
	select {
	case p.low <- priorityTask{fn: fn}:
	default:
	}
}

// Submit defaults to high priority for backward compatibility with callers
// that haven't been updated to choose a lane.
func (p *PriorityPool) Submit(fn func()) { p.SubmitHigh(fn) }

// Stop closes both lanes and unblocks workers. Safe to call once.
func (p *PriorityPool) Stop() {
	p.once.Do(func() {
		p.cancel()
		close(p.high)
		close(p.low)
	})
}

func (p *PriorityPool) worker() {
	for {
		// Prefer high. Standard priority-select idiom: probe high first; if
		// none is ready, fall through to a multi-case select that includes
		// both lanes plus cancellation.
		select {
		case <-p.ctx.Done():
			return
		case t, ok := <-p.high:
			if !ok {
				return
			}
			t.fn()
			continue
		default:
		}

		select {
		case <-p.ctx.Done():
			return
		case t, ok := <-p.high:
			if !ok {
				return
			}
			t.fn()
		case t, ok := <-p.low:
			if !ok {
				return
			}
			t.fn()
		}
	}
}
