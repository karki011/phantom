// Author: Subash Karki

const App = () => (window as any).go?.['app']?.App;

export async function getRecentAppLogs(maxLines = 50): Promise<string[]> {
  try {
    const lines = await App()?.GetRecentAppLogs(maxLines);
    return Array.isArray(lines) ? lines : [];
  } catch {
    return [];
  }
}
