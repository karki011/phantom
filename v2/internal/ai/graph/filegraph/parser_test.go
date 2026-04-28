// Author: Subash Karki
package filegraph

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseGoFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "main.go")
	content := `package main

import (
	"fmt"
	"os"
)

const Version = "1.0"

type App struct {
	Name string
}

type Logger interface {
	Log(msg string)
}

func main() {
	fmt.Println("hello")
}

func (a *App) Run() {
	os.Exit(0)
}
`
	os.WriteFile(path, []byte(content), 0644)

	node := ParseFile(path)
	if node == nil {
		t.Fatal("expected node, got nil")
	}
	if node.Language != "go" {
		t.Errorf("expected go, got %s", node.Language)
	}
	if len(node.Imports) != 2 {
		t.Errorf("expected 2 imports, got %d: %v", len(node.Imports), node.Imports)
	}

	symbolNames := make(map[string]string)
	for _, s := range node.Symbols {
		symbolNames[s.Name] = s.Kind
	}

	if symbolNames["main"] != "func" {
		t.Error("expected main func")
	}
	if symbolNames["Run"] != "method" {
		t.Error("expected Run method")
	}
	if symbolNames["App"] != "type" {
		t.Error("expected App type")
	}
	if symbolNames["Logger"] != "interface" {
		t.Error("expected Logger interface")
	}
	if symbolNames["Version"] != "const" {
		t.Error("expected Version const")
	}
}

func TestParseTSFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "App.tsx")
	content := `import { createSignal } from 'solid-js';
import { Workspace } from '@/components/Workspace';
import './styles.css';

export interface AppProps {
  title: string;
}

export type Theme = 'dark' | 'light';

export const DEFAULT_THEME = 'dark';

export function App(props: AppProps) {
  const [count, setCount] = createSignal(0);
  return <div>{props.title}</div>;
}

function helperFunc() {
  return 42;
}

export class Router {
  navigate(path: string) {}
}
`
	os.WriteFile(path, []byte(content), 0644)

	node := ParseFile(path)
	if node == nil {
		t.Fatal("expected node, got nil")
	}
	if node.Language != "typescript" {
		t.Errorf("expected typescript, got %s", node.Language)
	}

	// Should have solid-js and @/ imports (not ./styles.css — not .ts/.tsx)
	if len(node.Imports) < 1 {
		t.Errorf("expected at least 1 import, got %d: %v", len(node.Imports), node.Imports)
	}

	symbolNames := make(map[string]string)
	for _, s := range node.Symbols {
		symbolNames[s.Name] = s.Kind
	}

	if symbolNames["App"] != "component" {
		t.Errorf("expected App component, got %s", symbolNames["App"])
	}
	if symbolNames["AppProps"] != "interface" {
		t.Error("expected AppProps interface")
	}
	if symbolNames["Theme"] != "type" {
		t.Error("expected Theme type")
	}
	if symbolNames["DEFAULT_THEME"] != "const" {
		t.Error("expected DEFAULT_THEME const")
	}
	if symbolNames["Router"] != "class" {
		t.Error("expected Router class")
	}
	if symbolNames["helperFunc"] != "func" {
		t.Error("expected helperFunc func")
	}
}

func TestParseUnsupportedFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "readme.md")
	os.WriteFile(path, []byte("# Hello"), 0644)

	node := ParseFile(path)
	if node != nil {
		t.Error("expected nil for unsupported file type")
	}
}
