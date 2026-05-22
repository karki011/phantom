// Author: Subash Karki

import { App } from './_app';

export async function getPreference(key: string): Promise<string> {
  try {
    return (await App()?.GetPreference(key)) ?? '';
  } catch {
    return '';
  }
}

export async function setPreference(key: string, value: string): Promise<void> {
  try {
    await App()?.SetPreference(key, value);
  } catch {}
}

export async function getGitUserName(): Promise<string> {
  try {
    return (await App()?.GetGitUserName()) ?? '';
  } catch {
    return '';
  }
}
