// Package filegraph builds and maintains an in-memory dependency graph of
// source files. It extracts imports/symbols using Go AST for .go files and
// regex-based parsing for TypeScript/JavaScript. All indexing runs in
// background goroutines so it never blocks the UI.
//
// Author: Subash Karki
package filegraph

import (
	"sync"
	"time"
)

// Symbol represents a top-level declaration in a source file.
type Symbol struct {
	Name string `json:"name"`
	Kind string `json:"kind"` // "func", "type", "var", "const", "interface", "class", "component"
	Line int    `json:"line"`
}

// FileNode holds parsed metadata for a single source file.
type FileNode struct {
	Path       string    `json:"path"`
	Language   string    `json:"language"` // "go", "typescript", "javascript"
	Symbols    []Symbol  `json:"symbols"`
	Imports    []string  `json:"imports"`     // paths this file imports
	ImportedBy []string  `json:"imported_by"` // paths that import this file
	LastParsed time.Time `json:"last_parsed"`
	SizeBytes  int64     `json:"size_bytes"`
}

// Graph is a thread-safe in-memory file dependency graph.
type Graph struct {
	mu    sync.RWMutex
	nodes map[string]*FileNode // path → node
}

// New creates an empty file graph.
func New() *Graph {
	return &Graph{
		nodes: make(map[string]*FileNode),
	}
}

// Upsert adds or updates a file node and rebuilds reverse edges.
func (g *Graph) Upsert(node *FileNode) {
	g.mu.Lock()
	defer g.mu.Unlock()

	// Remove old reverse edges if this node already existed.
	if old, ok := g.nodes[node.Path]; ok {
		for _, imp := range old.Imports {
			if target, ok := g.nodes[imp]; ok {
				target.ImportedBy = removeStr(target.ImportedBy, node.Path)
			}
		}
	}

	g.nodes[node.Path] = node

	// Build forward → reverse edges.
	for _, imp := range node.Imports {
		if target, ok := g.nodes[imp]; ok {
			if !containsStr(target.ImportedBy, node.Path) {
				target.ImportedBy = append(target.ImportedBy, node.Path)
			}
		}
	}
}

// Remove deletes a file node and cleans up edges.
func (g *Graph) Remove(path string) {
	g.mu.Lock()
	defer g.mu.Unlock()

	old, ok := g.nodes[path]
	if !ok {
		return
	}

	// Clean reverse edges from targets.
	for _, imp := range old.Imports {
		if target, ok := g.nodes[imp]; ok {
			target.ImportedBy = removeStr(target.ImportedBy, path)
		}
	}

	// Clean forward edges from importers.
	for _, importer := range old.ImportedBy {
		if src, ok := g.nodes[importer]; ok {
			src.Imports = removeStr(src.Imports, path)
		}
	}

	delete(g.nodes, path)
}

// Get returns a file node by path, or nil if not indexed.
func (g *Graph) Get(path string) *FileNode {
	g.mu.RLock()
	defer g.mu.RUnlock()
	n := g.nodes[path]
	if n == nil {
		return nil
	}
	cp := *n
	return &cp
}

// Neighbors returns file nodes within `depth` hops of the given path.
// Depth 1 returns direct imports and importers.
func (g *Graph) Neighbors(path string, depth int) []*FileNode {
	g.mu.RLock()
	defer g.mu.RUnlock()

	visited := make(map[string]struct{})
	visited[path] = struct{}{}
	frontier := []string{path}

	for d := 0; d < depth && len(frontier) > 0; d++ {
		var next []string
		for _, p := range frontier {
			node, ok := g.nodes[p]
			if !ok {
				continue
			}
			for _, neighbor := range node.Imports {
				if _, seen := visited[neighbor]; !seen {
					visited[neighbor] = struct{}{}
					next = append(next, neighbor)
				}
			}
			for _, neighbor := range node.ImportedBy {
				if _, seen := visited[neighbor]; !seen {
					visited[neighbor] = struct{}{}
					next = append(next, neighbor)
				}
			}
		}
		frontier = next
	}

	// Collect all visited nodes except the origin.
	var result []*FileNode
	for p := range visited {
		if p == path {
			continue
		}
		if node, ok := g.nodes[p]; ok {
			cp := *node
			result = append(result, &cp)
		}
	}
	return result
}

// SymbolLookup finds all files that declare a symbol with the given name.
func (g *Graph) SymbolLookup(name string) []*FileNode {
	g.mu.RLock()
	defer g.mu.RUnlock()

	var result []*FileNode
	for _, node := range g.nodes {
		for _, sym := range node.Symbols {
			if sym.Name == name {
				cp := *node
				result = append(result, &cp)
				break
			}
		}
	}
	return result
}

// Stats returns basic metrics about the graph.
func (g *Graph) Stats() (fileCount int, symbolCount int, edgeCount int) {
	g.mu.RLock()
	defer g.mu.RUnlock()

	for _, node := range g.nodes {
		fileCount++
		symbolCount += len(node.Symbols)
		edgeCount += len(node.Imports)
	}
	return
}

// AllPaths returns all indexed file paths.
func (g *Graph) AllPaths() []string {
	g.mu.RLock()
	defer g.mu.RUnlock()

	paths := make([]string, 0, len(g.nodes))
	for p := range g.nodes {
		paths = append(paths, p)
	}
	return paths
}

func removeStr(slice []string, val string) []string {
	result := slice[:0]
	for _, s := range slice {
		if s != val {
			result = append(result, s)
		}
	}
	return result
}

func containsStr(slice []string, val string) bool {
	for _, s := range slice {
		if s == val {
			return true
		}
	}
	return false
}
