// PhantomOS v2 — Editor file I/O bindings
// Author: Subash Karki
//
// Provides ReadFileContents and WriteFileContents for the Monaco editor.
// All paths are resolved via resolveWorkspacePath and validated to prevent
// path traversal attacks.

package app

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/charmbracelet/log"
	"github.com/subashkarki/phantom-os-v2/internal/git"
)

// ReadFileContents reads a text file from the workspace and returns its content.
// The relativePath is resolved against the workspace root and validated.
func (a *App) ReadFileContents(workspaceId, relativePath string) (string, error) {
	log.Info("app/ReadFileContents: called", "workspaceId", workspaceId, "relativePath", relativePath)

	repoPath, err := a.resolveWorkspacePath(workspaceId)
	if err != nil {
		log.Error("app/ReadFileContents: resolve failed", "workspaceId", workspaceId, "err", err)
		return "", err
	}

	// Security: validate path does not escape workspace root
	absPath := filepath.Join(repoPath, filepath.Clean(relativePath))
	if !strings.HasPrefix(absPath, filepath.Clean(repoPath)+string(filepath.Separator)) &&
		absPath != filepath.Clean(repoPath) {
		log.Warn("app/ReadFileContents: path traversal attempt", "relativePath", relativePath)
		return "", fmt.Errorf("path traversal attempt: %s", relativePath)
	}

	data, err := os.ReadFile(absPath)
	if err != nil {
		log.Error("app/ReadFileContents: read failed", "absPath", absPath, "err", err)
		return "", err
	}

	log.Info("app/ReadFileContents: success", "absPath", absPath, "bytes", len(data))
	return string(data), nil
}

// WriteFileContents writes content to a file in the workspace.
// The relativePath is resolved against the workspace root and validated.
func (a *App) WriteFileContents(workspaceId, relativePath, content string) error {
	log.Info("app/WriteFileContents: called", "workspaceId", workspaceId, "relativePath", relativePath)

	repoPath, err := a.resolveWorkspacePath(workspaceId)
	if err != nil {
		log.Error("app/WriteFileContents: resolve failed", "workspaceId", workspaceId, "err", err)
		return err
	}

	// Security: validate path does not escape workspace root
	absPath := filepath.Join(repoPath, filepath.Clean(relativePath))
	if !strings.HasPrefix(absPath, filepath.Clean(repoPath)+string(filepath.Separator)) &&
		absPath != filepath.Clean(repoPath) {
		log.Warn("app/WriteFileContents: path traversal attempt", "relativePath", relativePath)
		return fmt.Errorf("path traversal attempt: %s", relativePath)
	}

	// Ensure parent directory exists (handle new files in subdirectories)
	dir := filepath.Dir(absPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Error("app/WriteFileContents: mkdir failed", "dir", dir, "err", err)
		return err
	}

	if err := os.WriteFile(absPath, []byte(content), 0644); err != nil {
		log.Error("app/WriteFileContents: write failed", "absPath", absPath, "err", err)
		return err
	}

	log.Info("app/WriteFileContents: success", "absPath", absPath, "bytes", len(content))
	return nil
}

// CreateFile creates an empty file in the workspace.
// The relativePath is resolved against the workspace root and validated.
func (a *App) CreateFile(workspaceId, relativePath string) error {
	log.Info("app/CreateFile: called", "workspaceId", workspaceId, "relativePath", relativePath)

	repoPath, err := a.resolveWorkspacePath(workspaceId)
	if err != nil {
		log.Error("app/CreateFile: resolve failed", "workspaceId", workspaceId, "err", err)
		return err
	}

	// Security: validate path does not escape workspace root
	absPath := filepath.Join(repoPath, filepath.Clean(relativePath))
	if !strings.HasPrefix(absPath, filepath.Clean(repoPath)+string(filepath.Separator)) &&
		absPath != filepath.Clean(repoPath) {
		log.Warn("app/CreateFile: path traversal attempt", "relativePath", relativePath)
		return fmt.Errorf("path traversal attempt: %s", relativePath)
	}

	// Ensure parent directory exists
	dir := filepath.Dir(absPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		log.Error("app/CreateFile: mkdir failed", "dir", dir, "err", err)
		return err
	}

	if err := os.WriteFile(absPath, []byte{}, 0644); err != nil {
		log.Error("app/CreateFile: write failed", "absPath", absPath, "err", err)
		return err
	}

	log.Info("app/CreateFile: success", "absPath", absPath)
	return nil
}

// CreateFolder creates a directory in the workspace.
// The relativePath is resolved against the workspace root and validated.
func (a *App) CreateFolder(workspaceId, relativePath string) error {
	log.Info("app/CreateFolder: called", "workspaceId", workspaceId, "relativePath", relativePath)

	repoPath, err := a.resolveWorkspacePath(workspaceId)
	if err != nil {
		log.Error("app/CreateFolder: resolve failed", "workspaceId", workspaceId, "err", err)
		return err
	}

	// Security: validate path does not escape workspace root
	absPath := filepath.Join(repoPath, filepath.Clean(relativePath))
	if !strings.HasPrefix(absPath, filepath.Clean(repoPath)+string(filepath.Separator)) &&
		absPath != filepath.Clean(repoPath) {
		log.Warn("app/CreateFolder: path traversal attempt", "relativePath", relativePath)
		return fmt.Errorf("path traversal attempt: %s", relativePath)
	}

	if err := os.MkdirAll(absPath, 0755); err != nil {
		log.Error("app/CreateFolder: mkdir failed", "absPath", absPath, "err", err)
		return err
	}

	log.Info("app/CreateFolder: success", "absPath", absPath)
	return nil
}

// DeleteFile deletes a file or empty directory from the workspace.
// Uses os.Remove (not os.RemoveAll) to prevent accidental recursive deletion.
func (a *App) DeleteFile(workspaceId, relativePath string) error {
	log.Info("app/DeleteFile: called", "workspaceId", workspaceId, "relativePath", relativePath)

	repoPath, err := a.resolveWorkspacePath(workspaceId)
	if err != nil {
		log.Error("app/DeleteFile: resolve failed", "workspaceId", workspaceId, "err", err)
		return err
	}

	// Security: validate path does not escape workspace root
	absPath := filepath.Join(repoPath, filepath.Clean(relativePath))
	if !strings.HasPrefix(absPath, filepath.Clean(repoPath)+string(filepath.Separator)) &&
		absPath != filepath.Clean(repoPath) {
		log.Warn("app/DeleteFile: path traversal attempt", "relativePath", relativePath)
		return fmt.Errorf("path traversal attempt: %s", relativePath)
	}

	if err := os.Remove(absPath); err != nil {
		log.Error("app/DeleteFile: remove failed", "absPath", absPath, "err", err)
		return err
	}

	log.Info("app/DeleteFile: success", "absPath", absPath)
	return nil
}

// GetWorkspaceBlame returns per-line blame for a file in a workspace.
// Resolves the workspace ID to a repo path, then delegates to git.Blame.
func (a *App) GetWorkspaceBlame(workspaceId, relativePath string) ([]git.BlameLine, error) {
	log.Info("app/GetWorkspaceBlame: called", "workspaceId", workspaceId, "relativePath", relativePath)

	repoPath, err := a.resolveWorkspacePath(workspaceId)
	if err != nil {
		log.Error("app/GetWorkspaceBlame: resolve failed", "workspaceId", workspaceId, "err", err)
		return nil, err
	}

	lines, err := git.Blame(a.ctx, repoPath, relativePath)
	if err != nil {
		log.Error("app/GetWorkspaceBlame: blame failed", "relativePath", relativePath, "err", err)
		return nil, fmt.Errorf("git blame %s failed: %w", relativePath, err)
	}
	if lines == nil {
		return []git.BlameLine{}, nil
	}

	log.Info("app/GetWorkspaceBlame: success", "relativePath", relativePath, "lines", len(lines))
	return lines, nil
}

// GetFileAtRevision returns the content of a file at a specific git revision.
// Used by the diff viewer to show HEAD vs working copy.
func (a *App) GetFileAtRevision(workspaceId, relativePath, revision string) (string, error) {
	log.Info("app/GetFileAtRevision: called", "workspaceId", workspaceId, "relativePath", relativePath, "revision", revision)

	repoPath, err := a.resolveWorkspacePath(workspaceId)
	if err != nil {
		log.Error("app/GetFileAtRevision: resolve failed", "workspaceId", workspaceId, "err", err)
		return "", err
	}

	content, err := git.FileAtRevision(a.ctx, repoPath, relativePath, revision)
	if err != nil {
		log.Error("app/GetFileAtRevision: git show failed", "relativePath", relativePath, "revision", revision, "err", err)
		return "", fmt.Errorf("git show %s:%s failed: %w", revision, relativePath, err)
	}

	log.Info("app/GetFileAtRevision: success", "relativePath", relativePath, "revision", revision, "bytes", len(content))
	return content, nil
}
