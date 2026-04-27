// PhantomOS v2 — Plan file scanner binding
// Calls the Go backend GetPlansForWorktree to discover plan .md files on disk.
// Author: Subash Karki

import { normalize } from './_normalize';

const App = () => (window as any).go?.['app']?.App;

export interface PlanFile {
  filePath: string;
  title: string;
  totalTasks: number;
  doneTasks: number;
  modifiedAt: number;
  age: string;
}

export async function getPlansForWorktree(
  worktreePath: string,
  repoPath: string,
  branchName: string,
): Promise<PlanFile[]> {
  try {
    const raw =
      (await App()?.GetPlansForWorktree(worktreePath, repoPath, branchName)) ?? [];
    return normalize<PlanFile[]>(raw);
  } catch {
    return [];
  }
}
