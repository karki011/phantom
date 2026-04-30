// Phantom — Settings > Providers section
// Author: Subash Karki

import { createSignal, createResource, For, Show } from 'solid-js';
import { Search, Plus, RefreshCw, CheckCircle } from 'lucide-solid';
import { vars } from '@/styles/theme.css';
import { buttonRecipe } from '@/styles/recipes.css';
import {
  getProviders,
  setProviderEnabled,
  setActiveProvider,
  testProvider,
  autoDetectProviders,
  addCustomProvider,
  removeCustomProvider,
  resetProviderOverride,
} from '@/core/bindings';
import { showWarningToast } from '@/shared/Toast/Toast';
import { refreshActiveProvider } from '@/core/signals/active-provider';
import { ProviderCard } from '@/shared/ProviderCard/ProviderCard';
import { AddProviderDialog } from '@/shared/AddProviderDialog/AddProviderDialog';
import type { ProviderInfo, HealthStatus } from '@/core/types/provider';
import * as styles from '../SettingsDialog.css';

export default function ProvidersSection() {
  const [cachedProviders, setCachedProviders] = createSignal<ProviderInfo[]>([]);
  const [initialLoad, setInitialLoad] = createSignal(true);
  const [addDialogOpen, setAddDialogOpen] = createSignal(false);
  const [scanning, setScanning] = createSignal(false);
  const [detected, setDetected] = createSignal<Record<string, HealthStatus> | null>(null);

  const fetchProviders = async () => {
    const result = await getProviders();
    setCachedProviders(result);
    setInitialLoad(false);
    return result;
  };

  const [providers, { refetch: rawRefetch }] = createResource(fetchProviders);

  const refetch = () => {
    rawRefetch();
    refreshActiveProvider();
  };

  const handleToggle = async (name: string, enabled: boolean) => {
    await setProviderEnabled(name, enabled);
    refetch();
  };

  const handleSetActive = async (name: string) => {
    await setActiveProvider(name);
    refetch();
  };

  const handleTest = (_name: string) => {
    // Test is handled inside ProviderCard — no refetch needed
  };

  const handleReset = async (name: string) => {
    await resetProviderOverride(name);
    refetch();
  };

  const handleRemove = async (name: string) => {
    await removeCustomProvider(name);
    refetch();
  };

  const handleAddCustom = async (yaml: string) => {
    await addCustomProvider(yaml);
    refetch();
  };

  const handleScan = async () => {
    setScanning(true);
    try {
      const results = await autoDetectProviders();
      setDetected(results);
    } catch {
      showWarningToast('Scan Failed', 'Could not detect AI tools');
    } finally {
      setScanning(false);
    }
  };

  const handleEnableAll = async () => {
    const detectedMap = detected();
    if (!detectedMap) return;
    for (const name of Object.keys(detectedMap)) {
      await setProviderEnabled(name, true);
    }
    setDetected(null);
    refetch();
  };

  const dismissDetected = () => setDetected(null);

  return (
    <div class={styles.sectionRoot}>
      {/* Auto-detect banner */}
      <Show when={detected()}>
        {(detectedProviders) => (
          <div class={styles.detectBanner}>
            <div class={styles.detectBannerTitle}>
              <Search size={16} />
              <span class={styles.detectBannerLabel}>
                Detected AI Tools
              </span>
            </div>

            <div class={styles.detectProviderList}>
              <For each={Object.entries(detectedProviders())}>
                {([name, health]) => (
                  <div class={styles.detectProviderRow}>
                    <CheckCircle size={14} color={health.installed ? vars.color.success : vars.color.textDisabled} />
                    {name}
                    <Show when={health.version}>
                      <span class={styles.detectProviderVersion}>v{health.version}</span>
                    </Show>
                  </div>
                )}
              </For>
            </div>

            <div class={styles.detectButtonRow}>
              <button
                type="button"
                class={buttonRecipe({ variant: 'primary', size: 'sm' })}
                onClick={handleEnableAll}
              >
                Enable All
              </button>
              <button
                type="button"
                class={buttonRecipe({ variant: 'ghost', size: 'sm' })}
                onClick={dismissDetected}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </Show>

      {/* Default AI Provider selector */}
      <div class={styles.settingGroup}>
        <span class={styles.settingLabel}>Default AI Provider</span>
        <div class={styles.settingDescription}>
          Used for new sessions, commit messages, and PR generation. Other enabled providers are monitored for sessions but don't power app actions.
        </div>
        <div class={styles.defaultProviderRow}>
          <Show when={cachedProviders().length}>
            <For each={cachedProviders().filter((p) => p.enabled && p.installed)}>
              {(provider: ProviderInfo) => (
                <button
                  type="button"
                  class={styles.providerSelectorButton}
                  data-active={provider.is_active}
                  onClick={() => handleSetActive(provider.name)}
                >
                  <span class={styles.providerSelectorDot} />
                  {provider.display_name || provider.name}
                  <Show when={provider.version}>
                    <span class={styles.providerSelectorVersion}>
                      v{provider.version}
                    </span>
                  </Show>
                </button>
              )}
            </For>
          </Show>
        </div>
      </div>

      {/* Provider list header */}
      <div class={styles.settingGroup}>
        <div class={styles.providerHeaderRow}>
          <span class={styles.settingLabel}>All Providers</span>
          <div class={styles.providerHeaderButtons}>
            <button
              type="button"
              class={buttonRecipe({ variant: 'outline', size: 'sm' })}
              onClick={handleScan}
              disabled={scanning()}
            >
              <RefreshCw size={12} />
              {scanning() ? 'Scanning...' : 'Scan'}
            </button>
            <button
              type="button"
              class={buttonRecipe({ variant: 'primary', size: 'sm' })}
              onClick={() => setAddDialogOpen(true)}
            >
              <Plus size={12} />
              Add Provider
            </button>
          </div>
        </div>
        <div class={styles.settingDescription}>
          Enable to monitor sessions. Toggle controls visibility, not which provider powers the app.
        </div>
      </div>

      {/* Provider list */}
      <div class={styles.providerListContainer}>
        <Show when={!initialLoad()} fallback={
          <For each={[1, 2, 3]}>
            {() => (
              <div class={styles.skeletonCard}>
                <div class={styles.skeletonRow}>
                  <div class={styles.skeletonAvatar} />
                  <div class={styles.skeletonTextContainer}>
                    <div class={styles.skeletonName} />
                    <div class={styles.skeletonDesc} />
                  </div>
                  <div class={styles.skeletonToggle} />
                </div>
              </div>
            )}
          </For>
        }>
          <Show when={cachedProviders().length} fallback={
            <div class={styles.providerEmptyState}>
              No providers configured. Click "Scan" to auto-detect or "Add Provider" to add one manually.
            </div>
          }>
            <For each={cachedProviders()}>
              {(provider: ProviderInfo) => (
                <ProviderCard
                  provider={provider}
                  isActive={provider.is_active}
                  onToggle={handleToggle}
                  onSetActive={handleSetActive}
                  onTest={handleTest}
                  onUpdate={refetch}
                  onReset={provider.has_override ? handleReset : undefined}
                  onRemove={!provider.is_builtin ? handleRemove : undefined}
                />
              )}
            </For>
          </Show>
        </Show>
      </div>

      {/* Add provider dialog */}
      <AddProviderDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onAdd={handleAddCustom}
      />
    </div>
  );
}
