// Author: Subash Karki
package terminal

import (
	"embed"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// scriptFS holds the embedded shell integration scripts. They are written to a
// process-lifetime temp directory the first time integration is requested so
// the running shell can `source` them by absolute path.
//
//go:embed scripts/shell-integration.bash scripts/bash-rcfile-wrapper.bash scripts/shell-integration.zsh scripts/zdotdir-zshrc.zsh
var scriptFS embed.FS

var (
	scriptOnce sync.Once
	scriptDir  string
	scriptErr  error
)

// extractScripts materialises the embedded scripts into a temp directory once
// per process lifetime. The directory is left in place so child shells can
// re-source the files; the OS reaps it when the process exits.
func extractScripts() (string, error) {
	scriptOnce.Do(func() {
		dir, err := os.MkdirTemp("", "phantom-shell-integration-")
		if err != nil {
			scriptErr = fmt.Errorf("terminal/integration: mkdtemp: %w", err)
			return
		}

		// Map embedded path → destination filename. zsh requires a literal
		// `.zshrc` (or `.zshenv`, etc.) inside ZDOTDIR — without that exact
		// name it never sources our wrapper and the user's prompt
		// customisations are lost.
		entries := map[string]string{
			"scripts/shell-integration.bash":   "shell-integration.bash",
			"scripts/bash-rcfile-wrapper.bash": "bash-rcfile-wrapper.bash",
			"scripts/shell-integration.zsh":    "shell-integration.zsh",
			"scripts/zdotdir-zshrc.zsh":        ".zshrc",
		}
		for src, name := range entries {
			data, err := scriptFS.ReadFile(src)
			if err != nil {
				scriptErr = fmt.Errorf("terminal/integration: read %s: %w", src, err)
				return
			}
			dst := filepath.Join(dir, name)
			if err := os.WriteFile(dst, data, 0o644); err != nil {
				scriptErr = fmt.Errorf("terminal/integration: write %s: %w", dst, err)
				return
			}
		}

		scriptDir = dir
	})
	return scriptDir, scriptErr
}

// shellIntegrationConfig describes how to launch the shell so that our
// OSC 633 integration script is sourced after the user's normal startup files.
type shellIntegrationConfig struct {
	// args replace the default shell args (e.g. "--login").
	args []string
	// env entries to append to the PTY environment.
	env []string
}

// shellIntegrationFor returns the launch tweaks needed to enable shell
// integration for the given shell binary. If the shell isn't supported, the
// returned config is the zero value (caller should fall back to defaults).
//
// Returns ok=false when integration is disabled or unavailable (caller falls
// back to plain --login behaviour).
func shellIntegrationFor(shell string) (shellIntegrationConfig, bool) {
	// Hard opt-out via env.
	if os.Getenv("PHANTOM_SHELL_INTEGRATION") == "0" {
		return shellIntegrationConfig{}, false
	}

	dir, err := extractScripts()
	if err != nil {
		return shellIntegrationConfig{}, false
	}

	base := strings.ToLower(filepath.Base(shell))

	switch {
	case strings.Contains(base, "zsh"):
		userZdotDir := os.Getenv("ZDOTDIR")
		if userZdotDir == "" {
			userZdotDir = os.Getenv("HOME")
		}
		integrationScript := filepath.Join(dir, "shell-integration.zsh")
		return shellIntegrationConfig{
			// zsh launched as login shell still reads $ZDOTDIR/.zshrc when
			// interactive, which is exactly what we want.
			args: []string{"-l", "-i"},
			env: []string{
				"ZDOTDIR=" + dir,
				"USER_ZDOTDIR=" + userZdotDir,
				"PHANTOM_SHELL_INTEGRATION_SCRIPT=" + integrationScript,
			},
		}, true

	case strings.Contains(base, "bash"):
		integrationScript := filepath.Join(dir, "shell-integration.bash")
		rcfile := filepath.Join(dir, "bash-rcfile-wrapper.bash")
		return shellIntegrationConfig{
			// --rcfile only fires for interactive non-login shells. Drop --login
			// here so our wrapper definitely runs; the wrapper sources
			// /etc/profile + ~/.bash_profile manually to mimic login behaviour.
			args: []string{"--rcfile", rcfile, "-i"},
			env: []string{
				"PHANTOM_SHELL_INTEGRATION_SCRIPT=" + integrationScript,
			},
		}, true
	}

	// Unsupported shell (sh, fish, etc.) — caller falls back.
	return shellIntegrationConfig{}, false
}
