// Phantom — BYOK bindings (user-supplied Anthropic API key in Keychain)
// Author: Subash Karki

import { App } from './_app';

export async function setAnthropicApiKey(key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await App()?.SetAnthropicAPIKey(key);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function clearAnthropicApiKey(): Promise<{ ok: boolean; error?: string }> {
  try {
    await App()?.ClearAnthropicAPIKey();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function hasAnthropicApiKey(): Promise<boolean> {
  try {
    return !!(await App()?.HasAnthropicAPIKey());
  } catch {
    return false;
  }
}

export async function testAnthropicApiKey(key: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await App()?.TestAnthropicAPIKey(key);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
