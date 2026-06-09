// Author: Subash Karki
package git

import (
	"context"
	"sync"
)

// maxLowLaneInflight caps how many low-priority (background) tasks may run
// concurrently across the whole pool. It must be strictly less than the worker
// count so background work can never occupy every worker — interactive
// high-lane tasks always keep dedicated headroom. With 8 workers and a cap of
// 4, at least 4 workers are always reachable by the high lane.
const maxLowLaneInflight = 4

// PriorityPool runs git tasks across a fixed worker pool with a high/low lane.
// Workers prefer high-priority work; low-priority work runs only when the high
// lane is empty AND a low-lane slot is free. The low-lane in-flight cap keeps
// background refreshes from starving interactive (high-lane) work even though
// both lanes share the same workers. Every task's git subprocess is bounded by
// the package-global gitProcSem so PriorityPool contributes to the same peak
// surge cap as Pool.RunAll. Follows the standard Go priority-select pattern.
type PriorityPool struct {
	workers int
	high    chan priorityTask
	low     chan priorityTask
	lowSem  chan struct{}
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
	lowCap := maxLowLaneInflight
	if lowCap >= workers {
		// Always leave at least one worker reachable only by the high lane.
		lowCap = workers - 1
		if lowCap < 1 {
			lowCap = 1
		}
	}
	p := &PriorityPool{
		workers: workers,
		high:    make(chan priorityTask, 256),
		low:     make(chan priorityTask, 256),
		lowSem:  make(chan struct{}, lowCap),
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
			p.run(t)
			continue
		default:
		}

		// No high work ready. Only commit to the low lane if a low-lane slot
		// is free, so background work can never occupy every worker. We try to
		// reserve the slot non-blockingly and pair it with a low task in the
		// same select; if no slot is free we keep waiting on high (and low
		// stays parked until a slot frees), never blocking high-lane progress.
		if !p.acquireLowSlot() {
			// All low slots busy. Wait for high work (or a low slot opening)
			// without consuming a low task we cannot run yet.
			select {
			case <-p.ctx.Done():
				return
			case t, ok := <-p.high:
				if !ok {
					return
				}
				p.run(t)
			case p.lowSem <- struct{}{}:
				// A low slot freed — loop to pick up high or low next round.
				<-p.lowSem
			}
			continue
		}

		// Low slot held. Take a low task, but yield to high if one arrives.
		select {
		case <-p.ctx.Done():
			<-p.lowSem
			return
		case t, ok := <-p.high:
			<-p.lowSem // not running a low task; return the slot
			if !ok {
				return
			}
			p.run(t)
		case t, ok := <-p.low:
			if !ok {
				<-p.lowSem
				return
			}
			p.runLow(t)
		}
	}
}

// acquireLowSlot tries to reserve a low-lane in-flight slot without blocking.
func (p *PriorityPool) acquireLowSlot() bool {
	select {
	case p.lowSem <- struct{}{}:
		return true
	default:
		return false
	}
}

// run executes a task, bounding its git subprocess via the package-global
// gitProcSem so PriorityPool shares the same peak-surge cap as Pool.RunAll.
// gitProcSem is released even if the task panics.
func (p *PriorityPool) run(t priorityTask) {
	if !acquireGitProc(p.ctx) {
		return
	}
	defer releaseGitProc()
	t.fn()
}

// runLow is run for a low-lane task; it releases the held low-lane slot on
// return (including panic) in addition to the git-subprocess slot.
func (p *PriorityPool) runLow(t priorityTask) {
	defer func() { <-p.lowSem }()
	p.run(t)
}
