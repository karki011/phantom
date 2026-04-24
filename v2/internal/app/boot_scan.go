// Wails binding for PhantomOS boot screen system scan.
// Author: Subash Karki
package app

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// BootScanResult holds real system health data surfaced during the boot sequence.
type BootScanResult struct {
	Operator       string `json:"operator"`
	NodeVersion    string `json:"nodeVersion"`
	BunVersion     string `json:"bunVersion"`
	ClaudeSessions int    `json:"claudeSessions"`
	ClaudeProjects int    `json:"claudeProjects"`
	MCPChannels    int    `json:"mcpChannels"`
	GithubAuth     bool   `json:"githubAuth"`
	AWSConfigured  bool   `json:"awsConfigured"`
	GCPConfigured  bool   `json:"gcpConfigured"`
}

// BootScan collects real system data for the PhantomOS boot screen.
// Called from the frontend via: (window as any).go?.['app']?.App?.BootScan()
func (a *App) BootScan() (*BootScanResult, error) {
	home, _ := os.UserHomeDir()
	r := &BootScanResult{}

	if out, err := exec.Command("git", "config", "--global", "user.name").Output(); err == nil {
		r.Operator = strings.TrimSpace(string(out))
	}

	if out, err := exec.Command("node", "--version").Output(); err == nil {
		r.NodeVersion = strings.TrimSpace(strings.TrimPrefix(string(out), "v"))
	}

	if out, err := exec.Command("bun", "--version").Output(); err == nil {
		r.BunVersion = strings.TrimSpace(string(out))
	}

	claudeDir := filepath.Join(home, ".claude", "projects")
	if entries, err := os.ReadDir(claudeDir); err == nil {
		for _, e := range entries {
			if e.IsDir() {
				r.ClaudeProjects++
			}
		}
		r.ClaudeSessions = r.ClaudeProjects
	}

	settingsPath := filepath.Join(home, ".claude", "settings.json")
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
