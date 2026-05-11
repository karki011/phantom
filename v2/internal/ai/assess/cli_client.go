// Author: Subash Karki
//
// CLIHaikuClient calls `claude -p --model haiku` for task assessment,
// reusing the user's existing Claude CLI authentication.
package assess

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"strings"
	"time"

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

	// Combine system + user into a single prompt passed as argument
	// (avoids stdin piping issues in subprocess)
	fullPrompt := userPrompt
	if system != "" {
		fullPrompt = system + "\n\n" + userPrompt
	}

	args := []string{
		"-p",
		fullPrompt,
		"--model", "claude-haiku-4-5-20251001",
		"--output-format", "text",
		"--max-turns", "1",
	}

	slog.Info("haiku CLI: spawning subprocess",
		"binary", c.binaryPath,
		"dir", homeDir(),
		"prompt_len", len(fullPrompt),
		"args_count", len(args),
		"ctx_deadline", ctxDeadlineStr(ctx),
	)

	cmd := exec.CommandContext(ctx, c.binaryPath, args...)
	cmd.Env = c.env
	cmd.Dir = homeDir()

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	start := time.Now()
	err := cmd.Run()
	elapsed := time.Since(start)

	slog.Info("haiku CLI: subprocess finished",
		"elapsed_ms", elapsed.Milliseconds(),
		"exit_err", err,
		"stdout_len", stdout.Len(),
		"stderr_len", stderr.Len(),
		"stderr_preview", cliTruncate(stderr.String(), 200),
		"stdout_preview", cliTruncate(stdout.String(), 200),
		"pid", cmd.ProcessState.Pid(),
		"exit_code", cmd.ProcessState.ExitCode(),
	)

	if err != nil {
		return "", 0, 0, fmt.Errorf("claude haiku CLI: %w (stderr: %s)", err, strings.TrimSpace(stderr.String()))
	}

	text := strings.TrimSpace(stdout.String())
	if text == "" {
		return "", 0, 0, fmt.Errorf("claude haiku CLI returned empty response")
	}

	return text, 0, 0, nil
}

func homeDir() string {
	if h := os.Getenv("HOME"); h != "" {
		return h
	}
	return "/"
}

func ctxDeadlineStr(ctx context.Context) string {
	if dl, ok := ctx.Deadline(); ok {
		return fmt.Sprintf("%.1fs from now", time.Until(dl).Seconds())
	}
	return "none"
}

func cliTruncate(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
