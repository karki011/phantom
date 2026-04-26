// Package git — retrieve file content at a specific revision.
//
// Author: Subash Karki
package git

import "context"

// FileAtRevision returns the content of a file at a given git revision
// (e.g. "HEAD", a commit SHA, "HEAD~1"). Wraps `git show <rev>:<path>`.
func FileAtRevision(ctx context.Context, repoPath, filePath, revision string) (string, error) {
	ref := revision + ":" + filePath
	return runGit(ctx, repoPath, "show", ref)
}
