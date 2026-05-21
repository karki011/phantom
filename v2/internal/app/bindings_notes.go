// Wails bindings for project sticky notes.
// Author: Subash Karki
package app

import (
	"fmt"
	"time"

	"github.com/charmbracelet/log"
	"github.com/google/uuid"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/subashkarki/phantom-os-v2/internal/db"
)

// ── Event constants ─────────────────────────────────────────────────────────

const (
	EventNoteCreated = "note:created"
	EventNoteUpdated = "note:updated"
	EventNoteDeleted = "note:deleted"
)

// ── Wire type ───────────────────────────────────────────────────────────────

// ProjectNoteWire is the frontend-facing note type.
// It converts Pinned from int64 (SQLite) to bool (JSON).
type ProjectNoteWire struct {
	ID        string `json:"id"`
	ProjectID string `json:"project_id"`
	Type      string `json:"type"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	Pinned    bool   `json:"pinned"`
	Position  int    `json:"position"`
	CreatedAt int64  `json:"created_at"`
	UpdatedAt int64  `json:"updated_at"`
}

func noteToWire(n db.ProjectNote) ProjectNoteWire {
	return ProjectNoteWire{
		ID:        n.ID,
		ProjectID: n.ProjectID,
		Type:      n.Type,
		Title:     n.Title,
		Body:      n.Body,
		Pinned:    n.Pinned != 0,
		Position:  int(n.Position),
		CreatedAt: n.CreatedAt,
		UpdatedAt: n.UpdatedAt,
	}
}

// ── Bindings ────────────────────────────────────────────────────────────────

// ListProjectNotes returns all notes for a project, sorted pinned-first then by position.
func (a *App) ListProjectNotes(projectID string) ([]ProjectNoteWire, error) {
	q := db.New(a.DB.Reader)
	notes, err := q.ListProjectNotes(a.ctx, projectID)
	if err != nil {
		log.Error("ListProjectNotes failed", "project_id", projectID, "err", err)
		return nil, fmt.Errorf("ListProjectNotes: %w", err)
	}

	out := make([]ProjectNoteWire, len(notes))
	for i, n := range notes {
		out[i] = noteToWire(n)
	}
	return out, nil
}

// CreateProjectNote creates a new sticky note for a project.
// It generates a UUID, sets position = count+1, and timestamps to now.
// Emits "note:created" with { projectId, note }.
func (a *App) CreateProjectNote(projectID, noteType, title string) (*ProjectNoteWire, error) {
	if noteType == "" {
		noteType = "note"
	}

	rq := db.New(a.DB.Reader)
	count, err := rq.CountProjectNotes(a.ctx, projectID)
	if err != nil {
		log.Error("CreateProjectNote: count failed", "project_id", projectID, "err", err)
		return nil, fmt.Errorf("CreateProjectNote: count: %w", err)
	}

	id := uuid.New().String()
	now := time.Now().Unix()

	params := db.CreateProjectNoteParams{
		ID:        id,
		ProjectID: projectID,
		Type:      noteType,
		Title:     title,
		Body:      "",
		Pinned:    0,
		Position:  count + 1,
		CreatedAt: now,
		UpdatedAt: now,
	}

	wq := db.New(a.DB.Writer)
	if err := wq.CreateProjectNote(a.ctx, params); err != nil {
		log.Error("CreateProjectNote: insert failed", "id", id, "err", err)
		return nil, fmt.Errorf("CreateProjectNote: insert: %w", err)
	}

	wire := ProjectNoteWire{
		ID:        id,
		ProjectID: projectID,
		Type:      noteType,
		Title:     title,
		Body:      "",
		Pinned:    false,
		Position:  int(count + 1),
		CreatedAt: now,
		UpdatedAt: now,
	}

	wailsRuntime.EventsEmit(a.ctx, EventNoteCreated, map[string]interface{}{
		"projectId": projectID,
		"note":      wire,
	})

	return &wire, nil
}

// UpdateProjectNote updates a note's title, body, type, and pinned state.
// Emits "note:updated" with { projectId, noteId }.
func (a *App) UpdateProjectNote(id, title, body, noteType string, pinned bool) error {
	now := time.Now().Unix()

	var pinnedInt int64
	if pinned {
		pinnedInt = 1
	}

	// Read current note to get projectId and current position.
	rq := db.New(a.DB.Reader)
	existing, err := rq.GetProjectNote(a.ctx, id)
	if err != nil {
		log.Error("UpdateProjectNote: get failed", "id", id, "err", err)
		return fmt.Errorf("UpdateProjectNote: get: %w", err)
	}

	params := db.UpdateProjectNoteParams{
		Title:     title,
		Body:      body,
		Type:      noteType,
		Pinned:    pinnedInt,
		Position:  existing.Position,
		UpdatedAt: now,
		ID:        id,
	}

	wq := db.New(a.DB.Writer)
	if err := wq.UpdateProjectNote(a.ctx, params); err != nil {
		log.Error("UpdateProjectNote: update failed", "id", id, "err", err)
		return fmt.Errorf("UpdateProjectNote: update: %w", err)
	}

	wailsRuntime.EventsEmit(a.ctx, EventNoteUpdated, map[string]interface{}{
		"projectId": existing.ProjectID,
		"noteId":    id,
	})

	return nil
}

// DeleteProjectNote removes a note by ID.
// Emits "note:deleted" with { projectId, noteId }.
func (a *App) DeleteProjectNote(id string) error {
	// Get the note first to retrieve projectId for the event.
	rq := db.New(a.DB.Reader)
	existing, err := rq.GetProjectNote(a.ctx, id)
	if err != nil {
		log.Error("DeleteProjectNote: get failed", "id", id, "err", err)
		return fmt.Errorf("DeleteProjectNote: get: %w", err)
	}

	wq := db.New(a.DB.Writer)
	if err := wq.DeleteProjectNote(a.ctx, id); err != nil {
		log.Error("DeleteProjectNote: delete failed", "id", id, "err", err)
		return fmt.Errorf("DeleteProjectNote: delete: %w", err)
	}

	wailsRuntime.EventsEmit(a.ctx, EventNoteDeleted, map[string]interface{}{
		"projectId": existing.ProjectID,
		"noteId":    id,
	})

	return nil
}
