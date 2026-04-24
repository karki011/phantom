// embed.go embeds default ward rules and installs them to the user's wards directory on startup.
// Author: Subash Karki
package safety

import (
	"embed"
	"io/fs"
	"log"
	"os"
	"path/filepath"
)

//go:embed defaults/*.yaml
var defaultRules embed.FS

// InstallDefaults copies embedded default ward rules into wardsDir.
// Existing files with the same name are NOT overwritten so user edits survive.
func InstallDefaults(wardsDir string) {
	entries, err := fs.ReadDir(defaultRules, "defaults")
	if err != nil {
		log.Printf("safety: read embedded defaults: %v", err)
		return
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		dst := filepath.Join(wardsDir, entry.Name())
		if _, err := os.Stat(dst); err == nil {
			continue
		}
		data, err := defaultRules.ReadFile("defaults/" + entry.Name())
		if err != nil {
			log.Printf("safety: read embedded %s: %v", entry.Name(), err)
			continue
		}
		if err := os.WriteFile(dst, data, 0o644); err != nil {
			log.Printf("safety: install default %s: %v", entry.Name(), err)
		}
	}
}
