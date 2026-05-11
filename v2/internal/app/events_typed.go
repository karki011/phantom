// Author: Subash Karki
package app

import wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

// Typed event emitters — compile-time safety for event names and payloads.
// These are additive helpers; existing runtime.EventsEmit calls are unchanged.

// EmitGitStatus emits a git status change event (no payload — listeners re-fetch).
func (a *App) EmitGitStatus() {
	wailsRuntime.EventsEmit(a.ctx, EventGitStatus)
}

// EmitGitBranchChanged emits when the active branch changes for a worktree.
func (a *App) EmitGitBranchChanged() {
	wailsRuntime.EventsEmit(a.ctx, EventGitBranchChanged)
}

// WorktreeEventPayload is the payload for worktree lifecycle events.
type WorktreeEventPayload struct {
	WorktreeID string `json:"worktreeId,omitempty"`
}

// EmitWorktreeCreated emits after a new worktree is created.
func (a *App) EmitWorktreeCreated() {
	wailsRuntime.EventsEmit(a.ctx, EventWorktreeCreated)
}

// EmitWorktreeRemoved emits after a worktree is deleted.
func (a *App) EmitWorktreeRemoved() {
	wailsRuntime.EventsEmit(a.ctx, EventWorktreeRemoved)
}

// EmitWorktreeUpdated emits after worktree metadata changes (e.g. CI / PR polling).
func (a *App) EmitWorktreeUpdated() {
	wailsRuntime.EventsEmit(a.ctx, EventWorktreeUpdated)
}

// PRMergePayload is shared by EventPrMerging and EventPrMerged.
type PRMergePayload struct {
	WorktreeID string `json:"worktreeId"`
	PRNumber   int    `json:"prNumber"`
	AutoMerge  bool   `json:"autoMerge,omitempty"`
}

// MergeFailedPayload is the payload for EventMergeFailed.
type MergeFailedPayload struct {
	WorktreeID string `json:"worktreeId"`
	PRNumber   int    `json:"prNumber"`
	Message    string `json:"message"`
}

// EmitPrMerging emits when a PR merge is initiated.
func (a *App) EmitPrMerging(worktreeID string, prNumber int, autoMerge bool) {
	wailsRuntime.EventsEmit(a.ctx, EventPrMerging, PRMergePayload{
		WorktreeID: worktreeID,
		PRNumber:   prNumber,
		AutoMerge:  autoMerge,
	})
}

// EmitPrMerged emits after a PR is successfully merged.
func (a *App) EmitPrMerged(worktreeID string, prNumber int) {
	wailsRuntime.EventsEmit(a.ctx, EventPrMerged, PRMergePayload{
		WorktreeID: worktreeID,
		PRNumber:   prNumber,
	})
}

// EmitMergeFailed emits when a PR merge attempt fails.
func (a *App) EmitMergeFailed(worktreeID string, prNumber int, message string) {
	wailsRuntime.EventsEmit(a.ctx, EventMergeFailed, MergeFailedPayload{
		WorktreeID: worktreeID,
		PRNumber:   prNumber,
		Message:    message,
	})
}

// TerminalSessionLinkedPayload is the payload for EventTerminalSessionLinked.
type TerminalSessionLinkedPayload struct {
	PaneID      string `json:"paneId"`
	SessionID   string `json:"sessionId"`
	SessionName string `json:"sessionName,omitempty"`
}

// EmitTerminalSessionLinked emits when a terminal pane is linked to a composer session.
func (a *App) EmitTerminalSessionLinked(paneID, sessionID, sessionName string) {
	wailsRuntime.EventsEmit(a.ctx, EventTerminalSessionLinked, TerminalSessionLinkedPayload{
		PaneID:      paneID,
		SessionID:   sessionID,
		SessionName: sessionName,
	})
}

// TerminalSessionUnlinkedPayload is the payload for EventTerminalSessionUnlinked.
type TerminalSessionUnlinkedPayload struct {
	PaneID    string `json:"paneId"`
	SessionID string `json:"sessionId"`
}

// EmitTerminalSessionUnlinked emits when a terminal pane is unlinked from a session.
func (a *App) EmitTerminalSessionUnlinked(paneID, sessionID string) {
	wailsRuntime.EventsEmit(a.ctx, EventTerminalSessionUnlinked, TerminalSessionUnlinkedPayload{
		PaneID:    paneID,
		SessionID: sessionID,
	})
}

// TerminalActivityPayload is the payload for EventTerminalActivity.
type TerminalActivityPayload struct {
	PaneID    string `json:"pane_id"`
	SessionID string `json:"session_id"`
	Summary   string `json:"summary"`
}

// EmitTerminalActivity emits an enriched terminal activity event for a linked pane.
func (a *App) EmitTerminalActivity(paneID, sessionID, summary string) {
	wailsRuntime.EventsEmit(a.ctx, EventTerminalActivity, TerminalActivityPayload{
		PaneID:    paneID,
		SessionID: sessionID,
		Summary:   summary,
	})
}

// ProviderChangedPayload is the payload for EventProviderChanged.
type ProviderChangedPayload struct {
	Name        string `json:"name"`
	DisplayName string `json:"display_name"`
}

// EmitProviderChanged emits when the active AI provider changes.
func (a *App) EmitProviderChanged(name, displayName string) {
	wailsRuntime.EventsEmit(a.ctx, EventProviderChanged, ProviderChangedPayload{
		Name:        name,
		DisplayName: displayName,
	})
}

// EmitProviderReload emits to signal the frontend to reload provider configuration.
func (a *App) EmitProviderReload() {
	wailsRuntime.EventsEmit(a.ctx, EventProviderReload, nil)
}

// SessionForkedPayload is the payload for EventSessionForked.
type SessionForkedPayload struct {
	SessionID       string `json:"session_id"`
	ParentSessionID string `json:"parent_session_id"`
}

// EmitSessionForked emits after a session is forked.
func (a *App) EmitSessionForked(newSessionID, parentSessionID string) {
	wailsRuntime.EventsEmit(a.ctx, EventSessionForked, SessionForkedPayload{
		SessionID:       newSessionID,
		ParentSessionID: parentSessionID,
	})
}

// MCPRegistrationFailedPayload is the payload for EventMCPRegistrationFailed.
type MCPRegistrationFailedPayload struct {
	Phase string `json:"phase"`
	Error string `json:"error"`
	Hint  string `json:"hint,omitempty"`
}

// EmitMCPRegistrationFailed emits when MCP self-registration fails.
func (a *App) EmitMCPRegistrationFailed(phase, errMsg, hint string) {
	wailsRuntime.EventsEmit(a.ctx, EventMCPRegistrationFailed, MCPRegistrationFailedPayload{
		Phase: phase,
		Error: errMsg,
		Hint:  hint,
	})
}

// EmbeddingDownloadProgressPayload is the payload for EventEmbeddingDownloadProgress.
type EmbeddingDownloadProgressPayload struct {
	File    string `json:"file"`
	Percent int    `json:"percent"`
	TotalMB int    `json:"totalMB"`
}

// EmitEmbeddingDownloadProgress emits download progress for embedding model setup.
func (a *App) EmitEmbeddingDownloadProgress(file string, percent, totalMB int) {
	wailsRuntime.EventsEmit(a.ctx, EventEmbeddingDownloadProgress, EmbeddingDownloadProgressPayload{
		File:    file,
		Percent: percent,
		TotalMB: totalMB,
	})
}

// EmitEmbeddingSetupComplete emits after embedding model setup completes successfully.
func (a *App) EmitEmbeddingSetupComplete() {
	wailsRuntime.EventsEmit(a.ctx, EventEmbeddingSetupComplete, nil)
}

// EmbeddingSetupFailedPayload is the payload for EventEmbeddingSetupFailed.
type EmbeddingSetupFailedPayload struct {
	Error string `json:"error"`
}

// EmitEmbeddingSetupFailed emits when embedding model setup fails.
func (a *App) EmitEmbeddingSetupFailed(errMsg string) {
	wailsRuntime.EventsEmit(a.ctx, EventEmbeddingSetupFailed, EmbeddingSetupFailedPayload{
		Error: errMsg,
	})
}

// JournalEnrichedPayload is the payload for the journal:enriched event.
type JournalEnrichedPayload struct {
	Date    string `json:"date"`
	Project string `json:"project"`
}

// EmitJournalEnriched emits after a journal entry has been AI-enriched.
func (a *App) EmitJournalEnriched(date, project string) {
	wailsRuntime.EventsEmit(a.ctx, EventJournalEnriched, JournalEnrichedPayload{
		Date:    date,
		Project: project,
	})
}

// EmitProjectCreated emits after a new project is created.
func (a *App) EmitProjectCreated(projectID string) {
	wailsRuntime.EventsEmit(a.ctx, EventProjectCreated, projectID)
}
