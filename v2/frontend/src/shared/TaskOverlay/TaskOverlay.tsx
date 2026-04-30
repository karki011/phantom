// Phantom — Task HUD overlay for terminal panes
// Shows live task progress from the linked AI session without leaving the terminal.
// Author: Subash Karki

import { Show, For, createSignal, createEffect, createMemo, on, onMount, onCleanup } from 'solid-js';
import { Collapsible } from '@kobalte/core/collapsible';
import { Tabs } from '@kobalte/core/tabs';
import { CheckCircle, Circle, Loader, ListTodo, FileText } from 'lucide-solid';
import { getSessionTasks } from '@/core/bindings/tasks';
import type { TaskItem } from '@/core/bindings/tasks';
import { getPlansForWorktree } from '@/core/bindings/plans';
import type { PlanFile } from '@/core/bindings/plans';
import { onWailsEvent } from '@/core/events';
import { addTabWithData } from '@/core/panes/signals';
import * as styles from './TaskOverlay.css';

interface TaskOverlayProps {
  sessionId: string | null;
  worktreePath?: string;
  repoPath?: string;
  branchName?: string;
}

interface PlanInfo {
  filePath: string;
  title: string;
  totalTasks: number;
  doneTasks: number;
}

export function TaskOverlay(props: TaskOverlayProps) {
  const [tasks, setTasks] = createSignal<TaskItem[]>([]);
  const [planActive, setPlanActive] = createSignal(false);
  const [minimized, setMinimized] = createSignal(true);
  const [planInfo, setPlanInfo] = createSignal<PlanInfo | null>(null);
  const [planGenerating, setPlanGenerating] = createSignal(false);
  const [diskPlans, setDiskPlans] = createSignal<PlanFile[]>([]);

  const refreshTasks = () => {
    const sid = props.sessionId;
    if (sid) getSessionTasks(sid).then(setTasks);
  };

  const refreshDiskPlans = () => {
    const wt = props.worktreePath;
    if (wt) {
      getPlansForWorktree(wt, props.repoPath ?? '', props.branchName ?? '').then(setDiskPlans);
    } else {
      setDiskPlans([]);
    }
  };

  createEffect(on(() => props.sessionId, (sid, prevSid) => {
    if (sid !== prevSid) {
      setPlanInfo(null);
      setPlanGenerating(false);
      setPlanActive(false);
    }
    if (sid) refreshTasks();
    else setTasks([]);
  }));

  // Fetch disk plans whenever worktreePath changes
  createEffect(on(() => props.worktreePath, refreshDiskPlans));

  // Poll for disk plans every 30s
  onMount(() => {
    const interval = setInterval(refreshDiskPlans, 30000);
    onCleanup(() => clearInterval(interval));
  });

  onWailsEvent('task:created', refreshTasks);
  onWailsEvent('task:updated', refreshTasks);
  onWailsEvent('task:stream_created', refreshTasks);
  onWailsEvent('task:stream_updated', refreshTasks);

  // Plan events: accept from any session (the HUD is per-terminal, not per-session)
  onWailsEvent<{ sessionId: string }>('plan:started', () => { setPlanActive(true); });
  onWailsEvent<{ sessionId: string }>('plan:completed', () => { setPlanActive(false); });
  onWailsEvent<{ sessionId: string } & PlanInfo>('plan:file_created', (data) => {
    setPlanInfo({ filePath: data.filePath, title: data.title, totalTasks: data.totalTasks, doneTasks: data.doneTasks });
    setPlanGenerating(false);
    // Refresh disk plans so the new file shows up immediately
    refreshDiskPlans();
  });
  onWailsEvent<{ sessionId: string }>('plan:generating', () => { setPlanGenerating(true); });

  const completed = () => tasks().filter(t => t.status === 'completed').length;
  const total = () => tasks().length;

  // Merge stream-detected plan with disk-scanned plans, deduplicating by filePath
  const allPlans = createMemo<PlanFile[]>(() => {
    const plans: PlanFile[] = [...diskPlans()];
    const streamPlan = planInfo();
    if (streamPlan && !plans.some(p => p.filePath === streamPlan.filePath)) {
      plans.unshift({
        filePath: streamPlan.filePath,
        title: streamPlan.title,
        totalTasks: streamPlan.totalTasks,
        doneTasks: streamPlan.doneTasks,
        modifiedAt: Date.now() / 1000,
        age: 'just now',
      });
    }
    return plans;
  });

  const showPlanTab = () => allPlans().length > 0 || planGenerating();
  const hasContent = () => total() > 0 || planActive() || allPlans().length > 0 || planGenerating();
  // When the panel expands with no tasks but a Plan tab is visible, land
  // the user on Plan instead of an empty Tasks pane. Read once per mount
  // by Kobalte's <Tabs defaultValue>, which is fine because the Tabs
  // component re-mounts each time the Collapsible is re-opened.
  const defaultTab = () => (total() === 0 && showPlanTab() ? 'plan' : 'tasks');

  return (
    <Show when={hasContent()}>
      <div class={styles.overlay}>
        <Show when={minimized()} fallback={
          <Collapsible defaultOpen class={styles.expandedPanel}>
            <div class={styles.panelHeader}>
              <Collapsible.Trigger class={styles.headerTrigger}>
                <ListTodo size={12} />
                <span>Tasks {completed()}/{total()}</span>
                <Show when={planActive()}>
                  <span class={styles.planPill}>PLAN</span>
                </Show>
              </Collapsible.Trigger>
              <button class={styles.minimizeButton} onClick={() => setMinimized(true)}>−</button>
            </div>
            <Collapsible.Content>
              <Tabs defaultValue={defaultTab()}>
                <Tabs.List class={styles.tabsList}>
                  <Tabs.Trigger class={styles.tabTrigger} value="tasks">
                    Tasks
                  </Tabs.Trigger>
                  <Show when={showPlanTab()}>
                    <Tabs.Trigger class={styles.tabTrigger} value="plan">
                      Plan
                    </Tabs.Trigger>
                  </Show>
                  <Tabs.Indicator />
                </Tabs.List>

                <Tabs.Content value="tasks" class={styles.taskList}>
                  <For each={tasks()}>
                    {(task) => {
                      const done = () => task.status === 'completed';
                      const active = () => task.status === 'in_progress';
                      return (
                        <div class={`${styles.taskRow} ${done() ? styles.taskRowDone : ''}`}>
                          <Show when={done()}>
                            <CheckCircle size={10} class={styles.iconDone} />
                          </Show>
                          <Show when={active()}>
                            <Loader size={10} class={styles.iconActive} />
                          </Show>
                          <Show when={!done() && !active()}>
                            <Circle size={10} class={styles.iconPending} />
                          </Show>
                          <span class={`${styles.taskText} ${done() ? styles.taskTextDone : ''}`}>
                            {task.subject ?? task.id.slice(0, 12)}
                          </span>
                        </div>
                      );
                    }}
                  </For>
                </Tabs.Content>

                <Show when={showPlanTab()}>
                  <Tabs.Content value="plan" class={styles.tabContent}>
                    <Show when={planGenerating()}>
                      <p class={styles.planEmpty}>Generating plan...</p>
                    </Show>
                    <For each={allPlans()}>
                      {(plan) => (
                        <div class={styles.planCard}>
                          <span class={styles.planTitle}>{plan.title}</span>
                          <div style={{ display: 'flex', 'align-items': 'center', gap: '8px' }}>
                            <span class={styles.planProgress}>{plan.doneTasks}/{plan.totalTasks} tasks</span>
                            <span class={styles.planAge}>{plan.age}</span>
                          </div>
                          <button
                            class={styles.openButton}
                            onClick={() => addTabWithData('editor', plan.title, { filePath: plan.filePath, isPlanFile: true })}
                          >
                            <FileText size={10} />
                            Open in Editor
                          </button>
                        </div>
                      )}
                    </For>
                    <Show when={allPlans().length === 0 && !planGenerating()}>
                      <p class={styles.planEmpty}>No plans detected</p>
                    </Show>
                  </Tabs.Content>
                </Show>
              </Tabs>
            </Collapsible.Content>
          </Collapsible>
        }>
          <button class={styles.badge} onClick={() => setMinimized(false)}>
            <ListTodo size={10} />
            <span>{completed()}/{total()}</span>
            <Show when={allPlans().length > 0}>
              <span class={styles.planDot} />
            </Show>
          </button>
        </Show>
      </div>
    </Show>
  );
}
