// Author: Subash Karki
// Port of V1 ToolUseChip from ComposerPane.tsx

import { createMemo, createSignal, Show, For, type Component } from 'solid-js';
import {
  Wrench, Check, X, ChevronRight, ChevronDown,
  Terminal, Bot, Eye, Search, Pencil,
  FilePlus, FolderSearch, Globe, ListTodo, FileCode, Zap,
} from 'lucide-solid';
import { activeSessionId, getSessionStore } from '@/core/composer/store';
import type { ToolUseState, ToolUseStatus } from '@/core/composer/types';
import {
  extractToolSummary,
  groupToolCalls,
  type ToolGroup,
  type ToolUseEntry,
} from '@/components/panes/ComposerToolSummary';
import * as css from './ToolUseCard.css';

// ── Icon map (same as V1) ─────────────────────────────────────────────
const TOOL_ICON_MAP: Record<string, typeof Wrench> = {
  Terminal, Bot, Eye, Search, Pencil,
  FilePlus, FolderSearch, Globe, ListTodo, FileCode, Zap, Wrench,
};

// ── Helpers ───────────────────────────────────────────────────────────
const formatToolInput = (input: Record<string, unknown> | string): string => {
  try {
    if (typeof input === 'string') {
      const parsed = JSON.parse(input);
      return JSON.stringify(parsed, null, 2);
    }
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
};

const RESULT_PREVIEW_LIMIT = 2000;

// ── ToolUseChip ───────────────────────────────────────────────────────
// Renders a single tool call as a compact chip matching V1 style.

interface ToolUseChipProps {
  toolUseId: string;
  expandMode?: 'all' | 'none' | 'individual';
}

const ToolUseChip: Component<ToolUseChipProps> = (props) => {
  const [localOpen, setLocalOpen] = createSignal(false);
  const [showFullResult, setShowFullResult] = createSignal(false);

  const toolUse = createMemo((): ToolUseState | undefined => {
    const id = activeSessionId();
    if (!id) return undefined;
    const tuple = getSessionStore(id);
    if (!tuple) return undefined;
    const [state] = tuple;
    return state.toolUses[props.toolUseId];
  });

  const BG_TOOL_NAMES = new Set(['Agent', 'Task', 'agent', 'task'])

  // For BG agent tools: content_block_stop marks 'complete' but agent is
  // still running. Show spinner until tool_result arrives (output non-empty).
  const statusMapped = createMemo((): ToolUseStatus => {
    const tu = toolUse()
    if (!tu) return 'running'
    if (
      tu.status === 'complete' &&
      BG_TOOL_NAMES.has(tu.toolName) &&
      (tu.input as Record<string, unknown>)?.run_in_background &&
      !tu.output
    ) {
      return 'running'
    }
    return tu.status
  });

  const effectiveOpen = () => {
    const mode = props.expandMode ?? 'individual';
    if (mode === 'all') return true;
    if (mode === 'none') return false;
    return localOpen();
  };

  const summary = createMemo(() => {
    const tu = toolUse();
    if (!tu) return { label: '', iconName: 'Wrench', badge: undefined };
    const inputStr = typeof tu.input === 'string' ? tu.input : JSON.stringify(tu.input ?? {});
    return extractToolSummary(tu.toolName, inputStr);
  });

  const IconComponent = () => TOOL_ICON_MAP[summary().iconName] ?? Wrench;

  const truncatedResult = () => {
    const tu = toolUse();
    const r = tu?.output ?? '';
    if (r.length <= RESULT_PREVIEW_LIMIT || showFullResult()) return r;
    return r.slice(0, RESULT_PREVIEW_LIMIT) + '\n...';
  };

  const resultIsTruncated = () => {
    const tu = toolUse();
    return (tu?.output ?? '').length > RESULT_PREVIEW_LIMIT && !showFullResult();
  };

  const handleClick = () => {
    setLocalOpen(!localOpen());
  };

  return (
    <Show when={toolUse()}>
      {(tu) => (
        <div
          class={css.toolBlock}
          role="button"
          tabIndex={0}
          aria-expanded={effectiveOpen()}
          aria-label={`Tool call: ${tu().toolName}`}
          onClick={handleClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleClick();
            }
          }}
          style={{ cursor: 'pointer' }}
        >
          {/* Status dot */}
          <Show when={statusMapped() === 'running'}>
            <span class={css.statusDotRunning} />
          </Show>
          <Show when={statusMapped() === 'complete'}>
            <span class={css.statusDotSuccess}>
              <Check size={10} stroke-width={3} />
            </span>
          </Show>
          <Show when={statusMapped() === 'error'}>
            <span class={css.statusDotError}>
              <X size={10} stroke-width={3} />
            </span>
          </Show>

          {/* Tool icon */}
          {(() => {
            const Ic = IconComponent();
            return <Ic size={11} style={{ 'vertical-align': 'middle', 'margin-right': '4px', 'flex-shrink': '0' }} />;
          })()}

          {/* Expand chevron */}
          <Show when={effectiveOpen()} fallback={
            <ChevronRight size={11} style={{ 'vertical-align': 'middle', 'flex-shrink': '0' }} />
          }>
            <ChevronDown size={11} style={{ 'vertical-align': 'middle', 'flex-shrink': '0' }} />
          </Show>

          {/* Tool name */}
          <span style={{ 'margin-left': '4px', 'flex-shrink': '0' }}>{tu().toolName}</span>

          {/* Summary label */}
          <Show when={summary().label}>
            <span class={css.toolNameSep}>—</span>
            <span class={css.toolSummaryLabel} title={summary().label}>
              {summary().label}
            </span>
          </Show>

          {/* Badge */}
          <Show when={summary().badge}>
            <span class={css.toolBadge}>{summary().badge}</span>
          </Show>

          {/* Running / Error labels */}
          <Show when={statusMapped() === 'running'}>
            <span class={css.statusLabelRunning}>Running…</span>
          </Show>
          <Show when={statusMapped() === 'error'}>
            <span class={css.statusLabelError}>Error</span>
          </Show>

          {/* Expanded body */}
          <Show when={effectiveOpen()}>
            <pre style={{
              'margin-top': '6px',
              'white-space': 'pre-wrap',
              'word-break': 'break-word',
              width: '100%',
              padding: '8px 10px',
              'border-radius': '6px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              'font-size': '11px',
              'line-height': '1.5',
              'overflow-x': 'auto',
            }}>
              <code>{formatToolInput(tu().input)}</code>
            </pre>
            <Show when={tu().output}>
              <div style={{
                'margin-top': '6px',
                padding: '6px 8px',
                'border-radius': '4px',
                'font-size': '11px',
                background: tu().isError ? 'rgba(255, 98, 126, 0.08)' : 'rgba(255, 255, 255, 0.04)',
                'border-left': tu().isError ? '2px solid var(--danger, #ff627e)' : '2px solid var(--accent, #7c8aff)',
                width: '100%',
              }}>
                <span style={{
                  'font-weight': '600',
                  'font-size': '10px',
                  'text-transform': 'uppercase',
                  'letter-spacing': '0.5px',
                  color: tu().isError ? 'var(--danger, #ff627e)' : 'var(--accent, #7c8aff)',
                }}>
                  {tu().isError ? 'Error' : 'Result'}
                </span>
                <pre style={{
                  'margin-top': '4px',
                  'white-space': 'pre-wrap',
                  'word-break': 'break-all',
                  color: tu().isError ? 'var(--danger, #ff627e)' : 'inherit',
                }}>
                  {truncatedResult()}
                </pre>
                <Show when={resultIsTruncated()}>
                  <button
                    type="button"
                    aria-label="Show full tool result"
                    onClick={(e) => { e.stopPropagation(); setShowFullResult(true); }}
                    style={{
                      'margin-top': '4px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent, #7c8aff)',
                      cursor: 'pointer',
                      'font-size': '11px',
                      padding: '0',
                      'text-decoration': 'underline',
                    }}
                  >
                    Show more ({((tu().output ?? '').length / 1000).toFixed(1)}K chars)
                  </button>
                </Show>
              </div>
            </Show>
          </Show>
        </div>
      )}
    </Show>
  );
};

// ── ToolUseInlineChip ─────────────────────────────────────────────────
// Renders a tool call directly from ToolUseEntry data (no store lookup).
// Used by ToolGroupChip where grouped items may not have store-backed IDs.

interface ToolUseInlineChipProps {
  entry: ToolUseEntry;
  expandMode?: 'all' | 'none' | 'individual';
}

const ToolUseInlineChip: Component<ToolUseInlineChipProps> = (props) => {
  const [localOpen, setLocalOpen] = createSignal(false);
  const [showFullResult, setShowFullResult] = createSignal(false);

  const effectiveOpen = () => {
    const mode = props.expandMode ?? 'individual';
    if (mode === 'all') return true;
    if (mode === 'none') return false;
    return localOpen();
  };

  const summary = createMemo(() =>
    extractToolSummary(props.entry.name, props.entry.input),
  );

  const IconComponent = () => TOOL_ICON_MAP[summary().iconName] ?? Wrench;

  const statusMapped = (): ToolUseStatus =>
    props.entry.status === 'done' ? 'complete' : props.entry.status;

  const truncatedResult = () => {
    const r = props.entry.result ?? '';
    if (r.length <= RESULT_PREVIEW_LIMIT || showFullResult()) return r;
    return r.slice(0, RESULT_PREVIEW_LIMIT) + '\n...';
  };

  const resultIsTruncated = () =>
    (props.entry.result ?? '').length > RESULT_PREVIEW_LIMIT && !showFullResult();

  const handleClick = () => setLocalOpen(!localOpen());

  return (
    <div
      class={css.toolBlock}
      role="button"
      tabIndex={0}
      aria-expanded={effectiveOpen()}
      aria-label={`Tool call: ${props.entry.name}`}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      style={{ cursor: 'pointer' }}
    >
      {/* Status dot */}
      <Show when={statusMapped() === 'running'}>
        <span class={css.statusDotRunning} />
      </Show>
      <Show when={statusMapped() === 'complete'}>
        <span class={css.statusDotSuccess}>
          <Check size={10} stroke-width={3} />
        </span>
      </Show>
      <Show when={statusMapped() === 'error'}>
        <span class={css.statusDotError}>
          <X size={10} stroke-width={3} />
        </span>
      </Show>

      {/* Tool icon */}
      {(() => {
        const Ic = IconComponent();
        return <Ic size={11} style={{ 'vertical-align': 'middle', 'margin-right': '4px', 'flex-shrink': '0' }} />;
      })()}

      {/* Expand chevron */}
      <Show when={effectiveOpen()} fallback={
        <ChevronRight size={11} style={{ 'vertical-align': 'middle', 'flex-shrink': '0' }} />
      }>
        <ChevronDown size={11} style={{ 'vertical-align': 'middle', 'flex-shrink': '0' }} />
      </Show>

      {/* Tool name */}
      <span style={{ 'margin-left': '4px', 'flex-shrink': '0' }}>{props.entry.name}</span>

      {/* Summary label */}
      <Show when={summary().label}>
        <span class={css.toolNameSep}>—</span>
        <span class={css.toolSummaryLabel} title={summary().label}>
          {summary().label}
        </span>
      </Show>

      {/* Badge */}
      <Show when={summary().badge}>
        <span class={css.toolBadge}>{summary().badge}</span>
      </Show>

      {/* Running / Error labels */}
      <Show when={statusMapped() === 'running'}>
        <span class={css.statusLabelRunning}>Running...</span>
      </Show>
      <Show when={statusMapped() === 'error'}>
        <span class={css.statusLabelError}>Error</span>
      </Show>

      {/* Expanded body */}
      <Show when={effectiveOpen()}>
        <pre style={{
          'margin-top': '6px',
          'white-space': 'pre-wrap',
          'word-break': 'break-word',
          width: '100%',
          padding: '8px 10px',
          'border-radius': '6px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          'font-size': '11px',
          'line-height': '1.5',
          'overflow-x': 'auto',
        }}>
          <code>{formatToolInput(props.entry.input)}</code>
        </pre>
        <Show when={props.entry.result}>
          <div style={{
            'margin-top': '6px',
            padding: '6px 8px',
            'border-radius': '4px',
            'font-size': '11px',
            background: props.entry.resultIsError ? 'rgba(255, 98, 126, 0.08)' : 'rgba(255, 255, 255, 0.04)',
            'border-left': props.entry.resultIsError ? '2px solid var(--danger, #ff627e)' : '2px solid var(--accent, #7c8aff)',
            width: '100%',
          }}>
            <span style={{
              'font-weight': '600',
              'font-size': '10px',
              'text-transform': 'uppercase',
              'letter-spacing': '0.5px',
              color: props.entry.resultIsError ? 'var(--danger, #ff627e)' : 'var(--accent, #7c8aff)',
            }}>
              {props.entry.resultIsError ? 'Error' : 'Result'}
            </span>
            <pre style={{
              'margin-top': '4px',
              'white-space': 'pre-wrap',
              'word-break': 'break-all',
              color: props.entry.resultIsError ? 'var(--danger, #ff627e)' : 'inherit',
            }}>
              {truncatedResult()}
            </pre>
            <Show when={resultIsTruncated()}>
              <button
                type="button"
                aria-label="Show full tool result"
                onClick={(e) => { e.stopPropagation(); setShowFullResult(true); }}
                style={{
                  'margin-top': '4px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent, #7c8aff)',
                  cursor: 'pointer',
                  'font-size': '11px',
                  padding: '0',
                  'text-decoration': 'underline',
                }}
              >
                Show more ({((props.entry.result ?? '').length / 1000).toFixed(1)}K chars)
              </button>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  );
};

// ── ToolGroupChip ─────────────────────────────────────────────────────
// Collapsed group chip for 5+ consecutive same-name tool calls.

interface ToolGroupChipProps {
  group: ToolGroup;
  expandMode: 'all' | 'none' | 'individual';
}

const ToolGroupChip: Component<ToolGroupChipProps> = (props) => {
  const [open, setOpen] = createSignal(false);

  const effectiveOpen = () => {
    const mode = props.expandMode;
    if (mode === 'all') return true;
    if (mode === 'none') return false;
    return open();
  };

  const runningCount = () => props.group.items.filter((i) => i.status === 'running').length;
  const errorCount = () => props.group.items.filter((i) => i.status === 'error').length;
  const IconComponent = () => TOOL_ICON_MAP[extractToolSummary(props.group.name, '{}').iconName] ?? Wrench;

  return (
    <div>
      <div
        class={css.toolGroupHeader}
        role="button"
        tabIndex={0}
        aria-expanded={effectiveOpen()}
        aria-label={`Tool group: ${props.group.name}, ${props.group.items.length} calls`}
        onClick={() => setOpen(!open())}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(!open());
          }
        }}
      >
        {(() => {
          const Ic = IconComponent();
          return <Ic size={11} style={{ 'flex-shrink': '0' }} />;
        })()}
        <Show when={effectiveOpen()} fallback={<ChevronRight size={11} style={{ 'flex-shrink': '0' }} />}>
          <ChevronDown size={11} style={{ 'flex-shrink': '0' }} />
        </Show>
        <span>{props.group.name}</span>
        <span>({props.group.items.length} calls)</span>
        <Show when={runningCount() > 0}>
          <span class={css.statusDotRunning} />
          <span class={css.statusLabelRunning}>{runningCount()} running</span>
        </Show>
        <Show when={errorCount() > 0}>
          <span class={css.statusDotError}><X size={10} stroke-width={3} /></span>
          <span class={css.statusLabelError}>{errorCount()} failed</span>
        </Show>
        <Show when={props.group.previewLabels.length > 0 && !effectiveOpen()}>
          <span class={css.toolNameSep}>—</span>
          <span class={css.toolGroupPreview}>
            {props.group.previewLabels.join(', ')}
          </span>
        </Show>
      </div>
      {/* Expanded: render inline from entry data — items may lack store-backed IDs */}
      <Show when={effectiveOpen()}>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '4px', 'margin-top': '4px', 'padding-left': '12px' }}>
          <For each={props.group.items}>
            {(item) => (
              <Show
                when={item.toolUseId}
                fallback={<ToolUseInlineChip entry={item} expandMode="individual" />}
              >
                <ToolUseChip toolUseId={item.toolUseId!} expandMode="individual" />
              </Show>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

// ── ToolCallsSection ──────────────────────────────────────────────────
// Section wrapper with expand-all / collapse-all toggle + grouping.
// This is the main export for the MessageBubble to use.

interface ToolCallsSectionProps {
  toolUseIds: string[];
}

const ToolCallsSection: Component<ToolCallsSectionProps> = (props) => {
  const [expandMode, setExpandMode] = createSignal<'all' | 'none' | 'individual'>('individual');

  const toggleExpandAll = () => {
    setExpandMode((prev) => (prev === 'all' ? 'none' : 'all'));
  };

  return (
    <>
      <Show when={props.toolUseIds.length > 1}>
        <div class={css.expandToggleRow}>
          <button
            class={css.expandToggleBtn}
            type="button"
            onClick={toggleExpandAll}
            aria-label={expandMode() === 'all' ? 'Collapse all tool calls' : 'Expand all tool calls'}
          >
            {expandMode() === 'all' ? 'Collapse All' : 'Expand All'}
          </button>
          <span class={css.expandToggleCount}>
            {props.toolUseIds.length} tool call{props.toolUseIds.length !== 1 ? 's' : ''}
          </span>
        </div>
      </Show>
      <For each={props.toolUseIds}>
        {(id) => <ToolUseChip toolUseId={id} expandMode={expandMode()} />}
      </For>
    </>
  );
};

export default ToolCallsSection;
export { ToolUseChip, ToolUseInlineChip, ToolGroupChip, ToolCallsSection };
