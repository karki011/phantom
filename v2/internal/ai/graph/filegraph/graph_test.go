// Author: Subash Karki
package filegraph

import (
	"testing"
	"time"
)

func TestGraphUpsertAndGet(t *testing.T) {
	g := New()

	node := &FileNode{
		Path:       "/app/main.go",
		Language:   "go",
		Symbols:    []Symbol{{Name: "main", Kind: "func", Line: 10}},
		Imports:    []string{"fmt", "os"},
		LastParsed: time.Now(),
	}
	g.Upsert(node)

	got := g.Get("/app/main.go")
	if got == nil {
		t.Fatal("expected node, got nil")
	}
	if got.Language != "go" {
		t.Errorf("expected go, got %s", got.Language)
	}
	if len(got.Symbols) != 1 {
		t.Errorf("expected 1 symbol, got %d", len(got.Symbols))
	}
}

func TestGraphReverseEdges(t *testing.T) {
	g := New()

	// a.go imports b.go
	g.Upsert(&FileNode{Path: "/b.go", Language: "go", Imports: nil})
	g.Upsert(&FileNode{Path: "/a.go", Language: "go", Imports: []string{"/b.go"}})

	b := g.Get("/b.go")
	if b == nil {
		t.Fatal("b.go not found")
	}
	if len(b.ImportedBy) != 1 || b.ImportedBy[0] != "/a.go" {
		t.Errorf("expected b.go imported by a.go, got %v", b.ImportedBy)
	}
}

func TestGraphRemove(t *testing.T) {
	g := New()
	g.Upsert(&FileNode{Path: "/b.go", Language: "go"})
	g.Upsert(&FileNode{Path: "/a.go", Language: "go", Imports: []string{"/b.go"}})

	g.Remove("/a.go")

	if g.Get("/a.go") != nil {
		t.Error("a.go should be removed")
	}
	b := g.Get("/b.go")
	if len(b.ImportedBy) != 0 {
		t.Errorf("b.go should have no importers, got %v", b.ImportedBy)
	}
}

func TestGraphNeighbors(t *testing.T) {
	g := New()
	g.Upsert(&FileNode{Path: "/c.go", Language: "go"})
	g.Upsert(&FileNode{Path: "/b.go", Language: "go", Imports: []string{"/c.go"}})
	g.Upsert(&FileNode{Path: "/a.go", Language: "go", Imports: []string{"/b.go"}})

	// Depth 1 from b.go: a.go (importer) and c.go (import)
	neighbors := g.Neighbors("/b.go", 1)
	if len(neighbors) != 2 {
		t.Errorf("expected 2 neighbors, got %d", len(neighbors))
	}

	// Depth 1 from a.go: only b.go
	neighbors = g.Neighbors("/a.go", 1)
	if len(neighbors) != 1 {
		t.Errorf("expected 1 neighbor, got %d", len(neighbors))
	}

	// Depth 2 from a.go: b.go and c.go
	neighbors = g.Neighbors("/a.go", 2)
	if len(neighbors) != 2 {
		t.Errorf("expected 2 neighbors at depth 2, got %d", len(neighbors))
	}
}

func TestGraphSymbolLookup(t *testing.T) {
	g := New()
	g.Upsert(&FileNode{
		Path:     "/a.go",
		Language: "go",
		Symbols:  []Symbol{{Name: "HandleRequest", Kind: "func"}},
	})
	g.Upsert(&FileNode{
		Path:     "/b.go",
		Language: "go",
		Symbols:  []Symbol{{Name: "main", Kind: "func"}},
	})

	results := g.SymbolLookup("HandleRequest")
	if len(results) != 1 || results[0].Path != "/a.go" {
		t.Errorf("expected to find HandleRequest in a.go, got %v", results)
	}
}

func TestGraphStats(t *testing.T) {
	g := New()
	g.Upsert(&FileNode{
		Path:    "/a.go",
		Symbols: []Symbol{{Name: "foo", Kind: "func"}, {Name: "bar", Kind: "type"}},
		Imports: []string{"/b.go"},
	})
	g.Upsert(&FileNode{Path: "/b.go"})

	files, symbols, edges := g.Stats()
	if files != 2 {
		t.Errorf("expected 2 files, got %d", files)
	}
	if symbols != 2 {
		t.Errorf("expected 2 symbols, got %d", symbols)
	}
	if edges != 1 {
		t.Errorf("expected 1 edge, got %d", edges)
	}
}
