// Author: Subash Karki

import { createSignal, onMount, For, Show } from 'solid-js';
import { Star } from 'lucide-solid';
import { playSound } from '../../../core/audio/engine';
import { speakSystem } from '../config/voice';
import { buttonRecipe } from '../../../styles/recipes.css';
import { PhasePanel } from '../PhasePanel';
import {
  browseFile,
  recheckProviderHealth,
  setProviderBinaryPath,
  setActiveProvider,
} from '../../../core/bindings';
import { activeProvider, refreshActiveProvider } from '../../../core/signals/active-provider';
import type { BootScanData, DetectedAgent } from '../config/types';
import { InstallGuide } from './InstallGuide';
import * as styles from '../styles/deps-check.css';
import * as phaseStyles from '../styles/phases.css';

const App = () => (window as any).go?.['app']?.App;

interface DepsCheckProps {
  scan?: BootScanData;
  onComplete: (data: Record<string, string>) => void;
}

interface InstallInfo {
  commands: string[];
  docsUrl: string;
}

type DepRowId = 'git' | 'gh' | 'claude' | 'codex' | 'gemini';
type ProviderKey = 'claude' | 'codex' | 'gemini';

interface DepRow {
  id: DepRowId;
  providerKey: ProviderKey | null;
  /** 'core' = git/gh (each individually required); 'ai' = at least one required across the group. */
  group: 'core' | 'ai';
  label: string;
  installed: boolean;
  version: string;
  path: string;
  install: InstallInfo;
  checking: boolean;
  error: string;
}

const PROVIDER_KEYS: readonly ProviderKey[] = ['claude', 'codex', 'gemini'];

const PROVIDER_TO_AGENT: Record<ProviderKey, string> = {
  claude: 'Claude Code',
  codex: 'Codex CLI',
  gemini: 'Gemini CLI',
};

const INSTALL_INFO: Record<DepRowId, InstallInfo> = {
  git: {
    commands: ['brew install git'],
    docsUrl: 'https://git-scm.com/download/mac',
  },
  gh: {
    commands: ['brew install gh', 'gh auth login'],
    docsUrl: 'https://cli.github.com/',
  },
  claude: {
    commands: ['curl -fsSL https://claude.ai/install.sh | bash'],
    docsUrl: 'https://docs.claude.com/en/docs/claude-code/setup',
  },
  codex: {
    commands: ['npm install -g @openai/codex'],
    docsUrl: 'https://github.com/openai/codex',
  },
  gemini: {
    commands: ['npm install -g @google/gemini-cli'],
    docsUrl: 'https://github.com/google-gemini/gemini-cli',
  },
};

function findAgent(scan: BootScanData | undefined, agentName: string): DetectedAgent | undefined {
  return scan?.agents.find((a) => a.name === agentName);
}

function statusFromAgent(agent: DetectedAgent | undefined): { installed: boolean; version: string } {
  if (!agent || !agent.installed) return { installed: false, version: '' };
  return { installed: true, version: agent.version ?? '' };
}

async function runBootScan(): Promise<BootScanData | undefined> {
  try {
    const app = App();
    if (!app?.BootScan) return undefined;
    const raw = await app.BootScan();
    if (!raw) return undefined;
    return {
      gitInstalled: raw.gitInstalled ?? false,
      gitVersion: raw.gitVersion,
      ghInstalled: raw.ghInstalled ?? false,
      ghVersion: raw.ghVersion,
      ghPath: raw.ghPath,
      operator: raw.operator,
      agents: raw.agents ?? [],
    };
  } catch {
    return undefined;
  }
}

export function DepsCheck(props: DepsCheckProps) {
  const initial: DepRow[] = [
    {
      id: 'git',
      providerKey: null,
      group: 'core',
      label: 'git',
      installed: props.scan?.gitInstalled ?? false,
      version: props.scan?.gitVersion ?? '',
      path: '',
      install: INSTALL_INFO.git,
      checking: false,
      error: '',
    },
    {
      id: 'gh',
      providerKey: null,
      group: 'core',
      label: 'GitHub CLI (gh)',
      installed: props.scan?.ghInstalled ?? false,
      version: props.scan?.ghVersion ?? '',
      path: '',
      install: INSTALL_INFO.gh,
      checking: false,
      error: '',
    },
    {
      id: 'claude',
      providerKey: 'claude',
      group: 'ai',
      label: 'Claude Code',
      ...statusFromAgent(findAgent(props.scan, 'Claude Code')),
      path: '',
      install: INSTALL_INFO.claude,
      checking: false,
      error: '',
    },
    {
      id: 'codex',
      providerKey: 'codex',
      group: 'ai',
      label: 'Codex CLI',
      ...statusFromAgent(findAgent(props.scan, 'Codex CLI')),
      path: '',
      install: INSTALL_INFO.codex,
      checking: false,
      error: '',
    },
    {
      id: 'gemini',
      providerKey: 'gemini',
      group: 'ai',
      label: 'Gemini CLI',
      ...statusFromAgent(findAgent(props.scan, 'Gemini CLI')),
      path: '',
      install: INSTALL_INFO.gemini,
      checking: false,
      error: '',
    },
  ];

  const [rows, setRows] = createSignal<DepRow[]>(initial);

  const updateRow = (id: string, patch: Partial<DepRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const findRow = (id: string) => rows().find((r) => r.id === id);
  const gitInstalled = () => !!findRow('git')?.installed;
  const ghInstalled = () => !!findRow('gh')?.installed;
  const aiInstalledCount = () => rows().filter((r) => r.group === 'ai' && r.installed).length;
  const detectedCount = () => rows().filter((r) => r.installed).length;
  const totalCount = () => rows().length;

  const blockReason = () => {
    if (!gitInstalled()) return 'Install git to continue';
    if (!ghInstalled()) return 'Install gh to continue';
    if (aiInstalledCount() === 0) return 'Install at least one AI provider to continue';
    return null;
  };

  const allGreen = () => blockReason() === null;

  // Already-installed AI rows are left alone — recheckProviderHealth's regex'd
  // version is canonical, and BootScan's raw versionWithTimeout output would
  // otherwise overwrite it on the next scan and flip the version display.
  const applyBootScan = (scan: BootScanData | undefined) => {
    if (!scan) return;
    setRows((prev) => {
      let changed = false;
      const next = prev.map((r) => {
        if (r.id === 'git') {
          if (r.installed === scan.gitInstalled && r.version === (scan.gitVersion ?? '')) return r;
          changed = true;
          return { ...r, installed: scan.gitInstalled, version: scan.gitVersion ?? '' };
        }
        if (r.id === 'gh') {
          const ghI = !!scan.ghInstalled;
          if (r.installed === ghI && r.version === (scan.ghVersion ?? '')) return r;
          changed = true;
          return { ...r, installed: ghI, version: scan.ghVersion ?? '' };
        }
        if (r.providerKey && !r.installed) {
          const agent = findAgent(scan, PROVIDER_TO_AGENT[r.providerKey]);
          const { installed, version } = statusFromAgent(agent);
          if (r.installed === installed && r.version === version) return r;
          changed = true;
          return { ...r, installed, version };
        }
        return r;
      });
      return changed ? next : prev;
    });
  };

  // Re-runs each provider HealthCheck in parallel, then applies all results
  // in a single setRows so the list re-renders once instead of three times.
  const refreshProviders = async (): Promise<{ newlyInstalled: boolean }> => {
    const results = await Promise.all(
      PROVIDER_KEYS.map(async (key) => ({ key, health: await recheckProviderHealth(key) })),
    );
    let newlyInstalled = false;
    setRows((prev) =>
      prev.map((r) => {
        const result = results.find((x) => x.key === r.providerKey);
        if (!result?.health) return r;
        const after = !!result.health.installed;
        if (after && !r.installed) newlyInstalled = true;
        const version = result.health.version ?? '';
        const error = result.health.error ?? '';
        if (r.installed === after && r.version === version && r.error === error) return r;
        return { ...r, installed: after, version, error };
      }),
    );
    return { newlyInstalled };
  };

  let prevAllGreen = false;

  const onRowChanged = () => {
    const after = allGreen();
    if (after && !prevAllGreen) {
      try { playSound('ok'); } catch {}
      speakSystem('All systems online.');
    }
    prevAllGreen = after;
  };

  onMount(async () => {
    try { playSound('scan'); } catch {}

    // Probe AI providers on mount so the panel reflects any backend override
    // that landed between BootScan and entering this phase.
    await refreshProviders();

    // Sync active-provider signal with backend, then auto-select the first
    // installed AI provider as default if none is active yet. Respects any
    // prior selection.
    await refreshActiveProvider();
    const installedAi = rows().filter((r) => r.group === 'ai' && r.installed);
    if (installedAi.length > 0 && !activeProvider()) {
      const first = installedAi[0];
      if (first.providerKey) {
        await setActiveProvider(first.providerKey);
        await refreshActiveProvider();
      }
    }

    prevAllGreen = allGreen();
    if (prevAllGreen) {
      try { playSound('ok'); } catch {}
    }
  });

  const handleSetDefault = async (row: DepRow) => {
    if (!row.providerKey || !row.installed) return;
    if (activeProvider()?.name === row.providerKey) return;
    await setActiveProvider(row.providerKey);
    await refreshActiveProvider();
    try { playSound('ok'); } catch {}
  };

  const isActiveDefault = (row: DepRow) =>
    !!row.providerKey && activeProvider()?.name === row.providerKey;

  const activeDefaultLabel = () => {
    const prov = activeProvider();
    if (!prov) return null;
    const row = rows().find((r) => r.providerKey === prov.name);
    return row?.label ?? prov.display_name ?? prov.name;
  };

  const handleRecheck = async (row: DepRow) => {
    updateRow(row.id, { checking: true, error: '' });

    if (row.providerKey) {
      const health = await recheckProviderHealth(row.providerKey);
      const installed = !!health?.installed;
      updateRow(row.id, {
        checking: false,
        installed,
        version: health?.version ?? '',
        error: health?.error ?? '',
      });
      try { playSound(installed ? 'ok' : 'scan'); } catch {}
      onRowChanged();
      return;
    }

    // git/gh aren't provider-registry entries; their state lives in BootScanData.
    const scan = await runBootScan();
    if (scan) applyBootScan(scan);
    const r = findRow(row.id);
    updateRow(row.id, {
      checking: false,
      error: r?.installed ? '' : 'Install the tool then click Check Again.',
    });
    try { playSound(r?.installed ? 'ok' : 'scan'); } catch {}
    onRowChanged();
  };

  const handleBrowse = async (row: DepRow) => {
    if (!row.providerKey) return;
    const picked = await browseFile(`Locate ${row.label} binary`);
    if (!picked) return;

    updateRow(row.id, { checking: true, error: '' });
    const errMsg = await setProviderBinaryPath(row.providerKey, picked);
    if (errMsg) {
      updateRow(row.id, { checking: false, error: errMsg });
      try { playSound('scan'); } catch {}
      return;
    }

    const health = await recheckProviderHealth(row.providerKey);
    const installed = !!health?.installed;
    updateRow(row.id, {
      checking: false,
      installed,
      version: health?.version ?? '',
      path: picked,
      error: installed ? '' : (health?.error ?? 'Path saved but tool not reachable.'),
    });
    try { playSound(installed ? 'ok' : 'scan'); } catch {}
    onRowChanged();
  };

  const handleContinue = () => {
    if (!allGreen()) return;
    try { playSound('reveal'); } catch {}
    props.onComplete({});
  };

  const isRecommendedClaude = (row: DepRow) =>
    row.id === 'claude' && aiInstalledCount() === 0;

  const renderRow = (row: DepRow) => (
    <div
      class={styles.row}
      classList={{
        [styles.rowOk]: row.installed && !isActiveDefault(row),
        [styles.rowActiveDefault]: isActiveDefault(row),
        [styles.rowMissing]: !row.installed && !row.checking,
      }}
    >
      <Show
        when={!row.checking}
        fallback={<div class={`${styles.statusIcon} ${styles.statusChecking}`}>○</div>}
      >
        <Show
          when={row.installed}
          fallback={<div class={`${styles.statusIcon} ${styles.statusMissing}`}>✗</div>}
        >
          <div class={`${styles.statusIcon} ${styles.statusOk}`}>✓</div>
        </Show>
      </Show>

      <div class={styles.info}>
        <div class={styles.name}>
          <span>{row.label}</span>
          <Show when={row.group === 'core'}>
            <span class={styles.requiredBadge}>required</span>
          </Show>
          <Show when={row.id === 'claude'}>
            <span class={styles.recommendedBadge}>recommended</span>
          </Show>
          <Show when={row.version}>
            <span class={styles.version}>{row.version}</span>
          </Show>
          <Show when={row.group === 'ai' && row.installed && row.providerKey}>
            <button
              type="button"
              class={styles.starButton}
              data-active={isActiveDefault(row)}
              title={isActiveDefault(row) ? 'Default AI provider' : 'Set as default AI provider'}
              aria-label={isActiveDefault(row) ? 'Default AI provider' : 'Set as default AI provider'}
              aria-pressed={isActiveDefault(row)}
              onClick={() => handleSetDefault(row)}
              disabled={isActiveDefault(row)}
            >
              <Star
                size={14}
                fill={isActiveDefault(row) ? 'currentColor' : 'none'}
                stroke="currentColor"
                stroke-width={2}
              />
            </button>
          </Show>
        </div>
        <Show when={row.installed && row.path}>
          <div class={styles.path}>{row.path}</div>
        </Show>
        <Show when={row.error}>
          <div class={styles.error}>{row.error}</div>
        </Show>
        <Show when={!row.installed}>
          <InstallGuide
            commands={row.install.commands}
            docsUrl={row.install.docsUrl}
            defaultOpen={isRecommendedClaude(row)}
          />
        </Show>
      </div>

      <div class={styles.actions}>
        <Show when={!row.installed}>
          <div class={styles.actionRow}>
            <Show when={row.providerKey}>
              <button
                class={buttonRecipe({ variant: 'outline', size: 'sm' })}
                onClick={() => handleBrowse(row)}
                disabled={row.checking}
              >
                Browse...
              </button>
            </Show>
            <button
              class={buttonRecipe({ variant: 'ghost', size: 'sm' })}
              onClick={() => handleRecheck(row)}
              disabled={row.checking}
            >
              Check Again
            </button>
          </div>
        </Show>
        <Show when={row.installed}>
          <button
            class={buttonRecipe({ variant: 'ghost', size: 'sm' })}
            onClick={() => handleRecheck(row)}
            disabled={row.checking}
          >
            Recheck
          </button>
        </Show>
      </div>
    </div>
  );

  const coreRows = () => rows().filter((r) => r.group === 'core');
  const aiRows = () => rows().filter((r) => r.group === 'ai');

  return (
    <PhasePanel title="System Dependencies" subtitle="Verifying the tools Phantom needs to operate.">
      <div class={phaseStyles.phaseStack20}>
        <div class={styles.list}>
          <For each={coreRows()}>{(row) => renderRow(row)}</For>

          <div class={styles.groupHeader}>
            <span>Choose at least one AI assistant</span>
          </div>

          <For each={aiRows()}>{(row) => renderRow(row)}</For>
        </div>

        <div
          class={styles.summary}
          classList={{
            [styles.summaryOk]: allGreen(),
            [styles.summaryBlocked]: !allGreen(),
          }}
        >
          <Show
            when={allGreen()}
            fallback={<>{blockReason()} — {detectedCount()} of {totalCount()} tools detected</>}
          >
            All dependencies satisfied
          </Show>
        </div>

        <Show when={activeDefaultLabel()}>
          <div class={styles.defaultProviderLine}>
            <span>Default AI provider:</span>
            <span class={styles.defaultProviderLineName}>{activeDefaultLabel()}</span>
            <Star size={12} fill="currentColor" stroke="currentColor" />
          </div>
        </Show>

        <div class={phaseStyles.actionCenter}>
          <button
            class={buttonRecipe({ variant: 'primary', size: 'lg' })}
            onClick={handleContinue}
            disabled={!allGreen()}
          >
            Continue
          </button>
        </div>
      </div>
    </PhasePanel>
  );
}
