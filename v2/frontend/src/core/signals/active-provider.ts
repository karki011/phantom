// Active provider signal — loaded at startup, refreshed on provider change.
// Author: Subash Karki

import { createSignal } from 'solid-js';
import { getProviders } from '@/core/bindings';
import type { ProviderInfo } from '@/core/types/provider';

const [activeProvider, setActiveProvider] = createSignal<ProviderInfo | null>(null);

export { activeProvider };

export const activeProviderCommand = () => {
  const prov = activeProvider();
  return prov?.config?.commands.new_session ?? 'claude --dangerously-skip-permissions';
};

export const activeProviderLabel = () => {
  const prov = activeProvider();
  return prov?.display_name ?? 'Claude';
};

export const loadActiveProvider = async () => {
  try {
    const providers = await getProviders();
    const active = providers.find((p) => p.is_active) ?? providers[0] ?? null;
    setActiveProvider(active);
  } catch {
    // Keep default
  }
};

export const refreshActiveProvider = loadActiveProvider;
