// Package git provides GitHub integration types for PR and CI status.
//
// Author: Subash Karki
package git

// Reviewer is a GitHub user surfaced in PR review state.
type Reviewer struct {
	Login     string `json:"login"`
	AvatarUrl string `json:"avatar_url"`
}

// PrStatus holds metadata for a GitHub pull request.
type PrStatus struct {
	Number        int    `json:"number"`
	Title         string `json:"title"`
	State         string `json:"state"` // OPEN, MERGED, CLOSED
	IsDraft       bool   `json:"is_draft"`
	URL           string `json:"url"`
	HeadRefName   string `json:"head_ref_name"`
	BaseRefName   string `json:"base_ref_name"`
	Author        string `json:"author"`
	CreatedAt     string `json:"created_at"`
	MergedAt      string `json:"merged_at"`
	ChecksPassed  int    `json:"checks_passed"`
	ChecksFailed  int    `json:"checks_failed"`
	ChecksPending int    `json:"checks_pending"`
	ChecksTotal   int    `json:"checks_total"`

	// Mergeability + review state (Ship-It).
	MergeStateStatus   string `json:"merge_state_status"`   // CLEAN, BLOCKED, BEHIND, DIRTY, DRAFT, HAS_HOOKS, UNSTABLE, UNKNOWN
	Mergeable          string `json:"mergeable"`            // MERGEABLE, CONFLICTING, UNKNOWN
	ReviewDecision     string `json:"review_decision"`      // APPROVED, REVIEW_REQUIRED, CHANGES_REQUESTED, ""
	IsAutoMerging      bool   `json:"is_auto_merging"`      // autoMergeRequest present
	AutoMergeMethod    string `json:"auto_merge_method"`    // SQUASH, MERGE, REBASE, ""
	MergeQueueState    string `json:"merge_queue_state"`    // QUEUED, MERGEABLE, AWAITING_CHECKS, MERGING, ""
	MergeQueuePosition int    `json:"merge_queue_position"` // 0 if not queued
	MergeQueueEta      int    `json:"merge_queue_eta"`      // minutes (0 if unknown)

	Approvers          []Reviewer `json:"approvers"`
	ChangesRequestedBy []Reviewer `json:"changes_requested_by"`
	AwaitingReviewFrom []Reviewer `json:"awaiting_review_from"`
}

// RepoMergeConfig holds repo-level merge settings used to drive the Ship-It UI.
type RepoMergeConfig struct {
	MergeCommitAllowed       bool   `json:"merge_commit_allowed"`
	SquashMergeAllowed       bool   `json:"squash_merge_allowed"`
	RebaseMergeAllowed       bool   `json:"rebase_merge_allowed"`
	DeleteBranchOnMerge      bool   `json:"delete_branch_on_merge"`
	ViewerDefaultMergeMethod string `json:"viewer_default_merge_method"` // SQUASH, MERGE, REBASE
	HasMergeQueue            bool   `json:"has_merge_queue"`
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
