// Author: Subash Karki

import {
  createMemo,
  createSignal,
  createEffect,
  For,
  Show,
  type Component,
  on,
} from 'solid-js'
import { computeDiff } from './diff-engine'
import type {
  DiffViewerProps,
  DiffLine,
  DiffHunk,
  DiffViewMode,
  WordSegment,
  LineChangeType,
} from './types'
import * as s from './DiffViewer.css'

// ── Helpers ──

function lineRowClass(type: LineChangeType): string {
  if (type === 'add') return s.lineRowAdd
  if (type === 'remove') return s.lineRowRemove
  return ''
}

function prefixFor(type: LineChangeType): string {
  if (type === 'add') return '+'
  if (type === 'remove') return '-'
  return ' '
}

function wordClass(type: WordSegment['type']): string {
  if (type === 'add') return s.wordAdd
  if (type === 'remove') return s.wordRemove
  return ''
}

// ── Line Row (shared between unified & split) ──

interface LineRowProps {
  line: DiffLine
  showOldGutter?: boolean
  showNewGutter?: boolean
  showPrefix?: boolean
}

const LineRow: Component<LineRowProps> = (props) => {
  return (
    <div class={`${s.lineRow} ${lineRowClass(props.line.type)}`}>
      <Show when={props.showOldGutter !== false}>
        <span class={s.gutterOld}>{props.line.oldLineNumber ?? ''}</span>
      </Show>
      <Show when={props.showNewGutter !== false}>
        <span class={s.gutterNew}>{props.line.newLineNumber ?? ''}</span>
      </Show>
      <Show when={props.showPrefix !== false}>
        <span class={s.gutterPrefix}>{prefixFor(props.line.type)}</span>
      </Show>
      <span class={s.lineContent}>
        <Show when={props.line.wordSegments} fallback={props.line.text || ' '}>
          <For each={props.line.wordSegments}>
            {(seg) => (
              <span class={wordClass(seg.type)}>{seg.text}</span>
            )}
          </For>
        </Show>
      </span>
    </div>
  )
}

// ── Empty placeholder row for split view alignment ──

const EmptyRow: Component<{ showGutter?: boolean }> = (props) => {
  return (
    <div class={`${s.lineRow} ${s.emptyLine}`}>
      <Show when={props.showGutter !== false}>
        <span class={s.gutterOld}>{''}</span>
      </Show>
      <span class={s.gutterPrefix}>{''}</span>
      <span class={s.lineContent}>{' '}</span>
    </div>
  )
}

// ── Split View ──

interface SplitPair {
  old: DiffLine | null
  new: DiffLine | null
}

function buildSplitPairs(lines: DiffLine[]): SplitPair[] {
  const pairs: SplitPair[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.type === 'same') {
      pairs.push({ old: line, new: line })
      i++
      continue
    }

    // Collect contiguous remove + add block
    const removes: DiffLine[] = []
    const adds: DiffLine[] = []

    while (i < lines.length && lines[i].type === 'remove') {
      removes.push(lines[i])
      i++
    }
    while (i < lines.length && lines[i].type === 'add') {
      adds.push(lines[i])
      i++
    }

    const maxLen = Math.max(removes.length, adds.length)
    for (let j = 0; j < maxLen; j++) {
      pairs.push({
        old: j < removes.length ? removes[j] : null,
        new: j < adds.length ? adds[j] : null,
      })
    }
  }

  return pairs
}

interface SplitViewProps {
  hunks: DiffHunk[]
  expandedSections: Set<number>
  onToggleExpand: (idx: number) => void
}

const SplitView: Component<SplitViewProps> = (props) => {
  let oldPanelRef: HTMLDivElement | undefined
  let newPanelRef: HTMLDivElement | undefined
  let syncing = false

  const handleScroll = (source: 'old' | 'new') => {
    if (syncing) return
    syncing = true
    const srcEl = source === 'old' ? oldPanelRef : newPanelRef
    const tgtEl = source === 'old' ? newPanelRef : oldPanelRef
    if (srcEl && tgtEl) {
      tgtEl.scrollTop = srcEl.scrollTop
    }
    syncing = false
  }

  return (
    <div class={s.splitContainer}>
      <div
        ref={oldPanelRef}
        class={s.splitPanel}
        onScroll={() => handleScroll('old')}
      >
        <div class={s.diffTable}>
          <For each={props.hunks}>
            {(hunk, hunkIdx) => <>
              <Show when={hunk.hiddenLinesBefore > 0 && !props.expandedSections.has(hunkIdx())}>
                <div
                  class={s.collapseBar}
                  onClick={() => props.onToggleExpand(hunkIdx())}
                >
                  {hunk.hiddenLinesBefore} hidden lines
                </div>
              </Show>
              <Show when={hunk.hiddenLinesBefore > 0 && props.expandedSections.has(hunkIdx()) && hunk.hiddenLines}>
                <For each={hunk.hiddenLines}>
                  {(line) => (
                    <LineRow line={line} showNewGutter={false} showPrefix={false} />
                  )}
                </For>
              </Show>
              <For each={buildSplitPairs(hunk.lines)}>
                {(pair) => (
                  <Show when={pair.old} fallback={<EmptyRow showGutter />}>
                    <LineRow line={pair.old!} showNewGutter={false} showPrefix={false} />
                  </Show>
                )}
              </For>
            </>}
          </For>
        </div>
      </div>
      <div
        ref={newPanelRef}
        class={s.splitPanel}
        onScroll={() => handleScroll('new')}
      >
        <div class={s.diffTable}>
          <For each={props.hunks}>
            {(hunk, hunkIdx) => <>
              <Show when={hunk.hiddenLinesBefore > 0 && !props.expandedSections.has(hunkIdx())}>
                <div
                  class={s.collapseBar}
                  onClick={() => props.onToggleExpand(hunkIdx())}
                >
                  {hunk.hiddenLinesBefore} hidden lines
                </div>
              </Show>
              <Show when={hunk.hiddenLinesBefore > 0 && props.expandedSections.has(hunkIdx()) && hunk.hiddenLines}>
                <For each={hunk.hiddenLines}>
                  {(line) => (
                    <LineRow line={line} showOldGutter={false} showPrefix={false} />
                  )}
                </For>
              </Show>
              <For each={buildSplitPairs(hunk.lines)}>
                {(pair) => (
                  <Show when={pair.new} fallback={<EmptyRow showGutter />}>
                    <LineRow line={pair.new!} showOldGutter={false} showPrefix={false} />
                  </Show>
                )}
              </For>
            </>}
          </For>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ──

const DiffViewer: Component<DiffViewerProps> = (props) => {
  const [viewMode, setViewMode] = createSignal<DiffViewMode>(props.mode ?? 'unified')
  const [expandedSections, setExpandedSections] = createSignal<Set<number>>(new Set())

  const diffResult = createMemo(() =>
    computeDiff(props.originalContent, props.modifiedContent, {
      contextLines: props.contextLines,
      collapseThreshold: props.collapseThreshold,
      wordDiffMaxHunkSize: props.wordDiffMaxHunkSize,
    }),
  )

  // Reset expanded sections when content changes
  createEffect(
    on(
      () => [props.originalContent, props.modifiedContent],
      () => setExpandedSections(new Set<number>()),
    ),
  )

  const toggleExpand = (idx: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) {
        next.delete(idx)
      } else {
        next.add(idx)
      }
      return next
    })
  }

  return (
    <div class={`${s.container} ${props.class ?? ''}`}>
      {/* Stats bar */}
      <div class={s.statsBar}>
        <span class={s.statAdd}>+{diffResult().stats.added}</span>
        <span class={s.statRemove}>-{diffResult().stats.removed}</span>
      </div>

      {/* Toolbar */}
      <div class={s.toolbar}>
        <button
          class={s.toolbarBtn}
          data-active={viewMode() === 'unified'}
          onClick={() => setViewMode('unified')}
        >
          Unified
        </button>
        <button
          class={s.toolbarBtn}
          data-active={viewMode() === 'split'}
          onClick={() => setViewMode('split')}
        >
          Split
        </button>
      </div>

      {/* Unified view */}
      <Show when={viewMode() === 'unified'}>
        <div class={s.scrollArea}>
          <div class={s.diffTable}>
            <For each={diffResult().hunks}>
              {(hunk, hunkIdx) => <>
                {/* Collapse bar for hidden lines */}
                <Show when={hunk.hiddenLinesBefore > 0 && !expandedSections().has(hunkIdx())}>
                  <div
                    class={s.collapseBar}
                    onClick={() => toggleExpand(hunkIdx())}
                  >
                    Show {hunk.hiddenLinesBefore} hidden lines
                  </div>
                </Show>
                {/* Expanded hidden lines */}
                <Show when={hunk.hiddenLinesBefore > 0 && expandedSections().has(hunkIdx()) && hunk.hiddenLines}>
                  <For each={hunk.hiddenLines}>
                    {(line) => <LineRow line={line} />}
                  </For>
                </Show>
                {/* Hunk lines */}
                <For each={hunk.lines}>
                  {(line) => <LineRow line={line} />}
                </For>
              </>}
            </For>
          </div>
        </div>
      </Show>

      {/* Split view */}
      <Show when={viewMode() === 'split'}>
        <SplitView
          hunks={diffResult().hunks}
          expandedSections={expandedSections()}
          onToggleExpand={toggleExpand}
        />
      </Show>
    </div>
  )
}

export default DiffViewer
