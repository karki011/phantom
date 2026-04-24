// PhantomOS v2 — Session controls for WorktreeHome
// Author: Subash Karki

import { Show, createSignal, createMemo } from 'solid-js';
import { Shield, Pause, Play, Skull, ExternalLink, TerminalSquare } from 'lucide-solid';
import { wardAlertCount } from '@/core/signals/wards';
import { tabs } from '@/core/panes/signals';
import { addTabWithData } from '@/core/panes/signals';
import { pauseSession, resumeSession, killSession, setSessionPolicy } from '@/core/bindings';
import { showToast, showWarningToast } from '@/shared/Toast/Toast';
import { WardManager } from '@/shared/WardManager/WardManager';
import { PhantomDrawer } from '@/shared/PhantomDrawer/PhantomDrawer';
import type { Session } from '@/core/types';
import * as styles from './SessionControls.css';

interface Props {
  session: Session;
}

export function SessionControls(props: Props) {
  const [loading, setLoading] = createSignal(false);
  const [confirmKill, setConfirmKill] = createSignal(false);
  const [showWardManager, setShowWardManager] = createSignal(false);

  const isPaused = () => props.session.status === 'paused';
  const policy = () => 'supervised';

  const hasTab = createMemo(() => {
    const sessionCwd = props.session.cwd;
    if (!sessionCwd) return false;
    for (const tab of tabs()) {
      for (const pane of Object.values(tab.panes)) {
        if (
          pane.kind === 'terminal' &&
          pane.data?.command &&
          typeof pane.data.command === 'string' &&
          pane.data.command.includes('claude') &&
          pane.data.cwd === sessionCwd
        ) {
          return true;
        }
      }
    }
    return false;
  });

  const isExternal = () => !hasTab();

  async function handleTogglePause() {
    if (loading()) return;
    setLoading(true);
    try {
      if (isPaused()) {
        await resumeSession(props.session.id);
        showToast('Session Resumed', 'Claude session is now active');
      } else {
        await pauseSession(props.session.id);
        showToast('Session Paused', 'Claude session suspended via SIGTSTP');
      }
    } catch (e) {
      showWarningToast('Error', String(e));
    }
    setLoading(false);
  }

  async function handleKill() {
    if (!confirmKill()) {
      setConfirmKill(true);
      setTimeout(() => setConfirmKill(false), 3000);
      return;
    }
    setLoading(true);
    try {
      await killSession(props.session.id);
      showToast('Session Killed', 'Claude session terminated');
    } catch (e) {
      showWarningToast('Error', String(e));
    }
    setLoading(false);
    setConfirmKill(false);
  }

  function handleAttach() {
    const cwd = props.session.cwd ?? '';
    addTabWithData('terminal', 'Claude (attached)', {
      cwd,
      command: `claude --resume --session-id ${props.session.id}`,
    });
  }

  async function handlePolicyChange(newPolicy: string) {
    try {
      await setSessionPolicy(props.session.id, newPolicy);
    } catch (e) {
      showWarningToast('Error', String(e));
    }
  }

  const sessionLabel = () => {
    const fp = props.session.first_prompt;
    if (fp) return fp.length > 50 ? fp.slice(0, 50) + '…' : fp;
    return props.session.name ?? props.session.id.slice(0, 12);
  };

  return (
    <div class={`${styles.controlsCard} ${isExternal() ? styles.controlsCardExternal : ''}`}>
      <div class={styles.controlsHeader}>
        <span class={styles.controlsIcon}><Shield size={14} /></span>
        <span class={styles.controlsTitle}>Session Guard</span>
        <Show when={isExternal()}>
          <span class={styles.externalBadge}><ExternalLink size={10} /> External</span>
        </Show>
        <Show when={wardAlertCount() > 0}>
          <span class={styles.wardBadge}>{wardAlertCount()}</span>
        </Show>
      </div>

      <div class={styles.controlsRow}>
        <span class={styles.sessionName}>{sessionLabel()}</span>
        <Show when={props.session.model}>
          <span class={styles.sessionModel}>{props.session.model}</span>
        </Show>
        <span class={`${styles.statusBadge} ${isPaused() ? styles.statusPaused : styles.statusActive}`}>
          {isPaused() ? '⏸ paused' : '● active'}
        </span>
      </div>

      <div class={styles.controlsRow}>
        <Show when={isExternal()}>
          <button class={`${styles.controlButton} ${styles.controlButtonAttach}`} onClick={handleAttach}>
            <TerminalSquare size={12} /> Attach
          </button>
        </Show>

        <button
          class={styles.controlButton}
          onClick={handleTogglePause}
          disabled={loading()}
        >
          <Show when={isPaused()} fallback={<><Pause size={12} /> Pause</>}>
            <Play size={12} /> Resume
          </Show>
        </button>

        <div class={styles.policyGroup}>
          <button
            class={`${styles.policyOption} ${policy() === 'supervised' ? styles.policyOptionActive : ''}`}
            onClick={() => handlePolicyChange('supervised')}
          >
            Supervised
          </button>
          <button
            class={`${styles.policyOption} ${policy() === 'auto' ? styles.policyOptionActive : ''}`}
            onClick={() => handlePolicyChange('auto')}
          >
            Auto
          </button>
          <button
            class={`${styles.policyOption} ${policy() === 'smart' ? styles.policyOptionActive : ''}`}
            onClick={() => handlePolicyChange('smart')}
          >
            Smart
          </button>
        </div>

        <button
          class={`${styles.controlButton} ${styles.controlButtonDanger}`}
          onClick={handleKill}
          disabled={loading()}
        >
          <Skull size={12} />
          {confirmKill() ? 'Confirm Kill?' : 'Kill'}
        </button>

        <button
          class={styles.controlButton}
          onClick={() => setShowWardManager(true)}
        >
          <Shield size={12} /> Manage Wards
        </button>
      </div>

      <PhantomDrawer
        open={showWardManager}
        onOpenChange={setShowWardManager}
        title="Ward Manager"
      >
        <WardManager />
      </PhantomDrawer>
    </div>
  );
}
