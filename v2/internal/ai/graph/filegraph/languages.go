// languages.go defines regex-based parsing rules for each supported language.
// Each language provides import patterns and symbol patterns that the generic
// parseRegexFile function uses to extract FileNode data.
//
// Author: Subash Karki
package filegraph

import (
	"bufio"
	"os"
	"regexp"
	"strings"
	"time"
)

// symbolRule pairs a regex with the kind label for matched symbols.
type symbolRule struct {
	re   *regexp.Regexp
	kind string
}

// langRules defines how to parse a specific language.
type langRules struct {
	importREs  []*regexp.Regexp
	symbolREs  []symbolRule
}

// parseRegexFile is the generic parser used by all non-Go, non-TS languages.
func parseRegexFile(path, lang string, rules langRules) *FileNode {
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
	for _, re := range rules.importREs {
		for _, m := range re.FindAllStringSubmatch(content, -1) {
			if len(m) >= 2 && m[1] != "" {
				node.Imports = append(node.Imports, m[1])
			}
		}
	}

	// Extract symbols.
	seen := make(map[string]struct{})
	for _, rule := range rules.symbolREs {
		for _, loc := range rule.re.FindAllStringIndex(content, -1) {
			m := rule.re.FindStringSubmatch(content[loc[0]:loc[1]])
			if len(m) < 2 {
				continue
			}
			name := m[1]
			key := name + ":" + rule.kind
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			line := strings.Count(content[:loc[0]], "\n") + 1
			node.Symbols = append(node.Symbols, Symbol{
				Name: name,
				Kind: rule.kind,
				Line: line,
			})
		}
	}

	return node
}

// ── Python ──────────────────────────────────────────────────────────────────

var pythonRules = langRules{
	importREs: []*regexp.Regexp{
		regexp.MustCompile(`(?m)^import\s+([\w.]+)`),
		regexp.MustCompile(`(?m)^from\s+([\w.]+)\s+import`),
	},
	symbolREs: []symbolRule{
		{regexp.MustCompile(`(?m)^class\s+(\w+)`), "class"},
		{regexp.MustCompile(`(?m)^def\s+(\w+)`), "func"},
		{regexp.MustCompile(`(?m)^\s{4}def\s+(\w+)`), "method"},
		{regexp.MustCompile(`(?m)^(\w+)\s*:\s*\w+\s*=`), "var"},
		{regexp.MustCompile(`(?m)^([A-Z_][A-Z0-9_]+)\s*=`), "const"},
	},
}

// ── Rust ────────────────────────────────────────────────────────────────────

var rustRules = langRules{
	importREs: []*regexp.Regexp{
		regexp.MustCompile(`(?m)^use\s+([\w:]+)`),
		regexp.MustCompile(`(?m)^extern\s+crate\s+(\w+)`),
	},
	symbolREs: []symbolRule{
		{regexp.MustCompile(`(?m)^(?:pub\s+)?fn\s+(\w+)`), "func"},
		{regexp.MustCompile(`(?m)^(?:pub\s+)?struct\s+(\w+)`), "type"},
		{regexp.MustCompile(`(?m)^(?:pub\s+)?enum\s+(\w+)`), "type"},
		{regexp.MustCompile(`(?m)^(?:pub\s+)?trait\s+(\w+)`), "interface"},
		{regexp.MustCompile(`(?m)^(?:pub\s+)?type\s+(\w+)`), "type"},
		{regexp.MustCompile(`(?m)^(?:pub\s+)?const\s+(\w+)`), "const"},
		{regexp.MustCompile(`(?m)^(?:pub\s+)?static\s+(\w+)`), "var"},
		{regexp.MustCompile(`(?m)^(?:pub\s+)?mod\s+(\w+)`), "module"},
		{regexp.MustCompile(`(?m)^impl(?:<[^>]*>)?\s+(\w+)`), "impl"},
	},
}

// ── Java ────────────────────────────────────────────────────────────────────

var javaRules = langRules{
	importREs: []*regexp.Regexp{
		regexp.MustCompile(`(?m)^import\s+(?:static\s+)?([\w.]+)`),
	},
	symbolREs: []symbolRule{
		{regexp.MustCompile(`(?m)(?:public|private|protected)?\s*class\s+(\w+)`), "class"},
		{regexp.MustCompile(`(?m)(?:public|private|protected)?\s*interface\s+(\w+)`), "interface"},
		{regexp.MustCompile(`(?m)(?:public|private|protected)?\s*enum\s+(\w+)`), "type"},
		{regexp.MustCompile(`(?m)(?:public|private|protected)?\s*record\s+(\w+)`), "type"},
		{regexp.MustCompile(`(?m)(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?(?:abstract\s+)?[\w<>\[\],\s]+\s+(\w+)\s*\(`), "func"},
		{regexp.MustCompile(`(?m)(?:public|private|protected)\s+static\s+final\s+\w+\s+(\w+)\s*=`), "const"},
	},
}

// ── C# ──────────────────────────────────────────────────────────────────────

var csharpRules = langRules{
	importREs: []*regexp.Regexp{
		regexp.MustCompile(`(?m)^using\s+([\w.]+)\s*;`),
	},
	symbolREs: []symbolRule{
		{regexp.MustCompile(`(?m)(?:public|private|protected|internal)?\s*(?:static\s+)?(?:partial\s+)?class\s+(\w+)`), "class"},
		{regexp.MustCompile(`(?m)(?:public|private|protected|internal)?\s*interface\s+(\w+)`), "interface"},
		{regexp.MustCompile(`(?m)(?:public|private|protected|internal)?\s*(?:static\s+)?struct\s+(\w+)`), "type"},
		{regexp.MustCompile(`(?m)(?:public|private|protected|internal)?\s*enum\s+(\w+)`), "type"},
		{regexp.MustCompile(`(?m)(?:public|private|protected|internal)?\s*record\s+(\w+)`), "type"},
		{regexp.MustCompile(`(?m)(?:public|private|protected|internal)\s+(?:static\s+)?(?:async\s+)?(?:override\s+)?(?:virtual\s+)?[\w<>\[\]?,\s]+\s+(\w+)\s*\(`), "func"},
		{regexp.MustCompile(`(?m)namespace\s+([\w.]+)`), "module"},
		{regexp.MustCompile(`(?m)(?:public|private)\s+const\s+\w+\s+(\w+)`), "const"},
	},
}

// ── C ───────────────────────────────────────────────────────────────────────

var cRules = langRules{
	importREs: []*regexp.Regexp{
		regexp.MustCompile(`(?m)^#include\s+[<"]([^>"]+)[>"]`),
	},
	symbolREs: []symbolRule{
		{regexp.MustCompile(`(?m)^(?:static\s+)?(?:inline\s+)?(?:extern\s+)?(?:const\s+)?(?:unsigned\s+)?(?:signed\s+)?(?:long\s+)?(?:short\s+)?\w+[\s*]+(\w+)\s*\([^)]*\)\s*\{`), "func"},
		{regexp.MustCompile(`(?m)^typedef\s+(?:struct|union|enum)?\s*\{[^}]*\}\s*(\w+)\s*;`), "type"},
		{regexp.MustCompile(`(?m)^(?:typedef\s+)?struct\s+(\w+)`), "type"},
		{regexp.MustCompile(`(?m)^(?:typedef\s+)?enum\s+(\w+)`), "type"},
		{regexp.MustCompile(`(?m)^#define\s+(\w+)`), "const"},
	},
}

// ── C++ ─────────────────────────────────────────────────────────────────────

var cppRules = langRules{
	importREs: []*regexp.Regexp{
		regexp.MustCompile(`(?m)^#include\s+[<"]([^>"]+)[>"]`),
	},
	symbolREs: []symbolRule{
		{regexp.MustCompile(`(?m)^class\s+(\w+)`), "class"},
		{regexp.MustCompile(`(?m)^struct\s+(\w+)`), "type"},
		{regexp.MustCompile(`(?m)^enum\s+(?:class\s+)?(\w+)`), "type"},
		{regexp.MustCompile(`(?m)^namespace\s+(\w+)`), "module"},
		{regexp.MustCompile(`(?m)^template\s*<[^>]*>\s*class\s+(\w+)`), "class"},
		{regexp.MustCompile(`(?m)^(?:static\s+)?(?:inline\s+)?(?:virtual\s+)?(?:const\s+)?\w+[\s*&]+(\w+)\s*\([^)]*\)\s*(?:const\s*)?(?:override\s*)?(?:noexcept\s*)?\{`), "func"},
		{regexp.MustCompile(`(?m)^#define\s+(\w+)`), "const"},
	},
}

// ── Ruby ────────────────────────────────────────────────────────────────────

var rubyRules = langRules{
	importREs: []*regexp.Regexp{
		regexp.MustCompile(`(?m)^require\s+['"]([^'"]+)['"]`),
		regexp.MustCompile(`(?m)^require_relative\s+['"]([^'"]+)['"]`),
		regexp.MustCompile(`(?m)^gem\s+['"]([^'"]+)['"]`),
	},
	symbolREs: []symbolRule{
		{regexp.MustCompile(`(?m)^\s*class\s+(\w+)`), "class"},
		{regexp.MustCompile(`(?m)^\s*module\s+(\w+)`), "module"},
		{regexp.MustCompile(`(?m)^\s*def\s+(?:self\.)?(\w+[?!]?)`), "func"},
		{regexp.MustCompile(`(?m)^\s*attr_(?:accessor|reader|writer)\s+:(\w+)`), "var"},
		{regexp.MustCompile(`(?m)^([A-Z_][A-Z0-9_]+)\s*=`), "const"},
	},
}

// ── PHP ─────────────────────────────────────────────────────────────────────

var phpRules = langRules{
	importREs: []*regexp.Regexp{
		regexp.MustCompile(`(?m)^use\s+([\w\\]+)`),
		regexp.MustCompile(`(?m)^(?:require|include)(?:_once)?\s+['"]([^'"]+)['"]`),
	},
	symbolREs: []symbolRule{
		{regexp.MustCompile(`(?m)(?:abstract\s+)?class\s+(\w+)`), "class"},
		{regexp.MustCompile(`(?m)interface\s+(\w+)`), "interface"},
		{regexp.MustCompile(`(?m)trait\s+(\w+)`), "interface"},
		{regexp.MustCompile(`(?m)enum\s+(\w+)`), "type"},
		{regexp.MustCompile(`(?m)(?:public|private|protected)?\s*(?:static\s+)?function\s+(\w+)`), "func"},
		{regexp.MustCompile(`(?m)const\s+(\w+)\s*=`), "const"},
		{regexp.MustCompile(`(?m)namespace\s+([\w\\]+)`), "module"},
	},
}

// ── Swift ───────────────────────────────────────────────────────────────────

var swiftRules = langRules{
	importREs: []*regexp.Regexp{
		regexp.MustCompile(`(?m)^import\s+(\w+)`),
	},
	symbolREs: []symbolRule{
		{regexp.MustCompile(`(?m)(?:public\s+|private\s+|internal\s+|open\s+|fileprivate\s+)?(?:final\s+)?class\s+(\w+)`), "class"},
		{regexp.MustCompile(`(?m)(?:public\s+|private\s+)?struct\s+(\w+)`), "type"},
		{regexp.MustCompile(`(?m)(?:public\s+|private\s+)?enum\s+(\w+)`), "type"},
		{regexp.MustCompile(`(?m)(?:public\s+|private\s+)?protocol\s+(\w+)`), "interface"},
		{regexp.MustCompile(`(?m)(?:public\s+|private\s+|internal\s+)?(?:static\s+)?(?:override\s+)?func\s+(\w+)`), "func"},
		{regexp.MustCompile(`(?m)(?:public\s+|private\s+)?let\s+(\w+)`), "const"},
		{regexp.MustCompile(`(?m)(?:public\s+|private\s+)?var\s+(\w+)`), "var"},
		{regexp.MustCompile(`(?m)(?:public\s+|private\s+)?typealias\s+(\w+)`), "type"},
	},
}

// ── Kotlin ──────────────────────────────────────────────────────────────────

var kotlinRules = langRules{
	importREs: []*regexp.Regexp{
		regexp.MustCompile(`(?m)^import\s+([\w.]+)`),
	},
	symbolREs: []symbolRule{
		{regexp.MustCompile(`(?m)(?:data\s+|sealed\s+|abstract\s+|open\s+)?class\s+(\w+)`), "class"},
		{regexp.MustCompile(`(?m)(?:fun\s+)?interface\s+(\w+)`), "interface"},
		{regexp.MustCompile(`(?m)enum\s+class\s+(\w+)`), "type"},
		{regexp.MustCompile(`(?m)object\s+(\w+)`), "type"},
		{regexp.MustCompile(`(?m)(?:suspend\s+)?(?:inline\s+)?(?:private\s+|internal\s+)?fun\s+(?:<[^>]*>\s+)?(\w+)`), "func"},
		{regexp.MustCompile(`(?m)(?:const\s+)?val\s+(\w+)`), "const"},
		{regexp.MustCompile(`(?m)var\s+(\w+)`), "var"},
		{regexp.MustCompile(`(?m)typealias\s+(\w+)`), "type"},
	},
}

// ── Scala ───────────────────────────────────────────────────────────────────

var scalaRules = langRules{
	importREs: []*regexp.Regexp{
		regexp.MustCompile(`(?m)^import\s+([\w.]+)`),
	},
	symbolREs: []symbolRule{
		{regexp.MustCompile(`(?m)(?:case\s+)?class\s+(\w+)`), "class"},
		{regexp.MustCompile(`(?m)trait\s+(\w+)`), "interface"},
		{regexp.MustCompile(`(?m)object\s+(\w+)`), "type"},
		{regexp.MustCompile(`(?m)(?:sealed\s+)?enum\s+(\w+)`), "type"},
		{regexp.MustCompile(`(?m)def\s+(\w+)`), "func"},
		{regexp.MustCompile(`(?m)val\s+(\w+)`), "const"},
		{regexp.MustCompile(`(?m)var\s+(\w+)`), "var"},
		{regexp.MustCompile(`(?m)type\s+(\w+)`), "type"},
	},
}

// ── Dart ────────────────────────────────────────────────────────────────────

var dartRules = langRules{
	importREs: []*regexp.Regexp{
		regexp.MustCompile(`(?m)^import\s+['"]([^'"]+)['"]`),
		regexp.MustCompile(`(?m)^export\s+['"]([^'"]+)['"]`),
	},
	symbolREs: []symbolRule{
		{regexp.MustCompile(`(?m)(?:abstract\s+)?class\s+(\w+)`), "class"},
		{regexp.MustCompile(`(?m)mixin\s+(\w+)`), "interface"},
		{regexp.MustCompile(`(?m)enum\s+(\w+)`), "type"},
		{regexp.MustCompile(`(?m)extension\s+(\w+)`), "type"},
		{regexp.MustCompile(`(?m)(?:static\s+)?(?:Future|Stream|void|int|double|bool|String|dynamic|var|\w+)\s+(\w+)\s*\(`), "func"},
		{regexp.MustCompile(`(?m)(?:final|const)\s+\w+\s+(\w+)\s*=`), "const"},
		{regexp.MustCompile(`(?m)typedef\s+(\w+)`), "type"},
	},
}

// ── Lua ─────────────────────────────────────────────────────────────────────

var luaRules = langRules{
	importREs: []*regexp.Regexp{
		regexp.MustCompile(`(?m)require\s*\(?['"]([^'"]+)['"]\)?`),
	},
	symbolREs: []symbolRule{
		{regexp.MustCompile(`(?m)^(?:local\s+)?function\s+(\w+)`), "func"},
		{regexp.MustCompile(`(?m)^function\s+\w+[.:]\s*(\w+)`), "method"},
		{regexp.MustCompile(`(?m)^local\s+(\w+)\s*=\s*\{`), "type"},
		{regexp.MustCompile(`(?m)^(\w+)\s*=\s*\{`), "type"},
	},
}

// ── Zig ─────────────────────────────────────────────────────────────────────

var zigRules = langRules{
	importREs: []*regexp.Regexp{
		regexp.MustCompile(`(?m)@import\("([^"]+)"\)`),
	},
	symbolREs: []symbolRule{
		{regexp.MustCompile(`(?m)(?:pub\s+)?fn\s+(\w+)`), "func"},
		{regexp.MustCompile(`(?m)(?:pub\s+)?const\s+(\w+)\s*=\s*struct`), "type"},
		{regexp.MustCompile(`(?m)(?:pub\s+)?const\s+(\w+)\s*=\s*enum`), "type"},
		{regexp.MustCompile(`(?m)(?:pub\s+)?const\s+(\w+)\s*=\s*union`), "type"},
		{regexp.MustCompile(`(?m)(?:pub\s+)?const\s+(\w+)`), "const"},
		{regexp.MustCompile(`(?m)(?:pub\s+)?var\s+(\w+)`), "var"},
	},
}

// ── Elixir ──────────────────────────────────────────────────────────────────

var elixirRules = langRules{
	importREs: []*regexp.Regexp{
		regexp.MustCompile(`(?m)^\s*(?:import|alias|use|require)\s+([\w.]+)`),
	},
	symbolREs: []symbolRule{
		{regexp.MustCompile(`(?m)^\s*defmodule\s+([\w.]+)`), "module"},
		{regexp.MustCompile(`(?m)^\s*def\s+(\w+[?!]?)`), "func"},
		{regexp.MustCompile(`(?m)^\s*defp\s+(\w+[?!]?)`), "func"},
		{regexp.MustCompile(`(?m)^\s*defmacro\s+(\w+[?!]?)`), "func"},
		{regexp.MustCompile(`(?m)^\s*defstruct`), "type"},
		{regexp.MustCompile(`(?m)^\s*@(\w+)\s+`), "const"},
	},
}
