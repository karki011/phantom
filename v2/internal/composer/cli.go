// Author: Subash Karki
//
// cli.go implements CLI version detection and validation for the Claude Code
// binary. It ensures the installed CLI meets minimum version requirements
// before spawning sessions, preventing protocol drift between Phantom and
// the Claude CLI.
package composer

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	// MinCLIVersion is the minimum Claude CLI version that Phantom supports.
	MinCLIVersion = "1.0.0"

	// KnownGoodCLIVersion is the last version verified compatible in CI.
	KnownGoodCLIVersion = "1.0.33"

	// cliVersionTimeout is how long we wait for `claude --version` to respond.
	cliVersionTimeout = 2 * time.Second
)

// candidatePaths returns the ordered list of directories to probe for the
// `claude` binary, after PATH lookup fails.
var candidatePaths = []string{
	filepath.Join(homeDir(), ".local", "bin"),
	filepath.Join(homeDir(), ".claude", "bin"),
	"/opt/homebrew/bin",
	"/usr/local/bin",
}

// semverRe matches a leading semver triple (e.g. "1.0.33" from "1.0.33-beta.1").
var semverRe = regexp.MustCompile(`(\d+)\.(\d+)\.(\d+)`)

// homeDir returns the user's home directory, falling back to "/tmp" if
// os.UserHomeDir fails (should never happen on macOS/Linux).
func homeDir() string {
	h, err := os.UserHomeDir()
	if err != nil {
		return "/tmp"
	}
	return h
}

// DetectClaudeBinary probes for the `claude` binary in PATH and well-known
// install locations. Returns the absolute path to the first executable found.
func DetectClaudeBinary() (string, error) {
	// 1. Try PATH first.
	if p, err := exec.LookPath("claude"); err == nil {
		return p, nil
	}

	// 2. Probe well-known locations.
	for _, dir := range candidatePaths {
		candidate := filepath.Join(dir, "claude")
		info, err := os.Stat(candidate)
		if err != nil {
			continue
		}
		// Check it's a file and at least user-executable.
		if !info.IsDir() && info.Mode()&0111 != 0 {
			return candidate, nil
		}
	}

	return "", fmt.Errorf(
		"claude CLI not found — install it via https://docs.anthropic.com/en/docs/claude-code/overview "+
			"or ensure it is on your PATH",
	)
}

// AugmentedEnv returns the current environment with candidatePaths prepended
// to PATH. Production .app bundles get a minimal PATH from macOS; this
// ensures the claude subprocess (and its children) can find node, bun, git,
// and other tools that live in user-local or Homebrew directories.
func AugmentedEnv() []string {
	env := os.Environ()
	extra := strings.Join(candidatePaths, ":")
	for i, e := range env {
		if strings.HasPrefix(e, "PATH=") {
			env[i] = "PATH=" + extra + ":" + e[5:]
			return env
		}
	}
	return append(env, "PATH="+extra+":/usr/bin:/bin:/usr/sbin:/sbin")
}

// GetCLIVersion runs `claude --version` and extracts the semver string.
// It enforces a 2-second timeout to avoid hanging on broken installs.
func GetCLIVersion(binaryPath string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), cliVersionTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, binaryPath, "--version")
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return "", fmt.Errorf("claude --version timed out after %s", cliVersionTimeout)
		}
		return "", fmt.Errorf("claude --version failed: %w (stderr: %s)", err, strings.TrimSpace(stderr.String()))
	}

	output := strings.TrimSpace(stdout.String())
	match := semverRe.FindString(output)
	if match == "" {
		return "", fmt.Errorf("could not parse version from claude --version output: %q", output)
	}
	return match, nil
}

// CheckCLIVersion validates that `version` meets the MinCLIVersion requirement.
// Returns nil if acceptable, or a descriptive error with upgrade instructions.
func CheckCLIVersion(version string) error {
	cur, err := parseSemver(version)
	if err != nil {
		return fmt.Errorf("invalid CLI version %q: %w", version, err)
	}

	min, err := parseSemver(MinCLIVersion)
	if err != nil {
		// This would be a bug in our constant — panic-worthy but we return
		// an error to keep the function pure.
		return fmt.Errorf("invalid MinCLIVersion constant %q: %w", MinCLIVersion, err)
	}

	if compareSemver(cur, min) < 0 {
		return fmt.Errorf(
			"Claude Code version %s is too old (minimum %s). Update: claude update",
			version, MinCLIVersion,
		)
	}
	return nil
}

// ValidateCLI is the one-shot validation entry point. It detects the binary,
// reads its version, and checks compatibility. Returns the binary path and
// version on success.
func ValidateCLI() (binaryPath string, version string, err error) {
	binaryPath, err = DetectClaudeBinary()
	if err != nil {
		return "", "", err
	}

	version, err = GetCLIVersion(binaryPath)
	if err != nil {
		return binaryPath, "", err
	}

	if err = CheckCLIVersion(version); err != nil {
		return binaryPath, version, err
	}

	return binaryPath, version, nil
}

// ---------- semver helpers ----------

type semver struct {
	Major int
	Minor int
	Patch int
}

// parseSemver extracts major.minor.patch from a version string.
func parseSemver(v string) (semver, error) {
	match := semverRe.FindStringSubmatch(v)
	if len(match) < 4 {
		return semver{}, fmt.Errorf("not a valid semver: %q", v)
	}

	major, _ := strconv.Atoi(match[1])
	minor, _ := strconv.Atoi(match[2])
	patch, _ := strconv.Atoi(match[3])

	return semver{Major: major, Minor: minor, Patch: patch}, nil
}

// compareSemver returns -1, 0, or +1.
func compareSemver(a, b semver) int {
	if a.Major != b.Major {
		return intCmp(a.Major, b.Major)
	}
	if a.Minor != b.Minor {
		return intCmp(a.Minor, b.Minor)
	}
	return intCmp(a.Patch, b.Patch)
}

func intCmp(a, b int) int {
	if a < b {
		return -1
	}
	if a > b {
		return 1
	}
	return 0
}
