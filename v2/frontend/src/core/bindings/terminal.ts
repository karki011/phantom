// Author: Subash Karki

const App = () => (window as any).go?.['app']?.App;

export async function createTerminal(id: string, cwd: string, cols: number, rows: number): Promise<void> {
  try {
    await App()?.CreateTerminal(id, cwd, cols, rows);
  } catch {}
}

export async function writeTerminal(id: string, data: string): Promise<void> {
  try {
    await App()?.WriteTerminal(id, data);
  } catch {}
}

export async function resizeTerminal(id: string, cols: number, rows: number): Promise<void> {
  try {
    await App()?.ResizeTerminal(id, cols, rows);
  } catch {}
}

export async function destroyTerminal(id: string): Promise<void> {
  try {
    await App()?.DestroyTerminal(id);
  } catch {}
}

export async function getTerminalScrollback(id: string): Promise<string> {
  try {
    return (await App()?.GetTerminalScrollback(id)) ?? '';
  } catch {
    return '';
  }
}
