// Phantom — Plan file scanner binding
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

/**
 * Read a plan markdown file by absolute path. Errors propagate so callers
 * can surface them — unlike readFileContents which silently returns ''.
 */
export const readPlanFile = async (absPath: string): Promise<string> => {
  const result = await App()?.ReadPlanFile(absPath);
  return result ?? '';
};

/**
 * Write a plan markdown file by absolute path. Errors propagate.
 */
export const writePlanFile = async (absPath: string, content: string): Promise<void> => {
  await App()?.WritePlanFile(absPath, content);
};
