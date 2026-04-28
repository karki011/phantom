// Package db provides SQLite persistence for PhantomOS v2.
// Author: Subash Karki
package db

import (
	"database/sql"
	"embed"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	_ "modernc.org/sqlite"
)

//go:embed migrations/*.up.sql
var migrationsFS embed.FS

// DB wraps a writer connection and a reader pool for WAL-mode SQLite.
type DB struct {
	// Writer is the single write connection (serialized writes).
	Writer *sql.DB
	// Reader is a pool of read-only connections (concurrent reads via WAL).
	Reader *sql.DB
	path   string
}

// DefaultDBPath returns the default database path (~/.phantom-os/phantom.db).
func DefaultDBPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home dir: %w", err)
	}
	return filepath.Join(home, ".phantom-os", "phantom.db"), nil
}

// Open opens (or creates) a SQLite database at dbPath, configures WAL mode,
// sets pragmas, runs pending migrations, and returns a ready-to-use DB.
func Open(dbPath string) (*DB, error) {
	// Ensure parent directory exists
	dir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("create db directory %s: %w", dir, err)
	}

	// Open writer connection (max 1 open conn for serialized writes)
	writer, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open writer connection: %w", err)
	}
	writer.SetMaxOpenConns(1)

	// Configure writer pragmas
	if err := setPragmas(writer); err != nil {
		writer.Close()
		return nil, fmt.Errorf("set writer pragmas: %w", err)
	}

	// Open reader pool (multiple concurrent readers via WAL)
	reader, err := sql.Open("sqlite", dbPath+"?mode=ro")
	if err != nil {
		writer.Close()
		return nil, fmt.Errorf("open reader connection: %w", err)
	}
	reader.SetMaxOpenConns(4)

	// Configure reader pragmas (no WAL needed — set by writer)
	if _, err := reader.Exec("PRAGMA busy_timeout=5000"); err != nil {
		writer.Close()
		reader.Close()
		return nil, fmt.Errorf("set reader busy_timeout: %w", err)
	}
	if _, err := reader.Exec("PRAGMA foreign_keys=ON"); err != nil {
		writer.Close()
		reader.Close()
		return nil, fmt.Errorf("set reader foreign_keys: %w", err)
	}

	d := &DB{
		Writer: writer,
		Reader: reader,
		path:   dbPath,
	}

	// Run migrations
	if err := d.migrate(); err != nil {
		d.Close()
		return nil, fmt.Errorf("run migrations: %w", err)
	}

	return d, nil
}

// Close closes both writer and reader connection pools.
func (d *DB) Close() error {
	var errs []string
	if err := d.Reader.Close(); err != nil {
		errs = append(errs, fmt.Sprintf("close reader: %v", err))
	}
	if err := d.Writer.Close(); err != nil {
		errs = append(errs, fmt.Sprintf("close writer: %v", err))
	}
	if len(errs) > 0 {
		return fmt.Errorf("close db: %s", strings.Join(errs, "; "))
	}
	return nil
}

// Path returns the file path of the database.
func (d *DB) Path() string {
	return d.path
}

// setPragmas configures WAL mode, busy timeout, and foreign keys on a connection.
func setPragmas(conn *sql.DB) error {
	pragmas := []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA busy_timeout=5000",
		"PRAGMA foreign_keys=ON",
	}
	for _, p := range pragmas {
		if _, err := conn.Exec(p); err != nil {
			return fmt.Errorf("exec %q: %w", p, err)
		}
	}
	return nil
}

// migrate reads embedded .up.sql files and applies any with version > current user_version.
func (d *DB) migrate() error {
	// Get current schema version
	var currentVersion int
	if err := d.Writer.QueryRow("PRAGMA user_version").Scan(&currentVersion); err != nil {
		return fmt.Errorf("read user_version: %w", err)
	}

	// Read all .up.sql migration files
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations dir: %w", err)
	}

	type migration struct {
		version int
		name    string
	}

	var migrations []migration
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".up.sql") {
			continue
		}
		// Parse version from filename: "001_initial_schema.up.sql" -> 1
		parts := strings.SplitN(e.Name(), "_", 2)
		if len(parts) < 2 {
			continue
		}
		ver, err := strconv.Atoi(parts[0])
		if err != nil {
			slog.Warn("db: skip migration: cannot parse version", "file", e.Name(), "err", err)
			continue
		}
		migrations = append(migrations, migration{version: ver, name: e.Name()})
	}

	// Sort by version ascending
	sort.Slice(migrations, func(i, j int) bool {
		return migrations[i].version < migrations[j].version
	})

	// Apply pending migrations
	for _, m := range migrations {
		if m.version <= currentVersion {
			continue
		}

		content, err := migrationsFS.ReadFile("migrations/" + m.name)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", m.name, err)
		}

		slog.Info("db: applying migration", "file", m.name, "version", m.version)

		tx, err := d.Writer.Begin()
		if err != nil {
			return fmt.Errorf("begin tx for migration %s: %w", m.name, err)
		}

		if _, err := tx.Exec(string(content)); err != nil {
			tx.Rollback()
			return fmt.Errorf("exec migration %s: %w", m.name, err)
		}

		// Update user_version — PRAGMA cannot be parameterized, use Sprintf
		if _, err := tx.Exec(fmt.Sprintf("PRAGMA user_version = %d", m.version)); err != nil {
			tx.Rollback()
			return fmt.Errorf("set user_version to %d: %w", m.version, err)
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit migration %s: %w", m.name, err)
		}

		slog.Info("db: migration applied successfully", "file", m.name)
	}

	return nil
}
