// Author: Subash Karki

import type { Workspace } from '../types';
import { normalize } from './_normalize';

const App = () => (window as any).go?.['app']?.App;

export async function getProjectBranches(projectId: string): Promise<string[]> {
  try {
    return (await App()?.GetProjectBranches(projectId)) ?? [];
  } catch {
    return [];
  }
}

export async function createWorktree(projectId: string, branch: string, baseBranch: string): Promise<Workspace | null> {
  try {
    const raw = (await App()?.CreateWorktree(projectId, branch, baseBranch)) ?? null;
    return raw ? normalize<Workspace>(raw) : null;
  } catch {
    return null;
  }
}

export async function removeWorktree(worktreeId: string): Promise<boolean> {
  try {
    await App()?.RemoveWorktree(worktreeId);
    return true;
  } catch {
    return false;
  }
}
