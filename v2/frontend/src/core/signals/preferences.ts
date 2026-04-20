// Author: Subash Karki

import { createSignal } from 'solid-js';
import { getPreference, setPreference } from '../bindings';

const [prefsMap, setPrefsMap] = createSignal<Record<string, string>>({});
let initialized = false;

export async function bootstrapPreferences(): Promise<void> {
  if (initialized) return;
  initialized = true;
}

export function getPref(key: string): string {
  return prefsMap()[key] ?? '';
}

export async function setPref(key: string, value: string): Promise<void> {
  setPrefsMap((prev) => ({ ...prev, [key]: value }));
  await setPreference(key, value);
}

export async function loadPref(key: string): Promise<string> {
  const value = await getPreference(key);
  if (value) {
    setPrefsMap((prev) => ({ ...prev, [key]: value }));
  }
  return value;
}

export { prefsMap };
