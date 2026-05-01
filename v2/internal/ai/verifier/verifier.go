// Package verifier provides execution-based outcome verification for AI edits.
//
// It auto-detects the project type from the project root (package.json, go.mod,
// Cargo.toml, pyproject.toml) and runs appropriate verification commands (typecheck,
// test). Results are returned as structured pass/fail signals that feed into the
// knowledge layer.
//
// Author: Subash Karki
package verifier

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// Result holds the outcome of a single verification command.
type Result struct {
	Command    string        `json:"command"`
	Passed     bool          `json:"passed"`
	ExitCode   int           `json:"exit_code"`
	Output     string        `json:"output"` // last 500 chars
	DurationMs int64         `json:"duration_ms"`
}

// ProjectVerification holds the aggregate result of verifying a project.
type ProjectVerification struct {
	ProjectID string   `json:"project_id"`
	Results   []Result `json:"results"`
	AllPassed bool     `json:"all_passed"`
	Timestamp string   `json:"timestamp"`
}

// commandDef describes a verification command to run.
type commandDef struct {
	Name    string
	Cmd     string
	Args    []string
	Timeout time.Duration
}

// verifierDef describes how to detect and verify a project type.
type verifierDef struct {
	DetectFile string
	Commands   []commandDef
}

// verifiers maps project type names to their verification definitions.
var verifiers = map[string]verifierDef{
	"typescript": {
		DetectFile: "package.json",
		Commands: []commandDef{
			{Name: "typecheck", Cmd: "npx", Args: []string{"tsc", "--noEmit"}, Timeout: 30 * time.Second},
			{Name: "test", Cmd: "bun", Args: []string{"test", "--bail"}, Timeout: 60 * time.Second},
		},
	},
	"go": {
		DetectFile: "go.mod",
		Commands: []commandDef{
			{Name: "vet", Cmd: "go", Args: []string{"vet", "./..."}, Timeout: 30 * time.Second},
			{Name: "test", Cmd: "go", Args: []string{"test", "./..."}, Timeout: 60 * time.Second},
		},
	},
	"rust": {
		DetectFile: "Cargo.toml",
		Commands: []commandDef{
			{Name: "check", Cmd: "cargo", Args: []string{"check"}, Timeout: 60 * time.Second},
			{Name: "test", Cmd: "cargo", Args: []string{"test"}, Timeout: 60 * time.Second},
		},
	},
	"python": {
		DetectFile: "pyproject.toml",
		Commands: []commandDef{
			{Name: "compile", Cmd: "python", Args: []string{"-m", "py_compile"}, Timeout: 30 * time.Second},
			{Name: "test", Cmd: "pytest", Args: []string{"--tb=short"}, Timeout: 60 * time.Second},
		},
	},
}

// DetectProjectType returns the project type detected at the given root,
// or an empty string if no known project type is found.
func DetectProjectType(projectRoot string) string {
	for typeName, def := range verifiers {
		path := filepath.Join(projectRoot, def.DetectFile)
		if _, err := os.Stat(path); err == nil {
			return typeName
		}
	}
	return ""
}

// ResolveVerifyRoot returns the directory where verification should run.
// If projectRoot itself contains a known marker, it's returned unchanged.
// Otherwise we scan one level of immediate children — common monorepo
// layout (e.g. proxy/go.mod, app/package.json) — and return the first
// child whose marker matches. Returns ("", "") if nothing is found.
//
// Stays one level deep on purpose: KISS, predictable, no surprises from
// vendored test fixtures buried five levels in.
func ResolveVerifyRoot(projectRoot string) (dir string, projectType string) {
	if t := DetectProjectType(projectRoot); t != "" {
		return projectRoot, t
	}

	entries, err := os.ReadDir(projectRoot)
	if err != nil {
		return "", ""
	}
	for _, entry := range entries {
		if !entry.IsDir() || strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		child := filepath.Join(projectRoot, entry.Name())
		if t := DetectProjectType(child); t != "" {
			return child, t
		}
	}
	return "", ""
}

// FindProjectRoot walks up from filePath looking for known project markers.
// Returns the first directory containing a marker, or empty string if none found.
func FindProjectRoot(filePath string) string {
	dir := filepath.Dir(filePath)

	for {
		for _, def := range verifiers {
			marker := filepath.Join(dir, def.DetectFile)
			if _, err := os.Stat(marker); err == nil {
				return dir
			}
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}

	return ""
}

// Verify runs verification commands for the detected project type at projectRoot.
// It bails on the first failure to avoid wasting time.
//
// For multi-module monorepos where projectRoot itself has no marker but its
// immediate children do (e.g. proxy/go.mod, app/package.json), verification
// runs against the first matching child.
func Verify(ctx context.Context, projectRoot string) ProjectVerification {
	timestamp := time.Now().UTC().Format(time.RFC3339)
	projectID := filepath.Base(projectRoot)

	verifyRoot, projectType := ResolveVerifyRoot(projectRoot)
	if projectType == "" {
		return ProjectVerification{
			ProjectID: projectID,
			Results:   nil,
			AllPassed: true,
			Timestamp: timestamp,
		}
	}

	def := verifiers[projectType]
	var results []Result

	for _, cmdDef := range def.Commands {
		result := runCommand(ctx, cmdDef, verifyRoot)
		results = append(results, result)

		if !result.Passed {
			break // bail on first failure
		}
	}

	allPassed := true
	for _, r := range results {
		if !r.Passed {
			allPassed = false
			break
		}
	}

	return ProjectVerification{
		ProjectID: projectID,
		Results:   results,
		AllPassed: allPassed,
		Timestamp: timestamp,
	}
}

// runCommand executes a single verification command with timeout.
func runCommand(ctx context.Context, cmdDef commandDef, cwd string) Result {
	cmdCtx, cancel := context.WithTimeout(ctx, cmdDef.Timeout)
	defer cancel()

	start := time.Now()

	cmd := exec.CommandContext(cmdCtx, cmdDef.Cmd, cmdDef.Args...)
	cmd.Dir = cwd
	cmd.Env = append(os.Environ(), "CI=1", "NO_COLOR=1")

	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = &buf

	err := cmd.Run()
	durationMs := time.Since(start).Milliseconds()

	output := buf.String()
	if len(output) > 500 {
		output = output[len(output)-500:]
	}

	if cmdCtx.Err() == context.DeadlineExceeded {
		return Result{
			Command:    cmdDef.Name,
			Passed:     false,
			ExitCode:   -1,
			Output:     fmt.Sprintf("[TIMEOUT after %s]\n%s", cmdDef.Timeout, output),
			DurationMs: durationMs,
		}
	}

	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = -1
			output = fmt.Sprintf("[EXEC ERROR] %s", err.Error())
		}
	}

	return Result{
		Command:    cmdDef.Name,
		Passed:     exitCode == 0,
		ExitCode:   exitCode,
		Output:     output,
		DurationMs: durationMs,
	}
}
