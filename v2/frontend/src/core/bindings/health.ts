// Author: Subash Karki

import type { HealthResponse } from '../types';
import { App } from './_app';

export async function healthCheck(): Promise<HealthResponse | null> {
  try {
    return (await App()?.HealthCheck()) ?? null;
  } catch {
    return null;
  }
}
