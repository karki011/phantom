// Author: Subash Karki
package composer

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// Command represents a discovered slash command from a .md file with optional
// YAML frontmatter. Serialized to JSON for the Solid frontend.
type Command struct {
	Name         string `json:"name"`
	Description  string `json:"description"`
	ArgumentHint string `json:"argument_hint"`
	Model        string `json:"model"`
	AllowedTools string `json:"allowed_tools"`
	Source       string `json:"source"` // "project", "global", "plugin:<name>"
	FilePath     string `json:"file_path"`
	Body         string `json:"-"` // markdown body, not serialized to frontend
}

type commandFrontmatter struct {
	Description            string `yaml:"description"`
	ArgumentHint           string `yaml:"argument-hint"`
	Model                  string `yaml:"model"`
	AllowedTools           string `yaml:"allowed-tools"`
	HideFromSlashCommand   string `yaml:"hide-from-slash-command-tool"`
	DisableModelInvocation string `yaml:"disable-model-invocation"`
}

// DiscoverCommands scans project, global, and plugin directories for .md
// command files and returns them as a flat slice. The order is project →
// global → plugins so callers that want "first match wins" get project
// commands with highest priority.
func DiscoverCommands(cwd string) []Command {
	var cmds []Command

	home, _ := os.UserHomeDir()

	// 1. Project-level: <cwd>/.claude/commands/
	if cwd != "" {
		projectDir := filepath.Join(cwd, ".claude", "commands")
		cmds = append(cmds, scanCommandDir(projectDir, "project")...)
	}

	// 2. Global user-level: ~/.claude/commands/
	if home != "" {
		globalDir := filepath.Join(home, ".claude", "commands")
		cmds = append(cmds, scanCommandDir(globalDir, "global")...)
	}

	// 3. Installed plugins: ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/commands/
	if home != "" {
		pluginCache := filepath.Join(home, ".claude", "plugins", "cache")
		if info, err := os.Stat(pluginCache); err == nil && info.IsDir() {
			marketplaces, _ := os.ReadDir(pluginCache)
			for _, mp := range marketplaces {
				if !mp.IsDir() {
					continue
				}
				plugins, _ := os.ReadDir(filepath.Join(pluginCache, mp.Name()))
				for _, plug := range plugins {
					if !plug.IsDir() {
						continue
					}
					versions, _ := os.ReadDir(filepath.Join(pluginCache, mp.Name(), plug.Name()))
					for _, ver := range versions {
						if !ver.IsDir() {
							continue
						}
						cmdDir := filepath.Join(pluginCache, mp.Name(), plug.Name(), ver.Name(), "commands")
						source := "plugin:" + plug.Name()
						cmds = append(cmds, scanCommandDir(cmdDir, source)...)
					}
				}
			}
		}
	}

	return cmds
}

// scanCommandDir walks a directory tree looking for .md files and parses each
// into a Command. Returns nil when the directory doesn't exist.
func scanCommandDir(dir, source string) []Command {
	var cmds []Command
	if _, err := os.Stat(dir); err != nil {
		return nil
	}
	_ = filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(d.Name(), ".md") {
			return nil
		}
		cmd, parseErr := parseCommandFile(path, source, dir)
		if parseErr != nil {
			return nil
		}
		cmds = append(cmds, cmd)
		return nil
	})
	return cmds
}

// parseCommandFile reads a single .md command file, extracts optional YAML
// frontmatter, and returns a Command. Returns an error for hidden commands
// or unreadable files.
func parseCommandFile(path, source, baseDir string) (Command, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Command{}, err
	}
	content := string(data)

	// Derive name from relative path: commands/team/status.md → team:status
	rel, _ := filepath.Rel(baseDir, path)
	name := strings.TrimSuffix(rel, ".md")
	name = strings.ReplaceAll(name, string(filepath.Separator), ":")

	// For plugin commands, prefix with plugin name from source
	if strings.HasPrefix(source, "plugin:") {
		plugName := strings.TrimPrefix(source, "plugin:")
		if name != plugName && !strings.HasPrefix(name, plugName+":") {
			name = plugName + ":" + name
		}
	}

	var fm commandFrontmatter
	body := content

	// Parse YAML frontmatter between --- delimiters
	if strings.HasPrefix(strings.TrimSpace(content), "---") {
		parts := strings.SplitN(content, "---", 3)
		if len(parts) >= 3 {
			_ = yaml.Unmarshal([]byte(parts[1]), &fm)
			body = strings.TrimSpace(parts[2])
		}
	}

	if fm.HideFromSlashCommand == "true" {
		return Command{}, fmt.Errorf("hidden command")
	}

	return Command{
		Name:         name,
		Description:  fm.Description,
		ArgumentHint: fm.ArgumentHint,
		Model:        fm.Model,
		AllowedTools: fm.AllowedTools,
		Source:       source,
		FilePath:     path,
		Body:         body,
	}, nil
}

// ResolveCommand finds a command by name and returns its rendered body with
// $ARGUMENTS substituted. Returns empty strings if not found.
func ResolveCommand(cwd, name, arguments string) (string, string) {
	cmds := DiscoverCommands(cwd)
	for _, cmd := range cmds {
		if cmd.Name == name {
			body := cmd.Body
			body = strings.ReplaceAll(body, "$ARGUMENTS", arguments)
			// Resolve $CLAUDE_PLUGIN_ROOT for plugin commands
			if strings.HasPrefix(cmd.Source, "plugin:") {
				pluginRoot := filepath.Dir(filepath.Dir(cmd.FilePath))
				body = strings.ReplaceAll(body, "$CLAUDE_PLUGIN_ROOT", pluginRoot)
			}
			return body, cmd.Model
		}
	}
	return "", ""
}
