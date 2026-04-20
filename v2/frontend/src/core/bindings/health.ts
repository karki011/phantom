// Author: Subash Karki

import type { HealthResponse } from '../types';

const App = () => (window as any).go?.['app']?.App;

export async function healthCheck(): Promise<HealthResponse | null> {
  try {
    return (await App()?.HealthCheck()) ?? null;
  } catch {
    return null;
  }
}
