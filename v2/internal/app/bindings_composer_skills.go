// Wails binding: list available Claude skills from .claude/skills/.
// Author: Subash Karki
package app

import (
	"os"
	"path/filepath"
	"strings"
)

// ComposerListSkills scans <cwd>/.claude/skills/ for skill directories
// containing a SKILL.md file, parses YAML frontmatter for name/description,
// and returns the list. Returns an empty slice (never nil) on any error so
// the frontend always gets a JSON array.
func (a *App) ComposerListSkills(cwd string) []map[string]interface{} {
	skills := []map[string]interface{}{}

	skillsDir := filepath.Join(cwd, ".claude", "skills")
	entries, err := os.ReadDir(skillsDir)
	if err != nil {
		return skills
	}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		skillPath := filepath.Join(skillsDir, entry.Name(), "SKILL.md")
		content, err := os.ReadFile(skillPath)
		if err != nil {
			continue
		}

		// Parse YAML frontmatter (--- delimited).
		text := string(content)
		name := entry.Name()
		description := ""

		if strings.HasPrefix(text, "---") {
			endIdx := strings.Index(text[3:], "---")
			if endIdx > 0 {
				frontmatter := text[3 : 3+endIdx]
				for _, line := range strings.Split(frontmatter, "\n") {
					line = strings.TrimSpace(line)
					if strings.HasPrefix(line, "name:") {
						name = strings.TrimSpace(strings.TrimPrefix(line, "name:"))
					} else if strings.HasPrefix(line, "description:") {
						description = strings.TrimSpace(strings.TrimPrefix(line, "description:"))
					}
				}
			}
		}

		skills = append(skills, map[string]interface{}{
			"id":          entry.Name(),
			"name":        name,
			"description": description,
			"path":        skillPath,
		})
	}

	return skills
}
