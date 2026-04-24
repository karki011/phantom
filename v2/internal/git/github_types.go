// Package git provides GitHub integration types for PR and CI status.
//
// Author: Subash Karki
package git

// PrStatus holds metadata for a GitHub pull request.
type PrStatus struct {
	Number       int    `json:"number"`
	Title        string `json:"title"`
	State        string `json:"state"`        // OPEN, MERGED, CLOSED
	IsDraft      bool   `json:"is_draft"`
	URL          string `json:"url"`
	HeadRefName  string `json:"head_ref_name"`
	BaseRefName  string `json:"base_ref_name"`
	Author       string `json:"author"`
	CreatedAt    string `json:"created_at"`
	ChecksPassed int    `json:"checks_passed"`
	ChecksFailed int    `json:"checks_failed"`
	ChecksPending int   `json:"checks_pending"`
	ChecksTotal  int    `json:"checks_total"`
}

// CiRun holds metadata for a single CI check run on a pull request.
type CiRun struct {
	Name        string `json:"name"`
	Status      string `json:"status"`      // in_progress, completed, queued
	Conclusion  string `json:"conclusion"`  // success, failure, cancelled, ""
	URL         string `json:"url"`
	Bucket      string `json:"bucket"`      // pass, fail, pending, skipping
	Workflow    string `json:"workflow"`    // parent workflow name
	Description string `json:"description"` // short failure reason from check
}

// CheckAnnotation holds a single annotation from a GitHub check run.
type CheckAnnotation struct {
	Path            string `json:"path"`
	StartLine       int    `json:"start_line"`
	EndLine         int    `json:"end_line"`
	AnnotationLevel string `json:"annotation_level"` // warning, failure, notice
	Title           string `json:"title"`
	Message         string `json:"message"`
}

// FailedStep holds the name, number, and error lines of a failed step within a CI job.
type FailedStep struct {
	Name   string   `json:"name"`
	Number int      `json:"number"`
	Errors []string `json:"errors"`
}
