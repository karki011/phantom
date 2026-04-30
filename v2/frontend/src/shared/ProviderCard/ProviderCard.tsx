// Phantom — Provider card component
// Author: Subash Karki

import { createSignal, Show, For } from 'solid-js';
import { Switch as KobalteSwitch } from '@kobalte/core/switch';
import { ChevronDown, ChevronUp, Zap, RotateCcw, Trash2, Activity, FolderOpen, Save, CheckCircle, XCircle } from 'lucide-solid';
import { buttonRecipe } from '@/styles/recipes.css';
import * as settingsStyles from '@/shared/SettingsDialog/SettingsDialog.css';
import { openProviderPath, updateProviderOverride, testProvider } from '@/core/bindings/providers';
import type { ProviderInfo, HealthStatus } from '@/core/types/provider';
import * as styles from './ProviderCard.css';

const pathLabels: Record<string, string> = {
  sessions: 'Sessions',
  conversations: 'Conversations',
  todos: 'Todos',
  tasks: 'Tasks',
  context: 'Context',
  settings: 'Settings',
};

const PROVIDER_ICONS: Record<string, string> = {
  anthropic: '\u{1F7E3}',
  openai: '\u{1F7E2}',
  google: '\u{1F535}',
  gemini: '\u{1F535}',
  codex: '\u{1F7E2}',
};

const getProviderIcon = (icon: string): string =>
  PROVIDER_ICONS[icon.toLowerCase()] ?? '⚪';

interface ProviderCardProps {
  provider: ProviderInfo;
  isActive: boolean;
  onToggle: (name: string, enabled: boolean) => void;
  onSetActive: (name: string) => void;
  onTest: (name: string) => void;
  onUpdate?: () => void;
  onReset?: (name: string) => void;
  onRemove?: (name: string) => void;
}

export function ProviderCard(props: ProviderCardProps) {
  const [expanded, setExpanded] = createSignal(false);
  const [testing, setTesting] = createSignal(false);
  const [testResult, setTestResult] = createSignal<HealthStatus | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [editResume, setEditResume] = createSignal('');
  const [editNewSession, setEditNewSession] = createSignal('');
  const [editAiGenerate, setEditAiGenerate] = createSignal('');
  const [dirty, setDirty] = createSignal(false);
  const [editPricing, setEditPricing] = createSignal<Record<string, { input_per_m: number; output_per_m: number }>>({});
  const [pricingDirty, setPricingDirty] = createSignal(false);

  const initPricingEdits = () => {
    const tiers = props.provider.config?.pricing?.tiers;
    if (tiers) {
      const copy: Record<string, { input_per_m: number; output_per_m: number }> = {};
      for (const [name, tier] of Object.entries(tiers)) {
        copy[name] = { input_per_m: tier.input_per_m, output_per_m: tier.output_per_m };
      }
      setEditPricing(copy);
      setPricingDirty(false);
    }
  };

  const updatePricingTier = (tierName: string, field: 'input_per_m' | 'output_per_m', value: number) => {
    setEditPricing((prev) => ({ ...prev, [tierName]: { ...prev[tierName], [field]: value } }));
    setPricingDirty(true);
  };

  const handleSavePricing = async () => {
    setSaving(true);
    const tiers: Record<string, unknown> = {};
    for (const [name, tier] of Object.entries(editPricing())) {
      tiers[name] = { match: name, input_per_m: tier.input_per_m, output_per_m: tier.output_per_m };
    }
    await updateProviderOverride(props.provider.name, { pricing: { tiers } });
    setSaving(false);
    setPricingDirty(false);
    props.onUpdate?.();
  };

  const initCommandEdits = () => {
    const cmds = props.provider.config?.commands;
    if (cmds) {
      setEditResume(cmds.resume);
      setEditNewSession(cmds.new_session);
      setEditAiGenerate(cmds.ai_generate);
      setDirty(false);
    }
  };

  const handleSaveCommands = async () => {
    setSaving(true);
    await updateProviderOverride(props.provider.name, {
      commands: {
        resume: editResume(),
        new_session: editNewSession(),
        ai_generate: editAiGenerate(),
      },
    });
    setSaving(false);
    setDirty(false);
    props.onUpdate?.();
  };

  const pathEntries = () => {
    const paths = props.provider.config?.paths;
    if (!paths) return [];
    return Object.entries(paths).filter(([_, v]) => v && v.length > 0);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testProvider(props.provider.name);
    setTestResult(result);
    setTesting(false);
  };

  const statusClass = () => {
    if (testing()) return styles.statusTesting;
    if (props.provider.health.installed) return styles.statusInstalled;
    if (props.provider.health.error) return styles.statusNotInstalled;
    return styles.statusUnknown;
  };

  const statusLabel = () => {
    if (testing()) return 'Testing...';
    if (props.provider.health.installed && props.provider.health.has_auth) return 'Healthy';
    if (props.provider.health.installed) return 'Installed (no auth)';
    if (props.provider.health.error) return props.provider.health.error;
    return 'Unknown';
  };

  return (
    <div class={`${styles.card} ${props.isActive ? styles.cardActive : ''}`}>
      {/* Header */}
      <div class={styles.cardHeader}>
        <div class={styles.providerIcon}>
          {getProviderIcon(props.provider.icon)}
        </div>

        <div class={styles.providerInfo}>
          <div class={styles.providerName}>
            {props.provider.display_name || props.provider.name}
            <Show when={props.isActive}>
              <span class={`${styles.badge} ${styles.badgeActive}`}>Active</span>
            </Show>
            <Show when={props.provider.is_builtin && !props.provider.has_override}>
              <span class={`${styles.badge} ${styles.badgeBuiltin}`}>Built-in</span>
            </Show>
            <Show when={props.provider.has_override}>
              <span class={`${styles.badge} ${styles.badgeOverride}`}>Override</span>
            </Show>
          </div>
          <div class={styles.providerSubtext}>
            <span class={`${statusClass()} ${styles.statusDot}`} />
            {statusLabel()}
            <Show when={props.provider.version}>
              {' '}&middot; v{props.provider.version}
            </Show>
          </div>
        </div>

        <div class={styles.headerActions}>
          <KobalteSwitch
            class={settingsStyles.switchRoot}
            checked={props.provider.enabled}
            onChange={(checked) => props.onToggle(props.provider.name, checked)}
          >
            <KobalteSwitch.Input />
            <KobalteSwitch.Control class={settingsStyles.switchControl}>
              <KobalteSwitch.Thumb class={settingsStyles.switchThumb} />
            </KobalteSwitch.Control>
          </KobalteSwitch>

          <button
            type="button"
            class={styles.expandButton}
            onClick={() => { if (!expanded()) { initCommandEdits(); initPricingEdits(); } setExpanded((v) => !v); }}
            title={expanded() ? 'Collapse' : 'Expand'}
          >
            <Show when={expanded()} fallback={<ChevronDown size={14} />}>
              <ChevronUp size={14} />
            </Show>
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      <Show when={expanded()}>
        <div class={styles.expandedContent}>
          {/* Health detail */}
          <div class={styles.detailSection}>
            <span class={styles.detailLabel}>Health</span>
            <div class={styles.detailRow}>
              <span class={styles.detailValue}>
                Installed: {props.provider.health.installed ? 'Yes' : 'No'}
                {' | '}Reachable: {props.provider.health.reachable ? 'Yes' : 'No'}
                {' | '}Auth: {props.provider.health.has_auth ? 'Yes' : 'No'}
              </span>
            </div>
          </div>

          {/* Commands — editable */}
          <Show when={props.provider.config?.commands}>
            <div class={styles.detailSection}>
              <div class={styles.detailRow}>
                <span class={styles.detailLabel}>Commands</span>
                <Show when={dirty()}>
                  <button
                    type="button"
                    class={buttonRecipe({ variant: 'primary', size: 'sm' })}
                    onClick={handleSaveCommands}
                    disabled={saving()}
                  >
                    <Save size={11} />
                    {saving() ? 'Saving...' : 'Save'}
                  </button>
                </Show>
              </div>
              <div class={styles.editField}>
                <label class={styles.editLabel}>New Session</label>
                <input
                  class={styles.editInput}
                  value={editNewSession()}
                  onInput={(e) => { setEditNewSession(e.currentTarget.value); setDirty(true); }}
                />
              </div>
              <div class={styles.editField}>
                <label class={styles.editLabel}>Resume</label>
                <input
                  class={styles.editInput}
                  value={editResume()}
                  onInput={(e) => { setEditResume(e.currentTarget.value); setDirty(true); }}
                />
              </div>
              <div class={styles.editField}>
                <label class={styles.editLabel}>AI Generate</label>
                <input
                  class={styles.editInput}
                  value={editAiGenerate()}
                  onInput={(e) => { setEditAiGenerate(e.currentTarget.value); setDirty(true); }}
                />
              </div>
            </div>
          </Show>

          {/* Paths — click to open in Finder */}
          <Show when={props.provider.config?.paths}>
            <div class={styles.detailSection}>
              <span class={styles.detailLabel}>Paths</span>
              <For each={pathEntries()}>
                {([key, value]) => (
                  <div
                    class={`${styles.detailRow} ${styles.clickablePath}`}
                    onClick={() => openProviderPath(props.provider.name, key)}
                    title={`Open ${value} in Finder`}
                  >
                    <span class={styles.pathKey}>{pathLabels[key] ?? key}</span>
                    <span class={styles.detailValue}>
                      {value}
                      <FolderOpen size={11} class={styles.folderIconInline} />
                    </span>
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* Pricing — editable */}
          <Show when={props.provider.config?.pricing?.tiers}>
            <div class={styles.detailSection}>
              <div class={styles.detailRow}>
                <span class={styles.detailLabel}>Pricing</span>
                <Show when={pricingDirty()}>
                  <button
                    type="button"
                    class={buttonRecipe({ variant: 'primary', size: 'sm' })}
                    onClick={handleSavePricing}
                    disabled={saving()}
                  >
                    <Save size={11} />
                    {saving() ? 'Saving...' : 'Save Pricing'}
                  </button>
                </Show>
              </div>
              <div class={styles.pricingGrid}>
                <span class={styles.pricingHeader}>Tier</span>
                <span class={styles.pricingHeader}>Input/M</span>
                <span class={styles.pricingHeader}>Output/M</span>
                <For each={Object.entries(editPricing())}>
                  {([tierName, tier]) => (
                    <>
                      <span class={styles.pricingCell}>{tierName}</span>
                      <input
                        class={`${styles.editInput} ${styles.pricingInput}`}
                        type="number"
                        step="0.01"
                        value={tier.input_per_m}
                        onInput={(e) => updatePricingTier(tierName, 'input_per_m', parseFloat(e.currentTarget.value) || 0)}
                      />
                      <input
                        class={`${styles.editInput} ${styles.pricingInput}`}
                        type="number"
                        step="0.01"
                        value={tier.output_per_m}
                        onInput={(e) => updatePricingTier(tierName, 'output_per_m', parseFloat(e.currentTarget.value) || 0)}
                      />
                    </>
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* Actions */}
          <div class={styles.actionRow}>
            <Show when={!props.isActive && props.provider.enabled}>
              <button
                type="button"
                class={buttonRecipe({ variant: 'primary', size: 'sm' })}
                onClick={() => props.onSetActive(props.provider.name)}
              >
                <Zap size={12} />
                Make Active
              </button>
            </Show>

            <button
              type="button"
              class={buttonRecipe({ variant: 'outline', size: 'sm' })}
              onClick={handleTest}
              disabled={testing()}
            >
              <Activity size={12} />
              {testing() ? 'Testing...' : 'Test Connection'}
            </button>

            <Show when={props.provider.has_override && props.onReset}>
              <button
                type="button"
                class={buttonRecipe({ variant: 'ghost', size: 'sm' })}
                onClick={() => props.onReset!(props.provider.name)}
              >
                <RotateCcw size={12} />
                Reset to Default
              </button>
            </Show>

            <Show when={!props.provider.is_builtin && props.onRemove}>
              <button
                type="button"
                class={buttonRecipe({ variant: 'danger', size: 'sm' })}
                onClick={() => props.onRemove!(props.provider.name)}
              >
                <Trash2 size={12} />
                Remove
              </button>
            </Show>
          </div>

          {/* Test Connection Results */}
          <Show when={testResult()}>
            {(result) => (
              <div class={styles.testResultPanel}>
                <span class={styles.detailLabel}>Test Results</span>
                <div class={styles.testResultRow}>
                  {result().installed ? <CheckCircle size={13} color="var(--success, #22c55e)" /> : <XCircle size={13} color="var(--danger, #ef4444)" />}
                  <span>Binary found</span>
                </div>
                <div class={styles.testResultRow}>
                  {result().reachable ? <CheckCircle size={13} color="var(--success, #22c55e)" /> : <XCircle size={13} color="var(--danger, #ef4444)" />}
                  <span>CLI responds {result().version ? `(v${result().version})` : ''}</span>
                </div>
                <div class={styles.testResultRow}>
                  {result().has_auth ? <CheckCircle size={13} color="var(--success, #22c55e)" /> : <XCircle size={13} color="var(--danger, #ef4444)" />}
                  <span>Credentials found</span>
                </div>
                <Show when={result().error}>
                  <div class={styles.testResultRow}>
                    <XCircle size={13} color="var(--danger, #ef4444)" />
                    <span class={styles.dangerText}>{result().error}</span>
                  </div>
                </Show>
              </div>
            )}
          </Show>
        </div>
      </Show>
    </div>
  );
}
