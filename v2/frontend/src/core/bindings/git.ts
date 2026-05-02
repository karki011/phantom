// Author: Subash Karki

import type { Workspace, RepoStatus, FileStatus, CommitInfo, FileEntry, PrStatus, CiRun, CheckAnnotation, RepoMergeConfig, MergeMethod } from '../types';
import { normalize } from './_normalize';

const App = () => (window as any).go?.['app']?.App;

export async function getProjectBranches(projectId: string): Promise<string[]> {
  try {
    return (await App()?.GetProjectBranches(projectId)) ?? [];
  } catch {
    return [];
  }
}

export async function createWorktree(
  projectId: string,
  branch: string,
  baseBranch: string,
  ticketUrl: string = '',
): Promise<Workspace | null> {
  try {
    const raw = (await App()?.CreateWorktree(projectId, branch, baseBranch, ticketUrl)) ?? null;
    return raw ? normalize<Workspace>(raw) : null;
  } catch {
    return null;
  }
}

export async function removeWorktree(worktreeId: string, worktreePath: string): Promise<boolean> {
  try {
    await App()?.RemoveWorktree(worktreeId, worktreePath);
    return true;
  } catch (err) {
    console.error('[bindings] removeWorktree error:', err);
    return false;
  }
}

export async function gitFetch(projectId: string): Promise<boolean> {
  try { await App()?.GitFetch(projectId); return true; } catch { return false; }
}

export async function gitPull(workspaceId: string): Promise<boolean> {
  try { await App()?.GitPull(workspaceId); return true; } catch { return false; }
}

export async function gitPush(workspaceId: string): Promise<boolean> {
  try { await App()?.GitPush(workspaceId); return true; } catch { return false; }
}

export async function gitCheckoutBranch(projectId: string, branch: string): Promise<boolean> {
  try { await App()?.GitCheckoutBranch(projectId, branch); return true; } catch { return false; }
}

export async function gitStage(workspaceId: string, paths: string[]): Promise<boolean> {
  try { await App()?.GitStage(workspaceId, paths); return true; } catch { return false; }
}

export async function gitStageAll(workspaceId: string): Promise<boolean> {
  try { await App()?.GitStageAll(workspaceId); return true; } catch { return false; }
}

export async function gitUnstage(workspaceId: string, paths: string[]): Promise<boolean> {
  try { await App()?.GitUnstage(workspaceId, paths); return true; } catch { return false; }
}

export async function gitCommit(workspaceId: string, message: string): Promise<boolean> {
  try { await App()?.GitCommit(workspaceId, message); return true; } catch { return false; }
}

export async function gitDiscard(workspaceId: string, paths: string[]): Promise<boolean> {
  try { await App()?.GitDiscard(workspaceId, paths); return true; } catch { return false; }
}

export async function renameWorktree(worktreeId: string, newName: string): Promise<boolean> {
  try { await App()?.RenameWorktree(worktreeId, newName); return true; } catch { return false; }
}

export async function getWorkspaceStatus(workspaceId: string): Promise<RepoStatus | null> {
  try { return (await App()?.GetWorkspaceStatus(workspaceId)) ?? null; } catch { return null; }
}

export async function refreshWorkspaceStatus(workspaceId: string): Promise<RepoStatus | null> {
  try { return (await App()?.RefreshWorkspaceStatus(workspaceId)) ?? null; } catch { return null; }
}

export async function getWorkspaceChanges(workspaceId: string): Promise<FileStatus[]> {
  try { return (await App()?.GetWorkspaceChanges(workspaceId)) ?? []; } catch { return []; }
}

export async function getWorkspaceCommitLog(workspaceId: string, limit: number = 50): Promise<CommitInfo[]> {
  try { return (await App()?.GetWorkspaceCommitLog(workspaceId, limit)) ?? []; } catch { return []; }
}

export async function listWorkspaceFiles(workspaceId: string): Promise<FileEntry[]> {
  try { return (await App()?.ListWorkspaceFiles(workspaceId)) ?? []; } catch { return []; }
}

export async function listWorkspaceDir(workspaceId: string, relativePath: string): Promise<FileEntry[]> {
  try { return (await App()?.ListWorkspaceDir(workspaceId, relativePath)) ?? []; } catch { return []; }
}

export async function searchWorkspaceFiles(workspaceId: string, query: string): Promise<FileEntry[]> {
  try { return (await App()?.SearchWorkspaceFiles(workspaceId, query)) ?? []; } catch { return []; }
}

export async function getPrStatus(worktreeId: string): Promise<PrStatus | null> {
  try { return (await App()?.GetPrStatusForWorkspace(worktreeId)) ?? null; } catch { return null; }
}

export async function getCiRuns(worktreeId: string): Promise<CiRun[] | null> {
  try { return (await App()?.GetCiRunsForWorkspace(worktreeId)) ?? null; } catch { return null; }
}

export async function getCiRunsForBranch(worktreeId: string, branch: string): Promise<CiRun[]> {
  try { return (await App()?.GetCiRunsForBranch(worktreeId, branch)) ?? []; } catch { return []; }
}

export async function getCheckAnnotations(worktreeId: string, checkName: string): Promise<CheckAnnotation[]> {
  try { return (await App()?.GetCheckAnnotations(worktreeId, checkName)) ?? []; } catch { return []; }
}

export async function getFailedSteps(worktreeId: string, checkURL: string): Promise<import('../types').FailedStep[]> {
  try { return (await App()?.GetFailedSteps(worktreeId, checkURL)) ?? []; } catch { return []; }
}

export async function createPrWithAI(worktreeId: string, draft: boolean = false): Promise<PrStatus | null> {
  try { return (await App()?.CreatePrWithAIForWorkspace(worktreeId, draft)) ?? null; } catch { return null; }
}

export async function isGhCliAvailable(): Promise<boolean> {
  try { return (await App()?.IsGhAvailable()) ?? false; } catch { return false; }
}

export async function getBranchCommits(worktreeId: string, branchOnly: boolean): Promise<CommitInfo[]> {
  try { return (await App()?.GetBranchCommits(worktreeId, branchOnly)) ?? []; } catch { return []; }
}

export async function listOpenPrs(worktreeId: string, limit: number = 5): Promise<PrStatus[]> {
  try { return (await App()?.ListOpenPrsForWorkspace(worktreeId, limit)) ?? []; } catch { return []; }
}

export async function watchWorktree(worktreeId: string): Promise<void> {
  try { await App()?.WatchWorktree(worktreeId); } catch {}
}

// ── Ship-It (merge) ────────────────────────────────────────────────────────

export async function getRepoMergeConfig(worktreeId: string): Promise<RepoMergeConfig | null> {
  try { return (await App()?.GetRepoMergeConfigForWorkspace(worktreeId)) ?? null; } catch { return null; }
}

/**
 * Run `gh pr merge` for the workspace's branch.
 * Returns "" on success, or an error message.
 */
export async function mergePr(
  worktreeId: string,
  method: MergeMethod,
  autoMerge: boolean,
  deleteBranch: boolean,
): Promise<string> {
  try { return (await App()?.MergePrForWorkspace(worktreeId, method, autoMerge, deleteBranch)) ?? ''; }
  catch (err) { return err instanceof Error ? err.message : 'merge failed'; }
}

export async function disableAutoMerge(worktreeId: string): Promise<string> {
  try { return (await App()?.DisableAutoMergeForWorkspace(worktreeId)) ?? ''; }
  catch (err) { return err instanceof Error ? err.message : 'disable auto-merge failed'; }
}

export async function postMergeCleanup(worktreeId: string): Promise<string> {
  try { return (await App()?.PostMergeCleanupForWorkspace(worktreeId)) ?? ''; }
  catch (err) { return err instanceof Error ? err.message : 'cleanup failed'; }
}
