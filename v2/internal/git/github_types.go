// Package git provides GitHub integration types for PR and CI status.
//
// Author: Subash Karki
package git

// PrStatus holds metadata for a GitHub pull request.
type PrStatus struct {
	Number      int    `json:"number"`
	Title       string `json:"title"`
	State       string `json:"state"`        // OPEN, MERGED, CLOSED
	IsDraft     bool   `json:"is_draft"`
	URL         string `json:"url"`
	HeadRefName string `json:"head_ref_name"`
	BaseRefName string `json:"base_ref_name"`
}

// CiRun holds metadata for a single CI check run on a pull request.
type CiRun struct {
	Name       string `json:"name"`
	Status     string `json:"status"`     // in_progress, completed, queued
	Conclusion string `json:"conclusion"` // success, failure, cancelled, ""
	URL        string `json:"url"`
	Bucket     string `json:"bucket"` // pass, fail, pending, skipping
}
