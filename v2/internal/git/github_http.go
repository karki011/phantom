// Author: Subash Karki
package git

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/log"
)

var (
	tokenOnce   sync.Once
	cachedToken string
	httpClient  *http.Client
)

// ghToken extracts and caches the GitHub token from gh CLI auth.
func ghToken() string {
	tokenOnce.Do(func() {
		cmd := exec.Command(ghBin(), "auth", "token")
		out, err := cmd.Output()
		if err != nil {
			log.Error("git/ghToken: failed to extract gh token", "err", err)
			return
		}
		cachedToken = strings.TrimSpace(string(out))
		httpClient = &http.Client{Timeout: 15 * time.Second}
	})
	return cachedToken
}

// resetGHToken clears the cached token so the next call re-extracts it.
// Used on 401 responses to handle token refresh.
func resetGHToken() {
	tokenOnce = sync.Once{}
	cachedToken = ""
	httpClient = nil
}

// resolveOwnerRepo gets the remote origin URL and splits it into owner and repo.
// Uses the existing parseOwnerRepo from github.go under the hood.
func resolveOwnerRepo(ctx context.Context, repoPath string) (string, string, error) {
	out, err := runGit(ctx, repoPath, "remote", "get-url", "origin")
	if err != nil {
		return "", "", fmt.Errorf("resolveOwnerRepo: %w", err)
	}
	slug := parseOwnerRepo(strings.TrimSpace(out)) // returns "owner/repo"
	if slug == "" {
		return "", "", fmt.Errorf("resolveOwnerRepo: cannot parse remote URL: %s", strings.TrimSpace(out))
	}
	parts := strings.SplitN(slug, "/", 2)
	if len(parts) != 2 {
		return "", "", fmt.Errorf("resolveOwnerRepo: unexpected slug format: %s", slug)
	}
	return parts[0], parts[1], nil
}

// ghAPIGet performs an authenticated GET to the GitHub REST API.
// path should NOT include the /repos/{owner}/{repo} prefix -- that's added automatically.
func ghAPIGet(ctx context.Context, owner, repo, path string) ([]byte, error) {
	token := ghToken()
	if token == "" {
		return nil, fmt.Errorf("ghAPIGet: no GitHub token available")
	}

	reqURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/%s", owner, repo, path)
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("ghAPIGet: %w", err)
	}
	req.Header.Set("Authorization", "token "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ghAPIGet: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("ghAPIGet: read body: %w", err)
	}

	if resp.StatusCode == 401 {
		// Token expired -- reset and retry once
		resetGHToken()
		return ghAPIGetOnce(ctx, owner, repo, path)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("ghAPIGet: %s returned %d: %s", path, resp.StatusCode, string(body))
	}

	return body, nil
}

// ghAPIGetOnce is the non-retrying inner call (prevents infinite retry loop).
func ghAPIGetOnce(ctx context.Context, owner, repo, path string) ([]byte, error) {
	token := ghToken()
	if token == "" {
		return nil, fmt.Errorf("ghAPIGetOnce: no GitHub token after refresh")
	}
	reqURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/%s", owner, repo, path)
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("ghAPIGetOnce: %w", err)
	}
	req.Header.Set("Authorization", "token "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ghAPIGetOnce: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("ghAPIGetOnce: read body: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("ghAPIGetOnce: %s returned %d: %s", path, resp.StatusCode, string(body))
	}
	return body, nil
}

// ghAPIPost performs an authenticated POST to the GitHub REST API.
func ghAPIPost(ctx context.Context, owner, repo, path string, body []byte) (int, error) {
	token := ghToken()
	if token == "" {
		return 0, fmt.Errorf("ghAPIPost: no GitHub token available")
	}

	reqURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/%s", owner, repo, path)
	req, err := http.NewRequestWithContext(ctx, "POST", reqURL, bytes.NewReader(body))
	if err != nil {
		return 0, fmt.Errorf("ghAPIPost: %w", err)
	}
	req.Header.Set("Authorization", "token "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	resp, err := httpClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("ghAPIPost: %w", err)
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	if resp.StatusCode == 401 {
		resetGHToken()
		return ghAPIPostOnce(ctx, owner, repo, path, body)
	}

	return resp.StatusCode, nil
}

// ghAPIPostOnce is the non-retrying inner POST call (prevents infinite retry loop).
func ghAPIPostOnce(ctx context.Context, owner, repo, path string, body []byte) (int, error) {
	token := ghToken()
	if token == "" {
		return 0, fmt.Errorf("ghAPIPostOnce: no GitHub token after refresh")
	}

	reqURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/%s", owner, repo, path)
	req, err := http.NewRequestWithContext(ctx, "POST", reqURL, bytes.NewReader(body))
	if err != nil {
		return 0, fmt.Errorf("ghAPIPostOnce: %w", err)
	}
	req.Header.Set("Authorization", "token "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	resp, err := httpClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("ghAPIPostOnce: %w", err)
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	return resp.StatusCode, nil
}
