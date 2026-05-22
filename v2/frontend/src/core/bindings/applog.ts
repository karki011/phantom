// Author: Subash Karki

import { App } from './_app';

export async function getRecentAppLogs(maxLines = 50): Promise<string[]> {
  try {
    const lines = await App()?.GetRecentAppLogs(maxLines);
    return Array.isArray(lines) ? lines : [];
  } catch {
    return [];
  }
}
