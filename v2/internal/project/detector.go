// Package project provides automatic project type detection and build recipe extraction.
// It scans a repository directory for well-known config files and generates a Profile
// describing the project type, build system, available recipes, and environment needs.
//
// Author: Subash Karki
package project

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// ProjectType identifies the primary language / framework of a repository.
type ProjectType string

const (
	TypePython   ProjectType = "python"
	TypeNode     ProjectType = "node"
	TypeMonorepo ProjectType = "monorepo"
	TypeInfra    ProjectType = "infra"
	TypeGo       ProjectType = "go"
	TypeRust     ProjectType = "rust"
	TypeUnknown  ProjectType = "unknown"
)

// RecipeCategory groups recipes by their purpose.
type RecipeCategory string

const (
	CategorySetup  RecipeCategory = "setup"
	CategoryTest   RecipeCategory = "test"
	CategoryLint   RecipeCategory = "lint"
	CategoryBuild  RecipeCategory = "build"
	CategoryServe  RecipeCategory = "serve"
	CategoryDeploy RecipeCategory = "deploy"
	CategoryCustom RecipeCategory = "custom"
)

// Recipe represents a single runnable command extracted from a project.
type Recipe struct {
	ID          string         `json:"id"`
	Label       string         `json:"label"`
	Command     string         `json:"command"`
	Icon        string         `json:"icon"`
	Description string         `json:"description"`
	Category    RecipeCategory `json:"category"`
	Auto        bool           `json:"auto"`
}

// Profile is the result of project detection — everything PhantomOS needs to
// present build/test/deploy options for a given repository.
type Profile struct {
	Type        ProjectType `json:"type"`
	BuildSystem string      `json:"build_system"`
	Recipes     []Recipe    `json:"recipes"`
	EnvNeeds    []string    `json:"env_needs"`
	PackageMgr  string      `json:"package_manager"`
	Detected    bool        `json:"detected"`
	DetectedAt  int64       `json:"detected_at"`
}

// ---------------------------------------------------------------------------
// Detect — main entry point
// ---------------------------------------------------------------------------

// Detect inspects repoPath and returns a Profile describing the project.
// It is safe to call from a goroutine — it never panics.
func Detect(repoPath string) Profile {
	p := Profile{
		Type:    TypeUnknown,
		Recipes: []Recipe{},
	}

	// --- 1. Determine project type (first match wins) ---

	switch {
	case fileExists(repoPath, "nx.json"):
		p.Type = TypeMonorepo
		p.BuildSystem = "nx"
	case fileExists(repoPath, "turbo.json"):
		p.Type = TypeMonorepo
		p.BuildSystem = "turbo"
	case fileExists(repoPath, "Cargo.toml"):
		p.Type = TypeRust
		p.BuildSystem = "cargo"
	case fileExists(repoPath, "go.mod"):
		p.Type = TypeGo
		p.BuildSystem = "go"
	case fileExists(repoPath, "pyproject.toml") ||
		fileExists(repoPath, "setup.py") ||
		fileExists(repoPath, "requirements.txt"):
		p.Type = TypePython
		p.BuildSystem = detectPythonBuildSystem(repoPath)
	case fileExists(repoPath, "package.json"):
		p.Type = TypeNode
		p.BuildSystem = detectNodeBuildSystem(repoPath)
	case fileExists(repoPath, "Makefile") &&
		(fileExists(repoPath, "template.yaml") || fileExists(repoPath, "serverless.yml")):
		p.Type = TypeInfra
		if fileExists(repoPath, "template.yaml") {
			p.BuildSystem = "sam"
		} else {
			p.BuildSystem = "serverless"
		}
	}
	// Makefile-only (or nothing found) stays TypeUnknown, handled below.

	// --- 2. Collect recipes from all applicable extractors ---

	seen := make(map[string]bool)
	addRecipes := func(rr []Recipe) {
		for _, r := range rr {
			if !seen[r.ID] {
				seen[r.ID] = true
				p.Recipes = append(p.Recipes, r)
			}
		}
	}

	switch p.Type {
	case TypeMonorepo:
		if p.BuildSystem == "nx" {
			addRecipes(extractNxRecipes())
		}
		// Monorepos often have npm scripts too.
		addRecipes(extractNpmRecipes(repoPath))
		addRecipes(extractMakefileRecipes(repoPath))
	case TypeRust:
		addRecipes(extractCargoRecipes())
		addRecipes(extractMakefileRecipes(repoPath))
	case TypeGo:
		addRecipes(extractGoRecipes())
		addRecipes(extractMakefileRecipes(repoPath))
	case TypePython:
		addRecipes(extractPythonRecipes(repoPath))
		addRecipes(extractMakefileRecipes(repoPath))
	case TypeNode:
		addRecipes(extractNpmRecipes(repoPath))
		addRecipes(extractMakefileRecipes(repoPath))
	case TypeInfra:
		addRecipes(extractMakefileRecipes(repoPath))
	default:
		// TypeUnknown — still try Makefile recipes
		addRecipes(extractMakefileRecipes(repoPath))
	}

	// Cap at 75 recipes.
	if len(p.Recipes) > 75 {
		p.Recipes = p.Recipes[:75]
	}

	// --- 3. Detect env needs ---

	p.EnvNeeds = detectEnvNeeds(repoPath, p.Type)

	// --- 4. Detect package manager ---

	p.PackageMgr = detectPackageManager(repoPath, p.Type)

	// --- 5. Finalize ---

	p.Detected = true
	p.DetectedAt = time.Now().Unix()

	return p
}

// ---------------------------------------------------------------------------
// Recipe extractors
// ---------------------------------------------------------------------------

var makeTargetRe = regexp.MustCompile(`^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:`)

func extractMakefileRecipes(repoPath string) []Recipe {
	lines := readLines(filepath.Join(repoPath, "Makefile"))
	if lines == nil {
		return nil
	}

	var recipes []Recipe
	for _, line := range lines {
		m := makeTargetRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		target := m[1]
		// Skip hidden targets and pattern rules.
		if strings.HasPrefix(target, ".") || strings.Contains(target, "%") {
			continue
		}
		cat := categorize(target)
		recipes = append(recipes, Recipe{
			ID:       target,
			Label:    humanize(target),
			Command:  "make " + target,
			Icon:     iconForCategory(cat),
			Category: cat,
			Auto:     false,
		})
	}
	return recipes
}

func extractNpmRecipes(repoPath string) []Recipe {
	data, err := os.ReadFile(filepath.Join(repoPath, "package.json"))
	if err != nil {
		return nil
	}

	var pkg struct {
		Scripts map[string]string `json:"scripts"`
	}
	if json.Unmarshal(data, &pkg) != nil || pkg.Scripts == nil {
		return nil
	}

	// Detect package manager for the command prefix.
	mgr := detectNodePackageManager(repoPath)

	// Lifecycle hooks to skip.
	skip := map[string]bool{
		"preinstall":     true,
		"postinstall":    true,
		"prepare":        true,
		"prepublishOnly": true,
	}

	// Known direct commands (no "run" needed).
	directCmds := map[string]bool{
		"test":    true,
		"start":   true,
		"build":   true,
		"install": true,
	}

	var recipes []Recipe
	for name := range pkg.Scripts {
		if skip[name] {
			continue
		}
		var cmd string
		if directCmds[name] {
			cmd = mgr + " " + name
		} else {
			cmd = mgr + " run " + name
		}
		cat := categorize(name)
		recipes = append(recipes, Recipe{
			ID:          name,
			Label:       humanize(name),
			Command:     cmd,
			Icon:        iconForCategory(cat),
			Description: pkg.Scripts[name],
			Category:    cat,
			Auto:        false,
		})
	}
	return recipes
}

func extractPythonRecipes(repoPath string) []Recipe {
	var recipes []Recipe

	// Check pyproject.toml for script entries.
	lines := readLines(filepath.Join(repoPath, "pyproject.toml"))
	if lines != nil {
		inScripts := false
		for _, line := range lines {
			trimmed := strings.TrimSpace(line)
			if trimmed == "[tool.poetry.scripts]" || trimmed == "[project.scripts]" {
				inScripts = true
				continue
			}
			if inScripts {
				if strings.HasPrefix(trimmed, "[") {
					break // new section
				}
				parts := strings.SplitN(trimmed, "=", 2)
				if len(parts) == 2 {
					name := strings.TrimSpace(parts[0])
					if name != "" {
						cat := categorize(name)
						recipes = append(recipes, Recipe{
							ID:       name,
							Label:    humanize(name),
							Command:  name,
							Icon:     iconForCategory(cat),
							Category: cat,
							Auto:     false,
						})
					}
				}
			}
		}
	}

	// Standard python recipes — add if deps suggest them.
	allContent := strings.Join(lines, "\n")
	reqContent := readFileString(filepath.Join(repoPath, "requirements.txt"))
	combined := allContent + "\n" + reqContent

	if strings.Contains(combined, "pytest") {
		recipes = append(recipes, Recipe{
			ID:       "pytest",
			Label:    "Pytest",
			Command:  "pytest",
			Icon:     iconForCategory(CategoryTest),
			Category: CategoryTest,
			Auto:     true,
		})
	}
	if strings.Contains(combined, "ruff") {
		recipes = append(recipes, Recipe{
			ID:       "ruff",
			Label:    "Ruff Check",
			Command:  "ruff check .",
			Icon:     iconForCategory(CategoryLint),
			Category: CategoryLint,
			Auto:     true,
		})
	}
	recipes = append(recipes, Recipe{
		ID:       "python-build",
		Label:    "Python Build",
		Command:  "python -m build",
		Icon:     iconForCategory(CategoryBuild),
		Category: CategoryBuild,
		Auto:     false,
	})

	return recipes
}

func extractNxRecipes() []Recipe {
	return []Recipe{
		{ID: "nx-build", Label: "Nx Build All", Command: "nx run-many --target=build", Icon: iconForCategory(CategoryBuild), Category: CategoryBuild, Auto: true},
		{ID: "nx-test", Label: "Nx Test All", Command: "nx run-many --target=test", Icon: iconForCategory(CategoryTest), Category: CategoryTest, Auto: true},
		{ID: "nx-lint", Label: "Nx Lint All", Command: "nx run-many --target=lint", Icon: iconForCategory(CategoryLint), Category: CategoryLint, Auto: true},
		{ID: "nx-affected-test", Label: "Nx Affected Test", Command: "nx affected --target=test", Icon: iconForCategory(CategoryTest), Category: CategoryTest, Auto: false},
	}
}

func extractCargoRecipes() []Recipe {
	return []Recipe{
		{ID: "cargo-build", Label: "Cargo Build", Command: "cargo build", Icon: iconForCategory(CategoryBuild), Category: CategoryBuild, Auto: true},
		{ID: "cargo-test", Label: "Cargo Test", Command: "cargo test", Icon: iconForCategory(CategoryTest), Category: CategoryTest, Auto: true},
		{ID: "cargo-clippy", Label: "Cargo Clippy", Command: "cargo clippy", Icon: iconForCategory(CategoryLint), Category: CategoryLint, Auto: true},
		{ID: "cargo-fmt-check", Label: "Cargo Fmt Check", Command: "cargo fmt --check", Icon: iconForCategory(CategoryLint), Category: CategoryLint, Auto: false},
		{ID: "cargo-run", Label: "Cargo Run", Command: "cargo run", Icon: iconForCategory(CategoryServe), Category: CategoryServe, Auto: false},
		{ID: "cargo-doc", Label: "Cargo Doc", Command: "cargo doc", Icon: iconForCategory(CategoryBuild), Category: CategoryBuild, Auto: false},
	}
}

func extractGoRecipes() []Recipe {
	return []Recipe{
		{ID: "go-build", Label: "Go Build", Command: "go build ./...", Icon: iconForCategory(CategoryBuild), Category: CategoryBuild, Auto: true},
		{ID: "go-test", Label: "Go Test", Command: "go test ./...", Icon: iconForCategory(CategoryTest), Category: CategoryTest, Auto: true},
		{ID: "go-vet", Label: "Go Vet", Command: "go vet ./...", Icon: iconForCategory(CategoryLint), Category: CategoryLint, Auto: true},
		{ID: "go-fmt", Label: "Go Fmt", Command: "go fmt ./...", Icon: iconForCategory(CategoryLint), Category: CategoryLint, Auto: false},
		{ID: "go-run", Label: "Go Run", Command: "go run .", Icon: iconForCategory(CategoryServe), Category: CategoryServe, Auto: false},
	}
}

// ---------------------------------------------------------------------------
// Helpers — categorize, humanize, icon
// ---------------------------------------------------------------------------

func categorize(name string) RecipeCategory {
	lower := strings.ToLower(name)
	testKw := []string{"test", "spec", "check", "verify"}
	lintKw := []string{"lint", "format", "fmt", "eslint", "prettier", "biome", "ruff"}
	buildKw := []string{"build", "compile", "dist", "bundle"}
	serveKw := []string{"start", "serve", "dev", "watch", "run"}
	deployKw := []string{"deploy", "release", "publish", "push"}
	setupKw := []string{"install", "setup", "init", "bootstrap"}

	for _, kw := range testKw {
		if strings.Contains(lower, kw) {
			return CategoryTest
		}
	}
	for _, kw := range lintKw {
		if strings.Contains(lower, kw) {
			return CategoryLint
		}
	}
	for _, kw := range buildKw {
		if strings.Contains(lower, kw) {
			return CategoryBuild
		}
	}
	for _, kw := range serveKw {
		if strings.Contains(lower, kw) {
			return CategoryServe
		}
	}
	for _, kw := range deployKw {
		if strings.Contains(lower, kw) {
			return CategoryDeploy
		}
	}
	for _, kw := range setupKw {
		if strings.Contains(lower, kw) {
			return CategorySetup
		}
	}
	return CategoryCustom
}

// uppercaseAbbreviations are kept uppercase during humanize.
var uppercaseAbbreviations = map[string]string{
	"sam": "SAM",
	"aws": "AWS",
	"ci":  "CI",
	"cd":  "CD",
	"api": "API",
	"db":  "DB",
	"ui":  "UI",
}

func humanize(target string) string {
	// Replace - and _ with spaces.
	s := strings.NewReplacer("-", " ", "_", " ").Replace(target)
	words := strings.Fields(s)
	for i, w := range words {
		lower := strings.ToLower(w)
		if abbr, ok := uppercaseAbbreviations[lower]; ok {
			words[i] = abbr
		} else {
			words[i] = titleCase(w)
		}
	}
	return strings.Join(words, " ")
}

// titleCase capitalizes the first rune of a word.
func titleCase(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + strings.ToLower(s[1:])
}

func iconForCategory(cat RecipeCategory) string {
	switch cat {
	case CategorySetup:
		return "⚙️"
	case CategoryTest:
		return "🧪"
	case CategoryLint:
		return "🔍"
	case CategoryBuild:
		return "🔨"
	case CategoryServe:
		return "🚀"
	case CategoryDeploy:
		return "📦"
	default:
		return "▶️"
	}
}

// ---------------------------------------------------------------------------
// Helpers — build system / package manager detection
// ---------------------------------------------------------------------------

func detectPythonBuildSystem(repoPath string) string {
	content := readFileString(filepath.Join(repoPath, "pyproject.toml"))
	if strings.Contains(content, "[tool.poetry]") {
		return "poetry"
	}
	if fileExists(repoPath, "uv.lock") {
		return "uv"
	}
	return "pip"
}

func detectNodeBuildSystem(repoPath string) string {
	data, err := os.ReadFile(filepath.Join(repoPath, "package.json"))
	if err != nil {
		return "unknown"
	}

	var pkg struct {
		Dependencies    map[string]string `json:"dependencies"`
		DevDependencies map[string]string `json:"devDependencies"`
	}
	if json.Unmarshal(data, &pkg) != nil {
		return "unknown"
	}

	// Merge deps for lookup.
	all := make(map[string]bool)
	for k := range pkg.Dependencies {
		all[k] = true
	}
	for k := range pkg.DevDependencies {
		all[k] = true
	}

	switch {
	case all["next"]:
		return "next"
	case all["vite"]:
		return "vite"
	case all["webpack"]:
		return "webpack"
	case all["esbuild"]:
		return "esbuild"
	case all["rollup"]:
		return "rollup"
	case all["parcel"]:
		return "parcel"
	default:
		return "npm"
	}
}

func detectNodePackageManager(repoPath string) string {
	switch {
	case fileExists(repoPath, "pnpm-lock.yaml"):
		return "pnpm"
	case fileExists(repoPath, "bun.lock") || fileExists(repoPath, "bun.lockb"):
		return "bun"
	default:
		return "npm"
	}
}

func detectPackageManager(repoPath string, pt ProjectType) string {
	switch pt {
	case TypeNode, TypeMonorepo:
		return detectNodePackageManager(repoPath)
	case TypePython:
		bs := detectPythonBuildSystem(repoPath)
		if bs == "poetry" {
			return "poetry"
		}
		if bs == "uv" {
			return "uv"
		}
		return "pip"
	case TypeRust:
		return "cargo"
	case TypeGo:
		return "go"
	default:
		return ""
	}
}

// ---------------------------------------------------------------------------
// Helpers — env needs detection
// ---------------------------------------------------------------------------

func detectEnvNeeds(repoPath string, pt ProjectType) []string {
	var needs []string

	switch pt {
	case TypeGo:
		needs = append(needs, "go")
	case TypeNode, TypeMonorepo:
		needs = append(needs, "node")
	case TypePython:
		needs = append(needs, "python")
	case TypeRust:
		needs = append(needs, "rust")
	}

	// Docker
	if fileExists(repoPath, "Dockerfile") || fileExists(repoPath, "docker-compose.yml") || fileExists(repoPath, "docker-compose.yaml") {
		needs = append(needs, "docker")
	}

	// Env vars
	if fileExists(repoPath, ".env") || fileExists(repoPath, ".env.example") {
		needs = append(needs, "env-vars")
	}

	// AWS SAM
	if fileExists(repoPath, "template.yaml") || fileExists(repoPath, "samconfig.toml") {
		needs = append(needs, "aws-cli", "sam-cli")
	}

	return needs
}

// ---------------------------------------------------------------------------
// Helpers — file I/O (non-fatal on errors)
// ---------------------------------------------------------------------------

func fileExists(base, name string) bool {
	_, err := os.Stat(filepath.Join(base, name))
	return err == nil
}

func readLines(path string) []string {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	var lines []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	return lines
}

func readFileString(path string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	return string(data)
}
