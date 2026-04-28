// indexer.go provides background file indexing for the dependency graph.
// It walks the project directory on startup and watches for file changes
// via fsnotify. All work runs in goroutines to avoid blocking the UI.
//
// Author: Subash Karki
package filegraph

import (
	"context"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"time"

	"github.com/fsnotify/fsnotify"
)

// Indexer manages background file indexing for a project.
type Indexer struct {
	graph            *Graph
	rootDir          string
	watcher          *fsnotify.Watcher
	indexing         atomic.Bool
	cancel           context.CancelFunc
	done             chan struct{}
	totalSourceFiles atomic.Int64
}

// NewIndexer creates an indexer for the given project root directory.
func NewIndexer(rootDir string) *Indexer {
	return &Indexer{
		graph:   New(),
		rootDir: rootDir,
		done:    make(chan struct{}),
	}
}

// Graph returns the underlying file graph.
func (ix *Indexer) Graph() *Graph {
	return ix.graph
}

// TotalSourceFiles returns the number of parseable source files found in the project.
func (ix *Indexer) TotalSourceFiles() int {
	return int(ix.totalSourceFiles.Load())
}

// RootDir returns the project root directory this indexer covers.
func (ix *Indexer) RootDir() string {
	return ix.rootDir
}

// IsIndexing returns true while the initial full index is in progress.
func (ix *Indexer) IsIndexing() bool {
	return ix.indexing.Load()
}

// Start begins background indexing: a full walk followed by incremental
// file watching. It returns immediately; all work runs in goroutines.
func (ix *Indexer) Start(ctx context.Context) error {
	ctx, cancel := context.WithCancel(ctx)
	ix.cancel = cancel

	// Start file watcher.
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		cancel()
		return err
	}
	ix.watcher = watcher

	// Full index in background.
	go ix.fullIndex(ctx)

	// Watch for changes.
	go ix.watchLoop(ctx)

	return nil
}

// Stop halts all background work and closes the file watcher.
func (ix *Indexer) Stop() {
	if ix.cancel != nil {
		ix.cancel()
	}
	if ix.watcher != nil {
		ix.watcher.Close()
	}
	select {
	case <-ix.done:
	case <-time.After(5 * time.Second):
		slog.Warn("filegraph: stop timed out waiting for indexer")
	}
}

// fullIndex walks the project directory and parses all supported files.
func (ix *Indexer) fullIndex(ctx context.Context) {
	defer close(ix.done)
	ix.indexing.Store(true)
	defer ix.indexing.Store(false)

	start := time.Now()
	var fileCount int

	err := filepath.Walk(ix.rootDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // skip unreadable paths
		}

		if ctx.Err() != nil {
			return ctx.Err()
		}

		// Skip hidden directories and common non-source directories.
		if info.IsDir() {
			base := filepath.Base(path)
			if shouldSkipDir(base) {
				return filepath.SkipDir
			}
			// Add directory to watcher for incremental updates.
			if ix.watcher != nil {
				ix.watcher.Add(path)
			}
			return nil
		}

		// Only parse supported file types.
		ext := filepath.Ext(path)
		if LanguageForExt(ext) == "" {
			return nil
		}

		// Count all parseable source files (even if skipped for size).
		ix.totalSourceFiles.Add(1)

		// Skip large files (>200KB).
		if info.Size() > 200*1024 {
			return nil
		}

		node := ParseFile(path)
		if node != nil {
			// Resolve relative import paths to absolute for TS/JS.
			if node.Language != "go" {
				node.Imports = resolveImports(path, ix.rootDir, node.Imports)
			}
			ix.graph.Upsert(node)
			fileCount++
		}

		return nil
	})

	if err != nil && ctx.Err() == nil {
		slog.Warn("filegraph: full index walk error", "err", err)
	}

	files, symbols, edges := ix.graph.Stats()
	slog.Info("filegraph: initial index complete",
		"files", files,
		"symbols", symbols,
		"edges", edges,
		"scanned", fileCount,
		"duration", time.Since(start).Round(time.Millisecond),
	)
}

// watchLoop handles fsnotify events for incremental updates.
func (ix *Indexer) watchLoop(ctx context.Context) {
	// Debounce: batch changes within 200ms.
	pending := make(map[string]struct{})
	timer := time.NewTimer(time.Hour) // idle initially
	timer.Stop()

	for {
		select {
		case <-ctx.Done():
			timer.Stop()
			return

		case event, ok := <-ix.watcher.Events:
			if !ok {
				return
			}

			ext := filepath.Ext(event.Name)
			if LanguageForExt(ext) == "" {
				continue
			}

			if event.Op&(fsnotify.Write|fsnotify.Create|fsnotify.Remove|fsnotify.Rename) != 0 {
				pending[event.Name] = struct{}{}
				timer.Reset(200 * time.Millisecond)
			}

		case <-timer.C:
			for path := range pending {
				ix.processChange(path)
			}
			pending = make(map[string]struct{})

		case err, ok := <-ix.watcher.Errors:
			if !ok {
				return
			}
			slog.Warn("filegraph: watcher error", "err", err)
		}
	}
}

// processChange re-parses a changed file or removes it if deleted.
func (ix *Indexer) processChange(path string) {
	info, err := os.Stat(path)
	if os.IsNotExist(err) {
		ix.graph.Remove(path)
		slog.Debug("filegraph: removed", "path", path)
		return
	}
	if err != nil || info.IsDir() {
		return
	}
	if info.Size() > 200*1024 {
		return
	}

	node := ParseFile(path)
	if node != nil {
		if node.Language != "go" {
			node.Imports = resolveImports(path, ix.rootDir, node.Imports)
		}
		ix.graph.Upsert(node)
		slog.Debug("filegraph: updated", "path", path, "symbols", len(node.Symbols))
	}
}

// resolveImports converts relative TS/JS import paths to absolute paths.
func resolveImports(filePath, rootDir string, imports []string) []string {
	dir := filepath.Dir(filePath)
	var resolved []string

	for _, imp := range imports {
		// Skip node_modules / bare specifiers.
		if !strings.HasPrefix(imp, ".") && !strings.HasPrefix(imp, "@/") {
			continue
		}

		var abs string
		if strings.HasPrefix(imp, "@/") {
			// Alias: @/ maps to rootDir/src/ (common SolidJS/Vite convention).
			abs = filepath.Join(rootDir, "src", strings.TrimPrefix(imp, "@/"))
		} else {
			abs = filepath.Join(dir, imp)
		}

		// Try common extensions.
		for _, ext := range []string{"", ".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx"} {
			candidate := abs + ext
			if _, err := os.Stat(candidate); err == nil {
				resolved = append(resolved, candidate)
				break
			}
		}
	}

	return resolved
}

// shouldSkipDir returns true for directories that should not be indexed.
func shouldSkipDir(name string) bool {
	switch name {
	case "node_modules", "vendor", ".git", ".next", ".nuxt", "dist", "build",
		"__pycache__", ".venv", "venv", ".idea", ".vscode", "coverage",
		".phantom-os", ".claude", ".planning", "target":
		return true
	}
	return strings.HasPrefix(name, ".")
}
