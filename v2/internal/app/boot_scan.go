// Wails binding for Phantom boot screen system scan.
// Author: Subash Karki
package app

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/provider"
)

// semverPattern extracts a semantic version (e.g. 2.92.0) from a tool's
// --version output. Used to normalize multi-line / branded version strings
// like "gh version 2.92.0 (2026-04-28)\nhttps://github.com/..." into "2.92.0".
var semverPattern = regexp.MustCompile(`(\d+\.\d+\.\d+)`)

// extractSemver returns the first semantic version found in the input,
// or the trimmed first line if no semver matches.
func extractSemver(raw string) string {
	if raw == "" {
		return ""
	}
	if m := semverPattern.FindString(raw); m != "" {
		return m
	}
	if i := strings.IndexByte(raw, '\n'); i >= 0 {
		return strings.TrimSpace(raw[:i])
	}
	return strings.TrimSpace(raw)
}

// AgentStatus holds detection results for a single AI coding agent.
type AgentStatus struct {
	Name         string `json:"name"`
	Installed    bool   `json:"installed"`
	Version      string `json:"version,omitempty"`
	SessionCount int    `json:"sessionCount"`
	Detail       string `json:"detail,omitempty"`
}

// BootScanResult holds real system health data surfaced during the boot sequence.
type BootScanResult struct {
	Operator       string        `json:"operator"`
	NodeVersion    string        `json:"nodeVersion"`
	BunVersion     string        `json:"bunVersion"`
	ClaudeSessions int           `json:"claudeSessions"`
	ClaudeProjects int           `json:"claudeProjects"`
	MCPChannels    int           `json:"mcpChannels"`
	GithubAuth     bool          `json:"githubAuth"`
	AWSConfigured  bool          `json:"awsConfigured"`
	GCPConfigured  bool          `json:"gcpConfigured"`
	GitInstalled   bool          `json:"gitInstalled"`
	GitVersion     string        `json:"gitVersion,omitempty"`
	GhInstalled    bool          `json:"ghInstalled"`
	GhVersion      string        `json:"ghVersion,omitempty"`
	GhPath         string        `json:"ghPath,omitempty"`
	Agents         []AgentStatus `json:"agents"`
}

// versionWithTimeout runs a command with a 2-second timeout and returns stdout trimmed.
func versionWithTimeout(name string, args ...string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, name, args...).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func lookBin(name string, candidates ...string) (string, bool) {
	return provider.ResolveBin(name, candidates)
}

// countDirs returns the number of subdirectories inside dir (0 on error).
func countDirs(dir string) int {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0
	}
	n := 0
	for _, e := range entries {
		if e.IsDir() {
			n++
		}
	}
	return n
}

// detectAgents concurrently probes for 10 AI coding tools and returns only installed ones.
// The provider registry is used to detect providers that have been registered
// (currently Claude Code); remaining agents use direct filesystem/binary probes.
func detectAgents(home string, provReg *provider.Registry) []AgentStatus {
	results := make([]AgentStatus, 10)
	var wg sync.WaitGroup
	wg.Add(10)

	// 0 — Claude Code (via provider registry when available, else binary probe)
	go func() {
		defer wg.Done()
		a := AgentStatus{Name: "Claude Code"}
		if provReg != nil {
			if prov, ok := provReg.Get("claude"); ok {
				health := prov.HealthCheck(context.Background())
				a.Installed = health.Installed
				a.Version = health.Version
				if a.Installed {
					n := countDirs(prov.ConversationsDir())
					a.SessionCount = n
					a.Detail = fmt.Sprintf("%d projects", n)
				}
				results[0] = a
				return
			}
		}
		// Fallback: direct binary probe with PATH + common install locations
		if bin, ok := lookBin("claude",
			"~/.local/bin/claude",
			"~/.claude/local/claude",
			"/opt/homebrew/bin/claude",
			"/usr/local/bin/claude",
		); ok {
			a.Installed = true
			a.Version = versionWithTimeout(bin, "--version")
			n := countDirs(filepath.Join(home, ".claude", "projects"))
			a.SessionCount = n
			a.Detail = fmt.Sprintf("%d projects", n)
		}
		results[0] = a
	}()

	// 1 — Codex CLI
	go func() {
		defer wg.Done()
		a := AgentStatus{Name: "Codex CLI"}
		if bin, ok := lookBin("codex",
			"/opt/homebrew/bin/codex",
			"/usr/local/bin/codex",
			"~/.local/bin/codex",
		); ok {
			a.Installed = true
			a.Version = versionWithTimeout(bin, "--version")
			a.Detail = "installed"
		} else if _, err := os.Stat(filepath.Join(home, ".codex")); err == nil {
			a.Installed = true
			a.Detail = "installed"
		}
		results[1] = a
	}()

	// 2 — Aider
	go func() {
		defer wg.Done()
		a := AgentStatus{Name: "Aider"}
		if _, err := exec.LookPath("aider"); err == nil {
			a.Installed = true
			a.Detail = "installed"
		} else if _, err := os.Stat(filepath.Join(home, ".aider")); err == nil {
			a.Installed = true
			a.Detail = "installed"
		}
		results[2] = a
	}()

	// 3 — Ollama
	go func() {
		defer wg.Done()
		a := AgentStatus{Name: "Ollama"}
		if _, err := exec.LookPath("ollama"); err == nil {
			a.Installed = true
			modelsDir := filepath.Join(home, ".ollama", "models", "manifests", "registry.ollama.ai", "library")
			n := countDirs(modelsDir)
			a.SessionCount = n
			a.Detail = fmt.Sprintf("%d models", n)
		}
		results[3] = a
	}()

	// 4 — Gemini CLI
	go func() {
		defer wg.Done()
		a := AgentStatus{Name: "Gemini CLI"}
		if bin, ok := lookBin("gemini",
			"/opt/homebrew/bin/gemini",
			"/usr/local/bin/gemini",
			"~/.local/bin/gemini",
		); ok {
			a.Installed = true
			a.Version = versionWithTimeout(bin, "--version")
			a.Detail = "installed"
		} else if _, err := os.Stat(filepath.Join(home, ".gemini")); err == nil {
			a.Installed = true
			a.Detail = "installed"
		}
		results[4] = a
	}()

	// 5 — GitHub Copilot (only if the copilot extension is actually installed)
	go func() {
		defer wg.Done()
		a := AgentStatus{Name: "GitHub Copilot"}
		if bin, ok := lookBin("gh",
			"/opt/homebrew/bin/gh",
			"/usr/local/bin/gh",
		); ok {
			ver := versionWithTimeout(bin, "copilot", "--version")
			if ver != "" {
				a.Installed = true
				a.Version = ver
				a.Detail = ver
			}
		}
		results[5] = a
	}()

	// 6 — Amazon Q
	go func() {
		defer wg.Done()
		a := AgentStatus{Name: "Amazon Q"}
		if _, err := exec.LookPath("q"); err == nil {
			a.Installed = true
			a.Detail = "installed"
		} else if _, err := os.Stat(filepath.Join(home, ".aws", "amazonq")); err == nil {
			a.Installed = true
			a.Detail = "installed"
		}
		results[6] = a
	}()

	// 7 — Cursor (macOS app bundle only)
	go func() {
		defer wg.Done()
		a := AgentStatus{Name: "Cursor"}
		if runtime.GOOS == "darwin" {
			if _, err := os.Stat("/Applications/Cursor.app"); err == nil {
				a.Installed = true
				a.Detail = "installed"
			}
		}
		results[7] = a
	}()

	// 8 — Continue.dev
	go func() {
		defer wg.Done()
		a := AgentStatus{Name: "Continue.dev"}
		if _, err := os.Stat(filepath.Join(home, ".continue")); err == nil {
			a.Installed = true
			a.Detail = "installed"
		}
		results[8] = a
	}()

	// 9 — Windsurf
	go func() {
		defer wg.Done()
		a := AgentStatus{Name: "Windsurf"}
		if _, err := exec.LookPath("windsurf"); err == nil {
			a.Installed = true
			a.Detail = "installed"
		} else if runtime.GOOS == "darwin" {
			if _, err := os.Stat("/Applications/Windsurf.app"); err == nil {
				a.Installed = true
				a.Detail = "installed"
			}
		}
		results[9] = a
	}()

	wg.Wait()

	installed := make([]AgentStatus, 0, 10)
	for _, a := range results {
		if a.Installed {
			installed = append(installed, a)
		}
	}
	return installed
}

// BootScan collects real system data for the Phantom boot screen.
// Called from the frontend via: (window as any).go?.['app']?.App?.BootScan()
func (a *App) BootScan() (*BootScanResult, error) {
	home, _ := os.UserHomeDir()
	r := &BootScanResult{}

	gitBin, gitOK := lookBin("git",
		"/opt/homebrew/bin/git",
		"/usr/local/bin/git",
		"/usr/bin/git",
	)
	if gitOK {
		r.GitInstalled = true
		r.GitVersion = extractSemver(versionWithTimeout(gitBin, "--version"))
		if out, err := exec.Command(gitBin, "config", "--global", "user.name").Output(); err == nil {
			r.Operator = strings.TrimSpace(string(out))
		}
	}

	if bin, ok := lookBin("gh",
		"/opt/homebrew/bin/gh",
		"/usr/local/bin/gh",
	); ok {
		r.GhInstalled = true
		r.GhPath = bin
		r.GhVersion = extractSemver(versionWithTimeout(bin, "--version"))
	}

	if bin, ok := lookBin("node",
		"/opt/homebrew/bin/node",
		"/usr/local/bin/node",
	); ok {
		if out, err := exec.Command(bin, "--version").Output(); err == nil {
			r.NodeVersion = strings.TrimSpace(strings.TrimPrefix(string(out), "v"))
		}
	}

	if bin, ok := lookBin("bun",
		"/opt/homebrew/bin/bun",
		"/usr/local/bin/bun",
		"~/.bun/bin/bun",
	); ok {
		if out, err := exec.Command(bin, "--version").Output(); err == nil {
			r.BunVersion = strings.TrimSpace(string(out))
		}
	}

	r.Agents = detectAgents(home, a.provRegistry)
	// Backward compat: populate legacy Claude fields
	for _, ag := range r.Agents {
		if ag.Name == "Claude Code" {
			r.ClaudeProjects = ag.SessionCount
			r.ClaudeSessions = ag.SessionCount
			break
		}
	}

	// Use provider's settings path when available, fall back to hardcoded path.
	settingsPath := filepath.Join(home, ".claude", "settings.json")
	if a.prov != nil {
		if sf := a.prov.SettingsFile(); sf != "" {
			settingsPath = sf
		}
	}
	if data, err := os.ReadFile(settingsPath); err == nil {
		var settings map[string]any
		if json.Unmarshal(data, &settings) == nil {
			if mcp, ok := settings["mcpServers"].(map[string]any); ok {
				r.MCPChannels = len(mcp)
			}
		}
	}

	ghPath := filepath.Join(home, ".config", "gh", "hosts.yml")
	if _, err := os.Stat(ghPath); err == nil {
		r.GithubAuth = true
	}

	awsPath := filepath.Join(home, ".aws", "credentials")
	if _, err := os.Stat(awsPath); err == nil {
		r.AWSConfigured = true
	}

	gcpDir := filepath.Join(home, ".config", "gcloud")
	if _, err := os.Stat(gcpDir); err == nil {
		r.GCPConfigured = true
	}

	return r, nil
}
