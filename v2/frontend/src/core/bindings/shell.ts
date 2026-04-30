// Phantom — Shell operation bindings (Finder, default app)
// Author: Subash Karki

const App = () => (window as any).go?.['app']?.App;

export async function revealInFinder(path: string): Promise<boolean> {
  try { await App()?.RevealInFinder(path); return true; } catch { return false; }
}

export async function openInFinder(path: string): Promise<boolean> {
  try { await App()?.OpenInFinder(path); return true; } catch { return false; }
}

export async function openInDefaultApp(path: string): Promise<boolean> {
  try { await App()?.OpenInDefaultApp(path); return true; } catch { return false; }
}

export function openURL(url: string): void {
  try { App()?.OpenURL(url); } catch { window.open(url, '_blank'); }
}
