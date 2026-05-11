// Author: Subash Karki
package detect

import (
	"context"
	"sync"
)

// defaultParallelThreshold is the minimum number of detectors required before
// the coordinator switches from sequential to parallel execution.
const defaultParallelThreshold = 3

// Coordinator manages detector execution and hint merging.
// Use NewCoordinator to create one; the zero value is not valid.
type Coordinator struct {
	detectors         []Detector
	parallelThreshold int
}

// NewCoordinator creates a Coordinator with the supplied detectors.
// Execution is sequential when len(detectors) <= defaultParallelThreshold and
// parallel otherwise.
func NewCoordinator(detectors ...Detector) *Coordinator {
	return &Coordinator{
		detectors:         detectors,
		parallelThreshold: defaultParallelThreshold,
	}
}

// WithParallelThreshold returns a copy of c with a custom parallel threshold.
// This is useful in tests and for callers that want to force one mode.
func (c *Coordinator) WithParallelThreshold(n int) *Coordinator {
	return &Coordinator{
		detectors:         c.detectors,
		parallelThreshold: n,
	}
}

// Analyze runs all registered detectors and merges their hints.
// When len(detectors) > parallelThreshold all detectors run concurrently under
// the supplied context; otherwise they run sequentially.
//
// Merge rule: for each unique Hint.Key the hint with the highest Confidence
// wins. Ties are broken in favour of whichever detector ran first (stable).
//
// A detector error is non-fatal: its hints are discarded, but other detectors
// continue. The first non-nil error is returned alongside whatever hints were
// successfully collected so callers can decide whether to act on the partial
// result.
func (c *Coordinator) Analyze(ctx context.Context, input *DetectorInput) ([]Hint, error) {
	if len(c.detectors) == 0 {
		return nil, nil
	}

	var (
		allHints []Hint
		firstErr error
	)

	if len(c.detectors) > c.parallelThreshold {
		allHints, firstErr = c.runParallel(ctx, input)
	} else {
		allHints, firstErr = c.runSequential(ctx, input)
	}

	return mergeHints(allHints), firstErr
}

// runSequential calls detectors one after the other, stopping early on context
// cancellation. Errors are captured but do not abort the loop.
func (c *Coordinator) runSequential(ctx context.Context, input *DetectorInput) ([]Hint, error) {
	var (
		hints    []Hint
		firstErr error
	)
	for _, d := range c.detectors {
		select {
		case <-ctx.Done():
			if firstErr == nil {
				firstErr = ctx.Err()
			}
			return hints, firstErr
		default:
		}

		got, err := d.Detect(ctx, input)
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		hints = append(hints, got...)
	}
	return hints, firstErr
}

// runParallel launches all detectors concurrently and collects results.
// Context cancellation is propagated to every detector.
func (c *Coordinator) runParallel(ctx context.Context, input *DetectorInput) ([]Hint, error) {
	type result struct {
		hints []Hint
		err   error
	}

	results := make([]result, len(c.detectors))
	var wg sync.WaitGroup
	wg.Add(len(c.detectors))

	for i, d := range c.detectors {
		i, d := i, d // capture loop vars
		go func() {
			defer wg.Done()
			got, err := d.Detect(ctx, input)
			results[i] = result{hints: got, err: err}
		}()
	}

	wg.Wait()

	var (
		hints    []Hint
		firstErr error
	)
	for _, r := range results {
		if r.err != nil {
			if firstErr == nil {
				firstErr = r.err
			}
			continue
		}
		hints = append(hints, r.hints...)
	}

	return hints, firstErr
}

// mergeHints deduplicates hints by Key, keeping the one with the highest
// Confidence. The input order is preserved for equal-confidence ties.
func mergeHints(hints []Hint) []Hint {
	if len(hints) == 0 {
		return nil
	}

	best := make(map[string]Hint, len(hints))
	for _, h := range hints {
		if existing, ok := best[h.Key]; !ok || h.Confidence > existing.Confidence {
			best[h.Key] = h
		}
	}

	// Return in stable order (insertion order of first occurrence per key).
	seen := make(map[string]bool, len(best))
	out := make([]Hint, 0, len(best))
	for _, h := range hints {
		if !seen[h.Key] {
			if winner, ok := best[h.Key]; ok {
				out = append(out, winner)
				seen[h.Key] = true
			}
		}
	}
	return out
}
