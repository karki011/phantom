// PhantomOS v2 — Session controls for WorktreeHome
// Author: Subash Karki

import { Show, For, createSignal, createEffect, createMemo, on } from 'solid-js';
import { Shield, Pause, Play, Skull, ExternalLink, TerminalSquare, ChevronDown, ChevronRight, CheckCircle, Circle, Loader, Activity } from 'lucide-solid';
import { Collapsible } from '@kobalte/core/collapsible';
import { wardAlertCount } from '@/core/signals/wards';
import { getPref } from '@/core/signals/preferences';
import { tabs } from '@/core/panes/signals';
import { addTabWithData } from '@/core/panes/signals';
import { pauseSession, resumeSession, killSession } from '@/core/bindings';
import { showToast, showWarningToast } from '@/shared/Toast/Toast';
import { activeProvider, activeProviderLabel } from '@/core/signals/active-provider';
import { WardManager } from '@/shared/WardManager/WardManager';
import { PhantomDrawer } from '@/shared/PhantomDrawer/PhantomDrawer';
import { getSessionTasks } from '@/core/bindings/tasks';
import type { TaskItem } from '@/core/bindings/tasks';
import { onWailsEvent } from '@/core/events';
import type { Session } from '@/core/types';
import * as styles from './SessionControls.css';
import { cwdMatchesBidirectional } from '@/core/utils/path-match';

/** Provider dot color for non-Claude providers. */
const providerDotColor = (prov: string): string => {
  switch (prov) {
    case 'codex': return '#22c55e';
    case 'gemini': return '#3b82f6';
    default: return '#6b7280';
  }
};

/** Check if a terminal command belongs to a known AI coding assistant */
const isAISession = (command: string): boolean => {
  const knownBinaries = ['claude', 'codex', 'gemini', 'aider', 'amp', 'copilot', 'opencode'];
  return knownBinaries.some((bin) => command.includes(bin));
};

interface Props {
  session: Session;
}

export function SessionControls(props: Props) {
  const [loading, setLoading] = createSignal(false);
  const [confirmKill, setConfirmKill] = createSignal(false);
  const [showWardManager, setShowWardManager] = createSignal(false);
  const [tasks, setTasks] = createSignal<TaskItem[]>([]);
  const [tasksExpanded, setTasksExpanded] = createSignal(false);

  const isPaused = () => props.session.status === 'paused';

  const completedTasks = () => tasks().filter(t => t.status === 'completed');
  const totalTasks = () => tasks().length;

  const [planActive, setPlanActive] = createSignal(false);

  createEffect(on(
    () => props.session.id,
    (sid) => { if (sid) getSessionTasks(sid).then(setTasks); },
    { defer: false }
  ));
  const refreshTasks = () => { getSessionTasks(props.session.id).then(setTasks); };
  onWailsEvent('task:updated', refreshTasks);
  onWailsEvent('task:created', refreshTasks);
  onWailsEvent('task:stream_created', refreshTasks);
  onWailsEvent('task:stream_updated', refreshTasks);
  onWailsEvent<{ sessionId: string }>('plan:started', (data) => {
    if (data.sessionId === props.session.id) setPlanActive(true);
  });
  onWailsEvent<{ sessionId: string }>('plan:completed', (data) => {
    if (data.sessionId === props.session.id) setPlanActive(false);
  });

  const hasTab = createMemo(() => {
    const sessionCwd = props.session.cwd;
    const sessionId = props.session.id;
    for (const tab of tabs()) {
      for (const pane of Object.values(tab.panes)) {
        if (pane.kind !== 'terminal') continue;
        const cmd = typeof pane.data?.command === 'string' ? pane.data.command : '';
        if (cmd && cmd.includes(sessionId)) return true;
        const paneCwd = pane.data?.cwd as string;
        if (cwdMatchesBidirectional(paneCwd, sessionCwd)) return true;
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
        showToast('Session Resumed', `${activeProviderLabel()} session is now active`);
      } else {
        await pauseSession(props.session.id);
        showToast('Session Paused', `${activeProviderLabel()} session suspended via SIGTSTP`);
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
      showToast('Session Killed', `${activeProviderLabel()} session terminated`);
    } catch (e) {
      showWarningToast('Error', String(e));
    }
    setLoading(false);
    setConfirmKill(false);
  }

  function handleAttach() {
    const cwd = props.session.cwd ?? '';
    const resumeCmd = activeProvider()?.config?.commands?.resume?.replace('${SESSION_ID}', props.session.id)
      ?? `claude --resume --session-id ${props.session.id}`;
    addTabWithData('terminal', `${activeProviderLabel()} (attached)`, {
      cwd,
      command: resumeCmd,
    });
  }

  const sessionLabel = () => {
    const fp = props.session.first_prompt;
    if (fp) return fp.length > 50 ? fp.slice(0, 50) + '…' : fp;
    return props.session.name ?? props.session.id.slice(0, 12);
  };

  return (
    <div class={`${styles.controlsCard} ${isExternal() ? styles.controlsCardExternal : ''}`}>
      <div class={styles.controlsRow}>
        <span class={styles.sessionName}>{sessionLabel()}</span>
        <Show when={props.session.model}>
          <span class={styles.sessionModel}>{props.session.model?.replace('claude-', '')}</span>
        </Show>
        <span class={`${styles.statusBadge} ${isPaused() ? styles.statusPaused : styles.statusActive}`}>
          {isPaused() ? '⏸' : '●'}
        </span>
        <Show when={planActive()}>
          <span class={styles.planBadge}>PLAN</span>
        </Show>
        <Show when={isExternal()}>
          <span class={styles.externalBadge}>ext</span>
        </Show>
        <span class={styles.controlButtons}>
          <Show when={isExternal()}>
            <button class={`${styles.controlButton} ${styles.controlButtonAttach}`} onClick={handleAttach}>
              <TerminalSquare size={11} /> Attach
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

        <button
          class={`${styles.controlButton} ${styles.controlButtonDanger}`}
          onClick={handleKill}
          disabled={loading()}
        >
          <Skull size={12} />
          {confirmKill() ? 'Confirm Kill?' : 'Kill'}
        </button>

          <Show when={getPref('wards_enabled') === 'true'}>
            <button
              class={styles.controlButton}
              onClick={() => setShowWardManager(true)}
            >
              <Shield size={12} />
            </button>
          </Show>
        </span>
      </div>

      {/* Inline task list */}
      <Show when={totalTasks() > 0}>
        <Collapsible class={styles.taskSection}>
          <Collapsible.Trigger class={styles.taskTrigger}>
            <span class={styles.taskChevron}>
              <ChevronRight size={12} />
            </span>
            Tasks ({completedTasks().length}/{totalTasks()} completed)
          </Collapsible.Trigger>
          <Collapsible.Content class={styles.taskContent}>
            <For each={tasks()}>
              {(task) => {
                const isCompleted = () => task.status === 'completed';
                const isInProgress = () => task.status === 'in_progress';
                const duration = () => {
                  if (!task.duration_ms || task.duration_ms <= 0) return null;
                  const mins = Math.round(task.duration_ms / 60000);
                  return mins > 0 ? `${mins}m` : '<1m';
                };

                return (
                  <div class={`${styles.taskItem} ${isCompleted() ? styles.taskItemCompleted : ''}`}>
                    <Show when={isCompleted()}>
                      <CheckCircle size={12} class={styles.taskIconDone} />
                    </Show>
                    <Show when={isInProgress()}>
                      <Loader size={12} class={styles.taskIconProgress} />
                    </Show>
                    <Show when={!isCompleted() && !isInProgress()}>
                      <Circle size={12} class={styles.taskIconPending} />
                    </Show>
                    <span class={`${styles.taskLabel} ${isCompleted() ? styles.taskLabelDone : ''}`}>
                      {task.subject ?? task.id.slice(0, 12)}
                    </span>
                    <Show when={task.crew} fallback={
                      <Show when={!isCompleted()}>
                        <span class={styles.taskTodo}>todo</span>
                      </Show>
                    }>
                      <span class={styles.taskCrew}>{task.crew}</span>
                    </Show>
                    <Show when={duration()}>
                      <span class={styles.taskDuration}>{duration()}</span>
                    </Show>
                  </div>
                );
              }}
            </For>
          </Collapsible.Content>
        </Collapsible>
      </Show>

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
