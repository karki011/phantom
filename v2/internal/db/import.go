// Package db — v1 database import logic.
// Author: Subash Karki
package db

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"
)

// v1Tables lists tables to import in dependency order (parents before children).
var v1Tables = []string{
	"sessions",
	"tasks",
	"hunter_profile",
	"hunter_stats",
	"achievements",
	"daily_quests",
	"activity_log",
	"projects",
	"workspace_sections",
	"workspaces",
	"chat_conversations",
	"chat_messages",
	"pane_states",
	"terminal_sessions",
	"user_preferences",
	"graph_nodes",
	"graph_edges",
	"graph_meta",
}

// ImportV1 checks for a v1 database and imports its data into the v2 database.
// It is safe to call multiple times — it no-ops if already imported.
func (d *DB) ImportV1() error {
	// Check if already imported
	var imported string
	err := d.Writer.QueryRow("SELECT value FROM user_preferences WHERE key = 'v1_imported'").Scan(&imported)
	if err == nil && imported == "true" {
		log.Println("db: v1 import already completed, skipping")
		return nil
	}

	// Find v1 database
	v1Path, err := findV1DB()
	if err != nil {
		log.Printf("db: no v1 database found: %v", err)
		return nil // Not an error — v1 DB is optional
	}

	log.Printf("db: found v1 database at %s, starting import", v1Path)

	// Attach v1 database
	if _, err := d.Writer.Exec(fmt.Sprintf("ATTACH DATABASE '%s' AS v1", v1Path)); err != nil {
		return fmt.Errorf("attach v1 database: %w", err)
	}
	defer d.Writer.Exec("DETACH DATABASE v1")

	tx, err := d.Writer.Begin()
	if err != nil {
		return fmt.Errorf("begin import tx: %w", err)
	}

	var totalRows int64
	for _, table := range v1Tables {
		// Check if table exists in v1
		var count int
		row := tx.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM v1.sqlite_master WHERE type='table' AND name='%s'", table))
		if err := row.Scan(&count); err != nil || count == 0 {
			log.Printf("db: v1 table %s not found, skipping", table)
			continue
		}

		// Import data — column names match between v1 and v2
		query := fmt.Sprintf("INSERT OR IGNORE INTO main.%s SELECT * FROM v1.%s", table, table)
		result, err := tx.Exec(query)
		if err != nil {
			tx.Rollback()
			return fmt.Errorf("import table %s: %w", table, err)
		}

		rows, _ := result.RowsAffected()
		totalRows += rows
		if rows > 0 {
			log.Printf("db: imported %d rows from v1.%s", rows, table)
		}
	}

	// Mark import as complete
	now := time.Now().Unix()
	_, err = tx.Exec(
		"INSERT OR REPLACE INTO user_preferences (key, value, updated_at) VALUES ('v1_imported', 'true', ?)",
		now,
	)
	if err != nil {
		tx.Rollback()
		return fmt.Errorf("set v1_imported preference: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit import tx: %w", err)
	}

	log.Printf("db: v1 import complete — %d total rows imported from %d tables", totalRows, len(v1Tables))
	return nil
}

// findV1DB looks for the v1 database at the standard location.
func findV1DB() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home dir: %w", err)
	}

	// v1 used the same path — check if a v1-era DB exists
	// The v2 DB will be at the same path, so we check for a backup or
	// for when v2 runs the first time with an existing v1 DB in place.
	v1Path := filepath.Join(home, ".phantom-os", "phantom.v1.db")
	if _, err := os.Stat(v1Path); err == nil {
		return v1Path, nil
	}

	return "", fmt.Errorf("v1 database not found at %s", v1Path)
}
