// Package git — repo-level merge config (cached).
//
// Author: Subash Karki
package git

import (
	"bytes"
	"context"
	"encoding/json"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/log"
)

const repoMergeConfigTTL = 10 * time.Minute

type cachedRepoConfig struct {
	cfg RepoMergeConfig
	at  time.Time
}

var (
	repoCfgMu    sync.Mutex
	repoCfgCache = map[string]cachedRepoConfig{}
)

// GetRepoMergeConfig returns repo-level merge settings for the repo at repoPath.
// Cached for 10 minutes per resolved owner/repo. Falls back to safe defaults on failure.
func GetRepoMergeConfig(ctx context.Context, repoPath string) RepoMergeConfig {
	remote, err := GetRemoteURL(ctx, repoPath)
	if err != nil {
		log.Info("git/GetRepoMergeConfig: remote lookup failed", "err", err)
		return defaultRepoMergeConfig()
	}
	ownerRepo := parseOwnerRepo(remote)
	if ownerRepo == "" {
		return defaultRepoMergeConfig()
	}

	repoCfgMu.Lock()
	if entry, ok := repoCfgCache[ownerRepo]; ok && time.Since(entry.at) < repoMergeConfigTTL {
		cfg := entry.cfg
		repoCfgMu.Unlock()
		return cfg
	}
	repoCfgMu.Unlock()

	cfg := fetchRepoMergeConfig(ctx, repoPath, ownerRepo)

	repoCfgMu.Lock()
	repoCfgCache[ownerRepo] = cachedRepoConfig{cfg: cfg, at: time.Now()}
	repoCfgMu.Unlock()

	return cfg
}

// defaultRepoMergeConfig is what we surface when we can't reach the API.
// Errs on the side of "merging is allowed" so the FE doesn't grey out the
// Ship-It button unnecessarily.
func defaultRepoMergeConfig() RepoMergeConfig {
	return RepoMergeConfig{
		MergeCommitAllowed:       true,
		SquashMergeAllowed:       true,
		RebaseMergeAllowed:       true,
		DeleteBranchOnMerge:      false,
		ViewerDefaultMergeMethod: "SQUASH",
		HasMergeQueue:            false,
	}
}

func fetchRepoMergeConfig(ctx context.Context, repoPath, ownerRepo string) RepoMergeConfig {
	// `gh repo view --json` doesn't currently expose viewerDefaultMergeMethod or mergeQueue.
	// Use a single GraphQL call to fetch everything.
	parts := strings.SplitN(ownerRepo, "/", 2)
	if len(parts) != 2 {
		return defaultRepoMergeConfig()
	}
	owner, name := parts[0], parts[1]

	query := `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){mergeCommitAllowed squashMergeAllowed rebaseMergeAllowed deleteBranchOnMerge viewerDefaultMergeMethod mergeQueue{id}}}`

	cmd := exec.CommandContext(ctx, "gh", "api", "graphql",
		"-f", "query="+query,
		"-F", "owner="+owner,
		"-F", "name="+name,
	)
	cmd.Dir = repoPath
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		log.Info("git/fetchRepoMergeConfig: graphql failed",
			"err", err, "stderr", strings.TrimSpace(stderr.String()))
		return defaultRepoMergeConfig()
	}

	var resp struct {
		Data struct {
			Repository struct {
				MergeCommitAllowed       bool   `json:"mergeCommitAllowed"`
				SquashMergeAllowed       bool   `json:"squashMergeAllowed"`
				RebaseMergeAllowed       bool   `json:"rebaseMergeAllowed"`
				DeleteBranchOnMerge      bool   `json:"deleteBranchOnMerge"`
				ViewerDefaultMergeMethod string `json:"viewerDefaultMergeMethod"`
				MergeQueue               *struct {
					ID string `json:"id"`
				} `json:"mergeQueue"`
			} `json:"repository"`
		} `json:"data"`
	}
	if err := json.Unmarshal(stdout.Bytes(), &resp); err != nil {
		log.Error("git/fetchRepoMergeConfig: json parse failed", "err", err)
		return defaultRepoMergeConfig()
	}
	r := resp.Data.Repository
	method := r.ViewerDefaultMergeMethod
	if method == "" {
		method = "SQUASH"
	}
	cfg := RepoMergeConfig{
		MergeCommitAllowed:       r.MergeCommitAllowed,
		SquashMergeAllowed:       r.SquashMergeAllowed,
		RebaseMergeAllowed:       r.RebaseMergeAllowed,
		DeleteBranchOnMerge:      r.DeleteBranchOnMerge,
		ViewerDefaultMergeMethod: method,
		HasMergeQueue:            r.MergeQueue != nil && r.MergeQueue.ID != "",
	}
	log.Info("git/fetchRepoMergeConfig: success",
		"ownerRepo", ownerRepo, "default", cfg.ViewerDefaultMergeMethod, "queue", cfg.HasMergeQueue)
	return cfg
}

