-- Author: Subash Karki

CREATE TABLE project_notes_backup AS SELECT id, project_id, type, title, body, pinned, position, created_at, updated_at FROM project_notes;
DROP TABLE project_notes;
CREATE TABLE project_notes (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'note',
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    pinned INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
INSERT INTO project_notes SELECT * FROM project_notes_backup;
DROP TABLE project_notes_backup;
CREATE INDEX idx_project_notes_project ON project_notes(project_id);
