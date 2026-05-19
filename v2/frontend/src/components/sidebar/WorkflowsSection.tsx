// Phantom — GitHub Actions Workflows section for the Activity Panel
// Author: Subash Karki

import { For, JSX, Show, createSignal, createMemo } from 'solid-js';
import { CheckCircle, ChevronRight, Circle, XCircle, LoaderCircle, Zap, Play, RotateCcw, Ban } from 'lucide-solid';
import { workflows, workflowRuns } from '@/core/signals/activity';
import { activeWorktreeId } from '@/core/signals/app';
import type { Workflow, WorkflowRun } from '@/core/types';
import { dispatchWorkflow, rerunWorkflow, cancelWorkflowRun } from '@/core/bindings/git';
import { openURL } from '@/core/bindings/shell';
import * as s from '@/styles/right-sidebar.css';
import { iconSuccess, iconDanger, iconWarning, iconMuted } from '@/styles/utilities.css';

// ── Props ─────────────────────────────────────────────────────────────────────

interface WorkflowsSectionProps {
  worktreeId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function getStatusIcon(status: string, conclusion: string): JSX.Element {
  if (conclusion === 'success') return <CheckCircle size={13} class={iconSuccess} />;
  if (conclusion === 'failure') return <XCircle size={13} class={iconDanger} />;
  if (status === 'in_progress') return <LoaderCircle size={13} class={`${iconWarning} ${s.ciSpinner}`} />;
  if (status === 'queued' || status === 'waiting') return <Circle size={13} class={iconMuted} />;
  return <Circle size={13} class={iconMuted} />;
}

function getLatestRunStatus(runs: WorkflowRun[]): { icon: JSX.Element; summary: string } {
  if (runs.length === 0) return { icon: <Circle size={13} class={iconMuted} />, summary: 'no runs' };
  const latest = runs[0];
  if (latest.conclusion === 'failure') return { icon: <XCircle size={13} class={iconDanger} />, summary: 'failed' };
  if (latest.conclusion === 'success') return { icon: <CheckCircle size={13} class={iconSuccess} />, summary: 'passed' };
  if (latest.status === 'in_progress') return { icon: <LoaderCircle size={13} class={`${iconWarning} ${s.ciSpinner}`} />, summary: 'running' };
  return { icon: <Circle size={13} class={iconMuted} />, summary: latest.status || 'queued' };
}

interface WorkflowGroup {
  workflow: Workflow;
  runs: WorkflowRun[];
}

function groupRunsByWorkflow(wfs: Workflow[], runs: WorkflowRun[]): WorkflowGroup[] {
  const runMap = new Map<number, WorkflowRun[]>();
  for (const run of runs) {
    const list = runMap.get(run.workflow_id);
    if (list) list.push(run);
    else runMap.set(run.workflow_id, [run]);
  }
  return wfs.map((wf) => ({
    workflow: wf,
    runs: runMap.get(wf.id) ?? [],
  }));
}

function getSectionSummary(runs: WorkflowRun[]): string {
  const total = runs.length;
  if (total === 0) return '';
  const failed = runs.filter((r) => r.conclusion === 'failure').length;
  const running = runs.filter((r) => r.status === 'in_progress').length;
  if (failed > 0) return `${total} runs · ${failed} failed`;
  if (running > 0) return `${total} runs · ${running} running`;
  return `${total} runs`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function WorkflowGroupRow(props: { group: WorkflowGroup; worktreeId: string }) {
  const [expanded, setExpanded] = createSignal(false);
  const [dispatching, setDispatching] = createSignal(false);
  const latestStatus = () => getLatestRunStatus(props.group.runs);

  const handleDispatch = async (e: MouseEvent) => {
    e.stopPropagation();
    const wtId = activeWorktreeId();
    if (!wtId) return;
    setDispatching(true);
    const ref = props.group.runs[0]?.head_branch ?? 'main';
    await dispatchWorkflow(wtId, props.group.workflow.id, ref);
    setDispatching(false);
  };

  return (
    <div>
      {/* Group header */}
      <div
        class={s.ciRow}
        onClick={() => setExpanded((v) => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
      >
        <ChevronRight
          size={10}
          class={expanded() ? `${s.ciChevron} ${s.ciChevronExpanded}` : s.ciChevron}
        />
        {latestStatus().icon}
        <span class={`${s.ciName} ${s.ciNameBold}`}>{props.group.workflow.name}</span>
        <span class={s.ciStatusLabel}>{latestStatus().summary}</span>
        <button
          type="button"
          class={s.sectionActionButton}
          style={{ 'margin-left': 'auto', 'flex-shrink': '0' }}
          onClick={handleDispatch}
          disabled={dispatching()}
          title={`Run ${props.group.workflow.name}`}
        >
          <Play size={11} />
        </button>
      </div>

      {/* Expanded run rows */}
      <Show when={expanded()}>
        <div class={s.ciGroupIndent}>
          <For each={props.group.runs}>
            {(run) => <WorkflowRunRow run={run} worktreeId={props.worktreeId} />}
          </For>
          <Show when={props.group.runs.length === 0}>
            <div class={`${s.ciStatusLabel} ${s.ciEmptyState}`}>No runs yet</div>
          </Show>
        </div>
      </Show>
    </div>
  );
}

function WorkflowRunRow(props: { run: WorkflowRun; worktreeId: string }) {
  const [acting, setActing] = createSignal(false);

  const handleRerun = async (e: MouseEvent) => {
    e.stopPropagation();
    setActing(true);
    await rerunWorkflow(props.worktreeId, props.run.id);
    setActing(false);
  };

  const handleCancel = async (e: MouseEvent) => {
    e.stopPropagation();
    setActing(true);
    await cancelWorkflowRun(props.worktreeId, props.run.id);
    setActing(false);
  };

  return (
    <div
      class={s.ciRowChild}
      onClick={() => openURL(props.run.html_url)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && openURL(props.run.html_url)}
    >
      {getStatusIcon(props.run.status, props.run.conclusion)}
      <span class={s.ciName} style={{ 'font-family': 'var(--phantom-font-mono)', 'font-size': '11px' }}>
        #{props.run.run_number}
      </span>
      <span class={s.ciStatusLabel}>{props.run.event}</span>
      <span class={s.ciStatusLabel}>{props.run.head_branch}</span>
      <span class={s.ciStatusLabel} style={{ 'margin-left': 'auto', 'flex-shrink': '0' }}>
        {timeAgo(props.run.created_at)}
      </span>
      {/* Action buttons */}
      <Show when={props.run.conclusion === 'failure'}>
        <button
          type="button"
          class={s.sectionActionButton}
          style={{ 'flex-shrink': '0' }}
          onClick={handleRerun}
          disabled={acting()}
          title="Rerun workflow"
        >
          <RotateCcw size={11} />
        </button>
      </Show>
      <Show when={props.run.status === 'in_progress' || props.run.status === 'queued'}>
        <button
          type="button"
          class={s.sectionActionButton}
          style={{ 'flex-shrink': '0' }}
          onClick={handleCancel}
          disabled={acting()}
          title="Cancel run"
        >
          <Ban size={11} />
        </button>
      </Show>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function WorkflowsSection(props: WorkflowsSectionProps) {
  const wfs = workflows;
  const runs = workflowRuns;

  const groups = createMemo<WorkflowGroup[]>(() => {
    const w = wfs();
    const r = runs();
    if (!w || !r) return [];
    return groupRunsByWorkflow(w, r);
  });

  const allRuns = createMemo(() => runs() ?? []);

  return (
    <Show when={wfs() !== null}>
      <div class={s.ciSection}>
        {/* Section header */}
        <div class={s.ciSectionHeader}>
          <Zap size={11} />
          <span class={s.ciSectionTitle}>Workflows</span>
          <Show when={allRuns().length > 0}>
            <span class={s.ciStatusLabel}>{getSectionSummary(allRuns())}</span>
          </Show>
        </div>

        {/* Empty state */}
        <Show when={groups().length === 0}>
          <div class={`${s.ciStatusLabel} ${s.ciEmptyState}`}>
            No workflows
          </div>
        </Show>

        {/* Workflow groups */}
        <Show when={groups().length > 0}>
          <For each={groups()}>
            {(group) => <WorkflowGroupRow group={group} worktreeId={props.worktreeId} />}
          </For>
        </Show>
      </div>
    </Show>
  );
}
