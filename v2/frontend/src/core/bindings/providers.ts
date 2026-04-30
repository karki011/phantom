// Phantom — Provider Wails bindings
// Author: Subash Karki

import type { ProviderInfo, HealthStatus } from '../types/provider';

const App = () => (window as any).go?.['app']?.App;

export async function getProviders(): Promise<ProviderInfo[]> {
  try {
    return (await App()?.GetProviders()) ?? [];
  } catch {
    return [];
  }
}

export async function getProviderDetail(name: string): Promise<ProviderInfo | null> {
  try {
    return (await App()?.GetProviderDetail(name)) ?? null;
  } catch {
    return null;
  }
}

export async function setProviderEnabled(name: string, enabled: boolean): Promise<void> {
  try {
    await App()?.SetProviderEnabled(name, enabled);
  } catch {}
}

export async function setActiveProvider(name: string): Promise<void> {
  try {
    await App()?.SetActiveProvider(name);
  } catch {}
}

export async function testProvider(name: string): Promise<HealthStatus | null> {
  try {
    return (await App()?.TestProvider(name)) ?? null;
  } catch {
    return null;
  }
}

export async function autoDetectProviders(): Promise<Record<string, HealthStatus>> {
  try {
    return (await App()?.AutoDetectProviders()) ?? {};
  } catch {
    return {};
  }
}

export async function addCustomProvider(yaml: string): Promise<void> {
  try {
    await App()?.AddCustomProvider(yaml);
  } catch {}
}

export async function removeCustomProvider(name: string): Promise<void> {
  try {
    await App()?.RemoveCustomProvider(name);
  } catch {}
}

export async function resetProviderOverride(name: string): Promise<void> {
  try {
    await App()?.ResetProviderOverride(name);
  } catch {}
}

export async function getActiveProvider(): Promise<string> {
  try {
    return (await App()?.GetActiveProvider()) ?? '';
  } catch {
    return '';
  }
}

export async function updateProviderOverride(name: string, patch: Record<string, unknown>): Promise<void> {
  try {
    await App()?.UpdateProviderOverride(name, patch);
  } catch {}
}

export async function openProviderPath(name: string, pathKey: string): Promise<void> {
  try {
    await App()?.OpenProviderPath(name, pathKey);
  } catch {}
}
