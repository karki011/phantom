// Package detect provides a formal Detector/Coordinator pipeline for
// extensible context enrichment. Detectors are independent units that analyse
// a DetectorInput and produce typed Hints with confidence scores. The
// Coordinator runs all registered detectors, merges their hints (highest
// confidence per key wins), and returns the unified result.
//
// Pattern borrowed from CloudZero's AI collector pipeline.
//
// Author: Subash Karki
package detect

import "context"

// Hint is a single detection result with a confidence score.
type Hint struct {
	// Key identifies what aspect of context this hint describes.
	// E.g. "task_type", "complexity", "blast_radius", "work_type".
	Key string

	// Value is the detected value for this key.
	// E.g. "refactor", "high", "12 files", "feature".
	Value string

	// Confidence is how certain the detector is, in [0.0, 1.0].
	// When multiple detectors produce the same Key the one with the
	// highest Confidence wins.
	Confidence float64

	// Source is the Name() of the detector that produced this hint.
	Source string
}

// DetectorInput bundles everything a detector might need to analyse context.
// All fields are optional — detectors should degrade gracefully when fields
// are empty or zero-valued.
type DetectorInput struct {
	// Goal is the user's stated objective.
	Goal string

	// Files is the set of active/relevant files for the current task.
	Files []string

	// WorkDir is the repository root being worked on.
	WorkDir string

	// BranchName is the current git branch, if known.
	BranchName string

	// RecentDecisions contains short summaries of past decisions. Used by
	// PriorOutcomeDetector to look for patterns in historical data.
	RecentDecisions []string
}

// Detector analyses a DetectorInput and returns zero or more Hints.
// Implementations must be safe for concurrent use.
type Detector interface {
	// Name returns a stable identifier used as Hint.Source.
	Name() string

	// Detect runs the analysis. It should respect ctx cancellation/deadline
	// and return early when the context is done.
	Detect(ctx context.Context, input *DetectorInput) ([]Hint, error)
}
