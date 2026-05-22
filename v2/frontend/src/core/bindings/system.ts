// Phantom — system-level Wails bindings (factory reset, etc.)
// Author: Subash Karki

import { App } from './_app';

export async function factoryResetLocalData(confirmation: string): Promise<string> {
  try {
    await App()?.FactoryResetLocalData(confirmation);
    return '';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}
