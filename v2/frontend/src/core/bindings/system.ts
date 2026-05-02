// Phantom — system-level Wails bindings (factory reset, etc.)
// Author: Subash Karki

const App = () => (window as any).go?.['app']?.App;

export async function factoryResetLocalData(confirmation: string): Promise<string> {
  try {
    await App()?.FactoryResetLocalData(confirmation);
    return '';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
