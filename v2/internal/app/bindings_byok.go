// Wails bindings for BYOK (Bring Your Own Key) — user-supplied Anthropic
// API key, stored in macOS Keychain and injected as ANTHROPIC_API_KEY at
// `claude` CLI spawn time.
// Author: Subash Karki
package app

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/subashkarki/phantom-os-v2/internal/composer"
)

// SetAnthropicAPIKey stores the user's Anthropic API key in the macOS
// Keychain. Empty string is rejected (use ClearAnthropicAPIKey instead).
//
// Caution: this binding accepts a secret in plain text. The key only
// transits memory; it is not logged anywhere.
func (a *App) SetAnthropicAPIKey(key string) error {
	if err := composer.SetAnthropicAPIKey(key); err != nil {
		slog.Error("SetAnthropicAPIKey failed", "err", err) // err here is keychain error code, never the key itself
		return err
	}
	slog.Info("SetAnthropicAPIKey: BYOK enabled")
	return nil
}

// ClearAnthropicAPIKey removes the stored key. Idempotent. After this
// returns the user falls back to their claude subscription (no env var).
func (a *App) ClearAnthropicAPIKey() error {
	if err := composer.ClearAnthropicAPIKey(); err != nil {
		slog.Error("ClearAnthropicAPIKey failed", "err", err)
		return err
	}
	slog.Info("ClearAnthropicAPIKey: BYOK disabled")
	return nil
}

// HasAnthropicAPIKey reports whether a BYOK key is currently stored.
func (a *App) HasAnthropicAPIKey() bool {
	return composer.HasAnthropicAPIKey()
}

// TestAnthropicAPIKey runs a one-shot `claude -p "ping"` with the given
// candidate key in the env. Returns nil on apparent success, or an error
// describing why the key was rejected. The candidate key is never logged.
func (a *App) TestAnthropicAPIKey(key string) error {
	key = strings.TrimSpace(key)
	if key == "" {
		return fmt.Errorf("api key is empty")
	}

	cliPath, err := exec.LookPath("claude")
	if err != nil {
		return fmt.Errorf("claude CLI not found: %w", err)
	}

	ctx, cancel := context.WithTimeout(a.ctx, 20*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, cliPath, "-p", "ping", "--output-format", "text")
	cmd.Env = append(redactSafeEnv(os.Environ()), "ANTHROPIC_API_KEY="+key)

	out, runErr := cmd.CombinedOutput()
	if runErr == nil {
		return nil
	}
	// claude CLI surfaces 401 / "invalid api key" via stderr; bubble that up
	// without leaking the key itself.
	msg := strings.TrimSpace(string(out))
	if msg == "" {
		msg = runErr.Error()
	}
	if len(msg) > 240 {
		msg = msg[:240] + "..."
	}
	return fmt.Errorf("test failed: %s", msg)
}

// redactSafeEnv strips any pre-existing ANTHROPIC_API_KEY entry so the
// caller's value is the only one in the spawned process. Defensive — most
// users will not have the key in their shell env, but if they do we want
// to test the candidate, not whatever was already exported.
func redactSafeEnv(env []string) []string {
	out := make([]string, 0, len(env))
	for _, kv := range env {
		if strings.HasPrefix(kv, "ANTHROPIC_API_KEY=") {
			continue
		}
		out = append(out, kv)
	}
	return out
}
