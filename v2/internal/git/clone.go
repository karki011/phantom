// Author: Subash Karki
package git

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
)

// InitRepo runs `git init` at the given path.
func InitRepo(ctx context.Context, path string) error {
	cmd := exec.CommandContext(ctx, "git", "init", path)
	out, err := cmd.CombinedOutput()
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if msg != "" {
			return fmt.Errorf("init %s: %w: %s", path, err, msg)
		}
		return fmt.Errorf("init %s: %w", path, err)
	}
	return nil
}

// Clone clones a git repository from url into destPath.
// It runs in the OS temp dir so it is not bound to any specific repo.
func Clone(ctx context.Context, url, destPath string) error {
	// Apply default timeout via context if none exists.
	if _, ok := ctx.Deadline(); !ok {
		// Clone can take longer than the standard 30s; use exec directly with context.
	}

	cmd := exec.CommandContext(ctx, "git", "clone", url, destPath)
	out, err := cmd.CombinedOutput()
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if msg != "" {
			return fmt.Errorf("clone %s: %w: %s", url, err, msg)
		}
		return fmt.Errorf("clone %s: %w", url, err)
	}
	return nil
}
