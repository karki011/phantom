// Phantom — Content search bindings (Go backend wrappers)
// Author: Subash Karki

export interface SearchResult {
  filePath: string;
  lineNumber: number;
  lineContent: string;
  matchStart: number;
  matchEnd: number;
}

const App = () => (window as any).go?.['app']?.App;

/**
 * Search file contents within a workspace.
 * Uses git grep (respects .gitignore) or falls back to grep -rn.
 * @param workspaceId — workspace/worktree identifier
 * @param query — text to search for (case-insensitive, fixed string)
 * @param maxResults — cap on returned results (default 100)
 */
export const searchFileContents = async (
  workspaceId: string,
  query: string,
  maxResults = 100,
): Promise<SearchResult[]> => {
  try {
    const results = await App()?.SearchFileContents(workspaceId, query, maxResults);
    return Array.isArray(results) ? results : [];
  } catch (err) {
    console.error('[bindings] searchFileContents error:', err);
    return [];
  }
};
