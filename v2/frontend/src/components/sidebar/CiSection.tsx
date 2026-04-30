// Phantom — CI/CD Runs section for the Activity Panel (Phase 5)
// Author: Subash Karki

import { For, JSX, Show, createSignal } from 'solid-js';
import { CheckCircle, ChevronRight, Circle, Play, XCircle, LoaderCircle } from 'lucide-solid';
import { ciRuns } from '@/core/signals/activity';
import type { CiRun } from '@/core/types';
import { openURL } from '@/core/bindings/shell';
import * as s from '@/styles/right-sidebar.css';
import { iconSuccess, iconDanger, iconWarning, iconMuted } from '@/styles/utilities.css';

// ── Props ─────────────────────────────────────────────────────────────────────

interface CiSectionProps {
  worktreeId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStatusIcon(status: string, conclusion: string): JSX.Element {
  if (conclusion === 'success') {
    return <CheckCircle size={13} class={iconSuccess} />;
  }
  if (conclusion === 'failure') {
    return <XCircle size={13} class={iconDanger} />;
  }
  if (status === 'in_progress') {
    return <LoaderCircle size={13} class={`${iconWarning} ${s.ciSpinner}`} />;
  }
  return <Circle size={13} class={iconMuted} />;
}

function getGroupStatus(checks: CiRun[]): { icon: JSX.Element; summary: string } {
  const failed = checks.filter((c) => c.conclusion === 'failure');
  const pending = checks.filter((c) => !c.conclusion || c.conclusion === '');

  if (failed.length > 0) {
    return {
      icon: <XCircle size={13} class={iconDanger} />,
      summary: `${failed.length} failed`,
    };
  }
  if (pending.length > 0) {
    return {
      icon: <LoaderCircle size={13} class={`${iconWarning} ${s.ciSpinner}`} />,
      summary: `${pending.length} pending`,
    };
  }
  return {
    icon: <CheckCircle size={13} class={iconSuccess} />,
    summary: `${checks.length} passed`,
  };
}

function groupByWorkflow(runs: CiRun[]): { workflow: string; checks: CiRun[] }[] {
  const groups = new Map<string, CiRun[]>();
  for (const run of runs) {
    const sep = run.name.indexOf(' / ');
    const key = sep > 0 ? run.name.slice(0, sep) : run.name;
    const group = groups.get(key);
    if (group) group.push(run);
    else groups.set(key, [run]);
  }
  return Array.from(groups, ([workflow, checks]) => ({ workflow, checks }));
}

function getSectionSummary(runs: CiRun[]): string {
  const total = runs.length;
  const failed = runs.filter((r) => r.conclusion === 'failure').length;
  const pending = runs.filter((r) => !r.conclusion || r.conclusion === '').length;

  if (failed > 0) return `${total} checks · ${failed} failed`;
  if (pending > 0) return `${total} checks · ${pending} pending`;
  return `${total} checks · all passed`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface SingleCheckRowProps {
  run: CiRun;
}

function SingleCheckRow(props: SingleCheckRowProps) {
  return (
    <div
      class={s.ciRow}
      onClick={() => openURL(props.run.url)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && openURL(props.run.url)}
    >
      {getStatusIcon(props.run.status, props.run.conclusion)}
      <span class={s.ciName}>{props.run.name}</span>
      <Show when={props.run.conclusion}>
        <span class={s.ciStatusLabel}>{props.run.conclusion}</span>
      </Show>
    </div>
  );
}

interface MultiCheckGroupProps {
  workflow: string;
  checks: CiRun[];
}

function MultiCheckGroup(props: MultiCheckGroupProps) {
  const [expanded, setExpanded] = createSignal(false);
  const groupStatus = () => getGroupStatus(props.checks);

  return (
    <div>
      {/* Group header row */}
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
        {groupStatus().icon}
        <span class={`${s.ciName} ${s.ciNameBold}`}>
          {props.workflow}
        </span>
        <span class={s.ciStatusLabel}>
          {props.checks.length} · {groupStatus().summary}
        </span>
      </div>

      {/* Expanded children */}
      <Show when={expanded()}>
        <div class={s.ciGroupIndent}>
          <For each={props.checks}>
            {(check) => (
              <div
                class={s.ciRowChild}
                onClick={() => openURL(check.url)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && openURL(check.url)}
              >
                {getStatusIcon(check.status, check.conclusion)}
                <span class={s.ciNameChild}>
                  {check.name.includes(' / ')
                    ? check.name.slice(check.name.indexOf(' / ') + 3)
                    : check.name}
                </span>
                <Show when={check.conclusion}>
                  <span class={s.ciStatusLabel}>{check.conclusion}</span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CiSection(_props: CiSectionProps) {
  const runs = ciRuns;

  return (
    <Show when={runs() !== null}>
      <div class={s.ciSection}>
        {/* Section header */}
        <div class={s.ciSectionHeader}>
          <Play size={11} />
          <span class={s.ciSectionTitle}>
            CI / CD Runs
          </span>
          <Show when={runs()!.length > 0}>
            <span class={s.ciStatusLabel}>{getSectionSummary(runs()!)}</span>
          </Show>
        </div>

        {/* Empty state */}
        <Show when={runs()!.length === 0}>
          <div class={`${s.ciStatusLabel} ${s.ciEmptyState}`}>
            No CI runs
          </div>
        </Show>

        {/* Grouped runs */}
        <Show when={runs()!.length > 0}>
          <For each={groupByWorkflow(runs()!)}>
            {(group) => (
              <Show
                when={group.checks.length > 1}
                fallback={<SingleCheckRow run={group.checks[0]} />}
              >
                <MultiCheckGroup workflow={group.workflow} checks={group.checks} />
              </Show>
            )}
          </For>
        </Show>
      </div>
    </Show>
  );
}
