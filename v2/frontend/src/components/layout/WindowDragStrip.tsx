// PhantomOS v2 — Draggable strip housing macOS traffic-light inset, nav history, primary tab toggle, system stats, and action icons
// Author: Subash Karki

import { createMemo, onCleanup, onMount, Show } from 'solid-js';
import { APP_NAME } from '@/core/branding';
import {
  activeTopTab,
  setActiveTopTab,
  cockpitView,
  setCockpitView,
  activeWorktreeId,
} from '@/core/signals/app';
import { canGoBack, canGoForward, goBack, goForward, pushNav } from '@/core/signals/navigation';
import { sessions } from '@/core/signals/sessions';
import {
  systemStats,
  startSystemStatsPoll,
  stopSystemStatsPoll,
} from '@/core/signals/system-stats';
import { openSettings } from '@/core/signals/settings';
import { openAICommandCenter, aiCommandCenterSeen } from '@/core/signals/ai-command-center';
import { toggleDocs } from '@/core/signals/docs';
import { focusOrCreateTab, addTab } from '@/core/panes/signals';
import { toggleCommandPalette } from '@/core/signals/command-palette';
import { requestShutdown } from '@/core/signals/shutdown';
import { gamificationEnabled, hunterProfile, dailyQuests } from '@/core/signals/gamification';
import { RankBadge } from '@/shared/Gamification/RankBadge';
import { XPProgressBar } from '@/shared/Gamification/XPProgressBar';
import { Tip } from '@/shared/Tip/Tip';
import { ChevronLeft, ChevronRight, SystemIcon, FolderIcon } from './header-icons';
import * as shellStyles from '@/styles/app-shell.css';
import * as gamStyles from '@/styles/gamification.css';
import { headerIconPulse } from '@/components/ai-command-center/ai-command-center.css';

function BookIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2V3ZM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7V3Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M13.3 9.8a1.2 1.2 0 0 0 .24 1.32l.04.04a1.46 1.46 0 1 1-2.06 2.06l-.04-.04a1.2 1.2 0 0 0-1.32-.24 1.2 1.2 0 0 0-.73 1.1V14a1.46 1.46 0 0 1-2.92 0v-.06a1.2 1.2 0 0 0-.78-1.1 1.2 1.2 0 0 0-1.32.24l-.04.04a1.46 1.46 0 1 1-2.06-2.06l.04-.04A1.2 1.2 0 0 0 2.6 9.7a1.2 1.2 0 0 0-1.1-.73H1.46a1.46 1.46 0 0 1 0-2.92h.06A1.2 1.2 0 0 0 2.62 5.3a1.2 1.2 0 0 0-.24-1.32l-.04-.04a1.46 1.46 0 1 1 2.06-2.06l.04.04A1.2 1.2 0 0 0 5.76 2.2a1.2 1.2 0 0 0 .73-1.1V1a1.46 1.46 0 0 1 2.92 0v.06a1.2 1.2 0 0 0 .73 1.1 1.2 1.2 0 0 0 1.32-.24l.04-.04a1.46 1.46 0 1 1 2.06 2.06l-.04.04A1.2 1.2 0 0 0 13.3 5.3a1.2 1.2 0 0 0 1.1.73H15a1.46 1.46 0 0 1 0 2.92h-.06a1.2 1.2 0 0 0-1.1.73l-.04.13Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

function CommandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M5 3a2 2 0 1 0 0 4h6a2 2 0 1 0 0-4H5ZM5 9a2 2 0 1 0 0 4h6a2 2 0 1 0 0-4H5Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M5 5h6M5 11h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
    </svg>
  );
}

function JournalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" stroke-width="1.4" />
      <path d="M4 6l2.5 2L4 10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M8 10h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
    </svg>
  );
}

function BrainIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 2a7 7 0 0 0-4.6 12.3c.5.4.8 1 .9 1.6l.2 2.1h7l.2-2.1c.1-.6.4-1.2.9-1.6A7 7 0 0 0 12 2Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M10 22h4M9 18h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      <path d="M12 2v4M8 5.5l2 2M16 5.5l-2 2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.5" />
    </svg>
  );
}

function PowerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 2v10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M18.36 6.64A9 9 0 1 1 5.64 6.64" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  );
}

export function WindowDragStrip() {
  onMount(() => {
    startSystemStatsPoll();
  });
  onCleanup(() => {
    stopSystemStatsPoll();
  });

  const activeSessions = createMemo(() =>
    sessions().filter((s) => s.status === 'active' || s.status === 'running').length
  );

  const sessionLabel = createMemo(() => {
    const count = activeSessions();
    return count === 1 ? '1 session active' : `${count} sessions active`;
  });

  const stats = systemStats;

  return (
    <div class={shellStyles.windowDragStrip}>
      <div class={shellStyles.windowDragStripActions}>
        <Tip label="Back" placement="bottom">
          <button
            type="button"
            class={shellStyles.navHistoryButton}
            disabled={!canGoBack()}
            aria-label="Navigate back"
            onClick={() => goBack()}
          >
            <ChevronLeft />
          </button>
        </Tip>
        <Tip label="Forward" placement="bottom">
          <button
            type="button"
            class={shellStyles.navHistoryButton}
            disabled={!canGoForward()}
            aria-label="Navigate forward"
            onClick={() => goForward()}
          >
            <ChevronRight />
          </button>
        </Tip>
        <div class={shellStyles.topTabSegmented} role="tablist" aria-label="Primary navigation">
          {(['system', 'worktree'] as const).map((tab) => (
            <button
              type="button"
              role="tab"
              data-tour={`tab-${tab}`}
              aria-selected={activeTopTab() === tab}
              class={`${shellStyles.topTabSegment} ${activeTopTab() === tab ? shellStyles.topTabSegmentActive : ''}`}
              onClick={() => {
                const nextView = tab === 'system' ? 'system' : cockpitView();
                setActiveTopTab(tab);
                if (tab === 'system') setCockpitView('system');
                pushNav({ tab, view: nextView });
              }}
            >
              {tab === 'system' ? <SystemIcon /> : <FolderIcon />}
              {tab === 'system' ? 'System' : 'Worktree'}
            </button>
          ))}
        </div>
      </div>

      <div class={shellStyles.windowDragStripCenter} data-tour="stats-center">
        <span class={shellStyles.sessionIndicator}>
          <span class={shellStyles.sessionDot} />
          {sessionLabel()}
        </span>
        <span class={shellStyles.statDivider}>|</span>
        <span class={shellStyles.statItem}>
          CPU {Math.round(stats().cpu_percent)}%
        </span>
        <span class={shellStyles.statDivider}>|</span>
        <span class={shellStyles.statItem}>
          RAM {stats().mem_used_gb.toFixed(1)}/{stats().mem_total_gb.toFixed(1)} GB
        </span>
        <Show when={stats().battery_percent >= 0}>
          <span class={shellStyles.statDivider}>|</span>
          <span class={shellStyles.statItem}>
            {stats().battery_charging ? '⚡' : '🔋'} {stats().battery_percent}%
          </span>
        </Show>
        <Show when={activeWorktreeId()}>
          <span class={shellStyles.statDivider}>|</span>
          <span class={shellStyles.statItem} title={activeWorktreeId() ?? ''}>
            {(activeWorktreeId() ?? '').slice(0, 8)}
          </span>
        </Show>
      </div>

      <div class={shellStyles.windowDragStripRight}>
        <div class={shellStyles.headerActions}>
          <Tip label="Terminal" placement="bottom">
            <button data-tour="action-terminal" class={shellStyles.headerIconButton} type="button" aria-label="Open terminal" onClick={() => addTab('terminal')}>
              <TerminalIcon />
            </button>
          </Tip>
          <Tip label="Command Palette" placement="bottom">
            <button data-tour="action-cmdpalette" class={shellStyles.headerIconButton} type="button" aria-label="Open command palette" onClick={() => toggleCommandPalette()}>
              <CommandIcon />
            </button>
          </Tip>
          <Tip label="Docs" placement="bottom">
            <button data-tour="action-docs" class={shellStyles.headerIconButton} type="button" aria-label="Open documentation" onClick={() => toggleDocs()}>
              <BookIcon />
            </button>
          </Tip>
          <Tip label="Daily Digest" placement="bottom">
            <button data-tour="action-digest" class={shellStyles.headerIconButton} type="button" aria-label="Open daily digest" onClick={() => focusOrCreateTab('journal', 'Daily Digest')}>
              <JournalIcon />
            </button>
          </Tip>
          <Tip label="AI Command Center" placement="bottom">
            <button
              data-tour="action-ai"
              class={`${shellStyles.headerIconButton} ${aiCommandCenterSeen() ? '' : headerIconPulse}`}
              type="button"
              aria-label="Open AI Command Center"
              onClick={() => openAICommandCenter()}
            >
              <BrainIcon />
            </button>
          </Tip>
          <Tip label="Settings" placement="bottom">
            <button data-tour="action-settings" class={shellStyles.headerIconButton} type="button" aria-label="Open settings" onClick={() => openSettings()}>
              <GearIcon />
            </button>
          </Tip>
          <Tip label="Shutdown" placement="bottom">
            <button data-tour="action-shutdown" class={`${shellStyles.headerIconButton} ${shellStyles.headerIconButtonDanger}`} type="button" aria-label={`Shutdown ${APP_NAME}`} onClick={() => requestShutdown()}>
              <PowerIcon />
            </button>
          </Tip>
        </div>

        <Show
          when={gamificationEnabled() && hunterProfile()}
          fallback={<span class={shellStyles.statusMuted}>Hunter Lv —</span>}
        >
          {(profile) => (
            <button
              type="button"
              data-tour="hunter-button"
              class={gamStyles.statusHunterSection}
              title="Open Hunter Profile"
              aria-label="Open Hunter Profile"
              onClick={() => {
                if (!gamificationEnabled()) return;
                if (activeTopTab() === 'system' && cockpitView() === 'hunter') {
                  setCockpitView('system');
                  pushNav({ tab: 'system', view: 'system' });
                  return;
                }
                setActiveTopTab('system');
                setCockpitView('hunter');
                pushNav({ tab: 'system', view: 'hunter' });
              }}
            >
              <RankBadge rank={profile().rank} size="sm" />
              <span class={gamStyles.statusLevelText}>Lv {profile().level}</span>
              <XPProgressBar
                current={profile().xp}
                required={profile().xp_to_next}
                level={profile().level}
                mini
              />
              <Show when={(dailyQuests() ?? []).length > 0}>
                {(() => {
                  const quests = () => dailyQuests() ?? [];
                  const completed = () => quests().filter((q) => q.completed > 0).length;
                  const total = () => quests().length;
                  return (
                    <>
                      <span class={shellStyles.statusDivider}>·</span>
                      <span class={shellStyles.statusMuted} title="Daily Quests">
                        ⚔ {completed()}/{total()}
                      </span>
                    </>
                  );
                })()}
              </Show>
            </button>
          )}
        </Show>
      </div>
    </div>
  );
}
