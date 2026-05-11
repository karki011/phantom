// Author: Subash Karki
//
// CLIHaikuClient calls `claude -p --model haiku` for task assessment,
// reusing the user's existing Claude CLI authentication.
package assess

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"

	"github.com/subashkarki/phantom-os-v2/internal/composer"
)

// CLIHaikuClient implements HaikuClient using the claude CLI.
type CLIHaikuClient struct {
	binaryPath string
	env        []string
}

// NewCLIHaikuClient creates a client that calls claude CLI for Haiku.
// Returns nil if the claude binary cannot be found.
func NewCLIHaikuClient() *CLIHaikuClient {
	bin, err := composer.DetectClaudeBinary()
	if err != nil {
		return nil
	}
	return &CLIHaikuClient{
		binaryPath: bin,
		env:        composer.AugmentedEnv(),
	}
}

// Call runs claude -p --model haiku with the given system+user prompt.
// Returns the text response and dummy token counts (CLI doesn't report tokens).
func (c *CLIHaikuClient) Call(ctx context.Context, system, userPrompt string) (string, int, int, error) {
	if c == nil {
		return "", 0, 0, fmt.Errorf("CLI client not initialized")
	}

	// Build the combined prompt with system instruction
	combinedPrompt := userPrompt

	args := []string{
		"-p",
		"--model", "claude-haiku-4-5-20251001",
		"--output-format", "text",
		"--max-turns", "1",
	}

	if system != "" {
		args = append(args, "--append-system-prompt", system)
	}

	cmd := exec.CommandContext(ctx, c.binaryPath, args...)
	cmd.Env = c.env
	cmd.Dir = homeDir()
	cmd.Stdin = strings.NewReader(combinedPrompt)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return "", 0, 0, fmt.Errorf("claude haiku CLI: %w (stderr: %s)", err, strings.TrimSpace(stderr.String()))
	}

	text := strings.TrimSpace(stdout.String())
	if text == "" {
		return "", 0, 0, fmt.Errorf("claude haiku CLI returned empty response")
	}

	// CLI doesn't report token counts — return 0s
	return text, 0, 0, nil
}

func homeDir() string {
	if h := os.Getenv("HOME"); h != "" {
		return h
	}
	return "/"
}
