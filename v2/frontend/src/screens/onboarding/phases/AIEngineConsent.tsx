// Author: Subash Karki

import { createSignal, For, onMount, Show } from 'solid-js';
import { Switch as KobalteSwitch } from '@kobalte/core/switch';
import { playSound } from '../../../core/audio/engine';
import { AI_FEATURES, buildAIPrefs, defaultAIState } from '../config/ai-features';
import { buttonRecipe } from '../../../styles/recipes.css';
import { PhasePanel } from '../PhasePanel';
import { AutoTimer } from '../engine/AutoTimer';
import * as phaseStyles from '../styles/phases.css';
import * as styles from '../styles/ai-consent.css';

interface AIEngineConsentProps {
  onComplete: (data: Record<string, string>) => void;
}

interface MCPStatus {
  registered: boolean;
  binaryPath: string;
  stale: boolean;
  error?: string;
}

const App = () => (window as any).go?.['app']?.App;

async function getMCPStatus(): Promise<MCPStatus> {
  try {
    const raw = await App()?.GetMCPRegistrationStatus?.();
    if (!raw) return { registered: false, binaryPath: '', stale: false };
    return raw as MCPStatus;
  } catch (err) {
    return {
      registered: false,
      binaryPath: '',
      stale: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function repairMCP(): Promise<string> {
  try {
    return (await App()?.RepairMCPRegistration?.()) ?? '';
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export function AIEngineConsent(props: AIEngineConsentProps) {
  const [states, setStates] = createSignal<Record<string, boolean>>(defaultAIState());
  const [paused, setPaused] = createSignal(false);
  const [mcpStatus, setMcpStatus] = createSignal<MCPStatus | null>(null);
  const [repairing, setRepairing] = createSignal(false);

  onMount(() => {
    playSound('reveal');
    void refreshStatus();
  });

  async function refreshStatus() {
    setMcpStatus(await getMCPStatus());
  }

  async function handleRepair() {
    setPaused(true);
    setRepairing(true);
    const err = await repairMCP();
    setRepairing(false);
    if (err) {
      setMcpStatus({ registered: false, binaryPath: '', stale: false, error: err });
      return;
    }
    await refreshStatus();
  }

  function toggle(key: string, checked: boolean) {
    setPaused(true);
    setStates((prev) => ({ ...prev, [key]: checked }));
  }

  function enableAll() {
    setPaused(true);
    setStates(Object.fromEntries(AI_FEATURES.map((f) => [f.key, true])));
  }

  function handleConfirm() {
    props.onComplete(buildAIPrefs(states()));
  }

  function handleSkip() {
    props.onComplete({});
  }

  function handleAutoResolve() {
    props.onComplete(buildAIPrefs(states()));
  }

  return (
    <PhasePanel title="AI Engine" subtitle="Select which capabilities the AI engine should activate.">
      <div
        class={phaseStyles.phaseStack}
        onPointerDown={() => setPaused(true)}
        onKeyDown={() => setPaused(true)}
      >
        <div class={styles.featureList}>
          <For each={AI_FEATURES}>
            {(feature) => (
              <div class={phaseStyles.toggleRow}>
                <div class={phaseStyles.toggleLabel}>
                  <div class={styles.titleRow}>
                    <span class={phaseStyles.toggleTitle}>{feature.label}</span>
                    {feature.recommended && (
                      <span class={styles.recommendedBadge}>Recommended</span>
                    )}
                  </div>
                  <p class={phaseStyles.toggleDesc}>{feature.description}</p>
                </div>
                <KobalteSwitch
                  class={phaseStyles.switchRoot}
                  checked={states()[feature.key]}
                  onChange={(checked) => toggle(feature.key, checked)}
                >
                  <KobalteSwitch.Input />
                  <KobalteSwitch.Control class={phaseStyles.switchControl}>
                    <KobalteSwitch.Thumb class={phaseStyles.switchThumb} />
                  </KobalteSwitch.Control>
                </KobalteSwitch>
              </div>
            )}
          </For>
        </div>

        <Show when={mcpStatus()}>
          {(status) => {
            const ok = status().registered && !status().stale && !status().error;
            return (
              <div class={styles.mcpStatusRow}>
                <span class={ok ? styles.mcpStatusOk : styles.mcpStatusBad}>
                  Phantom MCP server: {ok ? 'registered' : 'not registered'}
                  {status().stale ? ' (stale v1 entry)' : ''}
                </span>
                <Show when={!ok}>
                  <button
                    class={buttonRecipe({ variant: 'outline', size: 'sm' })}
                    onClick={() => void handleRepair()}
                    disabled={repairing()}
                  >
                    {repairing() ? 'Repairing…' : 'Repair'}
                  </button>
                </Show>
              </div>
            );
          }}
        </Show>

        <div class={styles.actionRow}>
          <button
            class={buttonRecipe({ variant: 'outline', size: 'md' })}
            onClick={enableAll}
          >
            Enable All
          </button>
          <button
            class={buttonRecipe({ variant: 'primary', size: 'lg' })}
            onClick={handleConfirm}
          >
            Confirm
          </button>
        </div>
        <div class={styles.skipRow}>
          <button
            class={buttonRecipe({ variant: 'ghost', size: 'sm' })}
            onClick={handleSkip}
          >
            Skip
          </button>
        </div>
      </div>

      <AutoTimer
        timeout={10000}
        onResolve={handleAutoResolve}
        message="Using default configuration."
        paused={paused()}
      />
    </PhasePanel>
  );
}
