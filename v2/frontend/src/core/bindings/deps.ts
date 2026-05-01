// Phantom — Dependency-check Wails bindings (used by the deps-check
// onboarding phase to re-probe and override AI CLI binary paths).
// Author: Subash Karki

import type { HealthStatus } from '../types/provider';

const App = () => (window as any).go?.['app']?.App;

export async function recheckProviderHealth(name: string): Promise<HealthStatus | null> {
  try {
    return (await App()?.RecheckProviderHealth(name)) ?? null;
  } catch {
    return null;
  }
}

export async function setProviderBinaryPath(name: string, absPath: string): Promise<string> {
  try {
    await App()?.SetProviderBinaryPath(name, absPath);
    return '';
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export async function browseFile(title: string): Promise<string> {
  try {
    return (await App()?.BrowseFile(title)) ?? '';
  } catch {
    return '';
  }
}
