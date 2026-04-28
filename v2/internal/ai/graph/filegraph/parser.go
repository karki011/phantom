// parser.go extracts symbols and imports from source files.
// Go files use the standard go/parser AST. TypeScript/JavaScript use regex.
//
// Author: Subash Karki
package filegraph

import (
	"bufio"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// ParseFile extracts a FileNode from a source file. Returns nil for
// unsupported file types or parse errors.
func ParseFile(path string) *FileNode {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".go":
		return parseGoFile(path)
	case ".ts", ".tsx":
		return parseTSFile(path, "typescript")
	case ".js", ".jsx":
		return parseTSFile(path, "javascript")
	case ".py":
		return parseRegexFile(path, "python", pythonRules)
	case ".rs":
		return parseRegexFile(path, "rust", rustRules)
	case ".java":
		return parseRegexFile(path, "java", javaRules)
	case ".cs":
		return parseRegexFile(path, "csharp", csharpRules)
	case ".c", ".h":
		return parseRegexFile(path, "c", cRules)
	case ".cpp", ".cc", ".cxx", ".hpp":
		return parseRegexFile(path, "cpp", cppRules)
	case ".rb":
		return parseRegexFile(path, "ruby", rubyRules)
	case ".php":
		return parseRegexFile(path, "php", phpRules)
	case ".swift":
		return parseRegexFile(path, "swift", swiftRules)
	case ".kt", ".kts":
		return parseRegexFile(path, "kotlin", kotlinRules)
	case ".scala":
		return parseRegexFile(path, "scala", scalaRules)
	case ".dart":
		return parseRegexFile(path, "dart", dartRules)
	case ".lua":
		return parseRegexFile(path, "lua", luaRules)
	case ".zig":
		return parseRegexFile(path, "zig", zigRules)
	case ".ex", ".exs":
		return parseRegexFile(path, "elixir", elixirRules)
	default:
		return nil
	}
}

// LanguageForExt returns the language name for a file extension, or empty string.
func LanguageForExt(ext string) string {
	switch strings.ToLower(ext) {
	case ".go":
		return "go"
	case ".ts", ".tsx":
		return "typescript"
	case ".js", ".jsx":
		return "javascript"
	case ".py":
		return "python"
	case ".rs":
		return "rust"
	case ".java":
		return "java"
	case ".cs":
		return "csharp"
	case ".c", ".h":
		return "c"
	case ".cpp", ".cc", ".cxx", ".hpp":
		return "cpp"
	case ".rb":
		return "ruby"
	case ".php":
		return "php"
	case ".swift":
		return "swift"
	case ".kt", ".kts":
		return "kotlin"
	case ".scala":
		return "scala"
	case ".dart":
		return "dart"
	case ".lua":
		return "lua"
	case ".zig":
		return "zig"
	case ".ex", ".exs":
		return "elixir"
	default:
		return ""
	}
}

// --- Go parser ---

func parseGoFile(path string) *FileNode {
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, path, nil, parser.SkipObjectResolution)
	if err != nil {
		return nil
	}

	info, _ := os.Stat(path)
	var size int64
	if info != nil {
		size = info.Size()
	}

	node := &FileNode{
		Path:       path,
		Language:   "go",
		LastParsed: time.Now(),
		SizeBytes:  size,
	}

	// Extract imports.
	for _, imp := range f.Imports {
		impPath := strings.Trim(imp.Path.Value, `"`)
		node.Imports = append(node.Imports, impPath)
	}

	// Extract top-level symbols.
	for _, decl := range f.Decls {
		switch d := decl.(type) {
		case *ast.FuncDecl:
			kind := "func"
			name := d.Name.Name
			if d.Recv != nil && len(d.Recv.List) > 0 {
				kind = "method"
			}
			node.Symbols = append(node.Symbols, Symbol{
				Name: name,
				Kind: kind,
				Line: fset.Position(d.Pos()).Line,
			})
		case *ast.GenDecl:
			for _, spec := range d.Specs {
				switch s := spec.(type) {
				case *ast.TypeSpec:
					kind := "type"
					if _, ok := s.Type.(*ast.InterfaceType); ok {
						kind = "interface"
					}
					node.Symbols = append(node.Symbols, Symbol{
						Name: s.Name.Name,
						Kind: kind,
						Line: fset.Position(s.Pos()).Line,
					})
				case *ast.ValueSpec:
					kind := "var"
					if d.Tok == token.CONST {
						kind = "const"
					}
					for _, name := range s.Names {
						if name.Name == "_" {
							continue
						}
						node.Symbols = append(node.Symbols, Symbol{
							Name: name.Name,
							Kind: kind,
							Line: fset.Position(name.Pos()).Line,
						})
					}
				}
			}
		}
	}

	return node
}

// --- TypeScript/JavaScript parser (regex-based) ---

var (
	tsImportRe    = regexp.MustCompile(`(?m)^import\s+(?:.*\s+from\s+)?['"]([^'"]+)['"]`)
	tsRequireRe   = regexp.MustCompile(`require\(['"]([^'"]+)['"]\)`)
	tsFuncRe      = regexp.MustCompile(`(?m)^(?:export\s+)?(?:async\s+)?function\s+(\w+)`)
	tsClassRe     = regexp.MustCompile(`(?m)^(?:export\s+)?class\s+(\w+)`)
	tsInterfaceRe = regexp.MustCompile(`(?m)^(?:export\s+)?interface\s+(\w+)`)
	tsTypeRe      = regexp.MustCompile(`(?m)^(?:export\s+)?type\s+(\w+)`)
	tsConstRe     = regexp.MustCompile(`(?m)^(?:export\s+)?const\s+(\w+)`)
	tsComponentRe = regexp.MustCompile(`(?m)^(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w+)\s*\(`)
)

func parseTSFile(path, lang string) *FileNode {
	file, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer file.Close()

	info, _ := file.Stat()
	var size int64
	if info != nil {
		size = info.Size()
	}

	// Read file content (cap at 500KB to avoid huge generated files).
	if size > 500*1024 {
		return nil
	}

	var lines []string
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 0, 64*1024), 512*1024)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	content := strings.Join(lines, "\n")

	node := &FileNode{
		Path:       path,
		Language:   lang,
		LastParsed: time.Now(),
		SizeBytes:  size,
	}

	// Extract imports.
	for _, m := range tsImportRe.FindAllStringSubmatch(content, -1) {
		node.Imports = append(node.Imports, m[1])
	}
	for _, m := range tsRequireRe.FindAllStringSubmatch(content, -1) {
		node.Imports = append(node.Imports, m[1])
	}

	// Extract symbols with line numbers.
	extractSymbols := func(re *regexp.Regexp, kind string) {
		for _, loc := range re.FindAllStringIndex(content, -1) {
			m := re.FindStringSubmatch(content[loc[0]:loc[1]])
			if len(m) < 2 {
				continue
			}
			line := strings.Count(content[:loc[0]], "\n") + 1
			symKind := kind
			if kind == "func" && len(m[1]) > 0 && m[1][0] >= 'A' && m[1][0] <= 'Z' {
				symKind = "component"
			}
			node.Symbols = append(node.Symbols, Symbol{
				Name: m[1],
				Kind: symKind,
				Line: line,
			})
		}
	}

	extractSymbols(tsComponentRe, "func")
	extractSymbols(tsFuncRe, "func")
	extractSymbols(tsClassRe, "class")
	extractSymbols(tsInterfaceRe, "interface")
	extractSymbols(tsTypeRe, "type")
	extractSymbols(tsConstRe, "const")

	// Deduplicate symbols (component regex may overlap with func regex).
	seen := make(map[string]struct{})
	deduped := node.Symbols[:0]
	for _, sym := range node.Symbols {
		key := sym.Name + ":" + sym.Kind
		if _, ok := seen[key]; !ok {
			seen[key] = struct{}{}
			deduped = append(deduped, sym)
		}
	}
	node.Symbols = deduped

	return node
}
