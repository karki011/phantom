// Author: Subash Karki

import * as Diff from 'diff'
import type { DiffLine, DiffHunk, DiffResult, WordSegment, LineChangeType } from './types'

export interface ComputeDiffOptions {
  contextLines?: number
  collapseThreshold?: number
  wordDiffMaxHunkSize?: number
}

/**
 * Compute a structured diff between two strings.
 * Returns hunks with context collapsing and optional word-level highlighting.
 */
export function computeDiff(
  original: string,
  modified: string,
  options?: ComputeDiffOptions,
): DiffResult {
  const contextLines = options?.contextLines ?? 3
  const collapseThreshold = options?.collapseThreshold ?? 4
  const wordDiffMaxHunkSize = options?.wordDiffMaxHunkSize ?? 8

  // 1. Line-level diff
  const changes = Diff.diffLines(original, modified)

  // 2. Build flat DiffLine array
  const flatLines = buildFlatLines(changes)

  // 3. Apply word-level diffs to adjacent remove/add groups
  applyWordDiffs(flatLines, wordDiffMaxHunkSize)

  // 4. Group into hunks with context collapsing
  const { hunks, totalHiddenLines } = groupIntoHunks(flatLines, contextLines, collapseThreshold)

  // 5. Compute stats
  let added = 0
  let removed = 0
  for (const line of flatLines) {
    if (line.type === 'add') added++
    if (line.type === 'remove') removed++
  }

  return { hunks, stats: { added, removed }, totalHiddenLines }
}

function buildFlatLines(changes: Diff.Change[]): DiffLine[] {
  const lines: DiffLine[] = []
  let oldLineNum = 1
  let newLineNum = 1

  for (const change of changes) {
    const rawLines = splitLines(change.value)

    let type: LineChangeType
    if (change.added) {
      type = 'add'
    } else if (change.removed) {
      type = 'remove'
    } else {
      type = 'same'
    }

    for (const text of rawLines) {
      const line: DiffLine = {
        type,
        text,
        oldLineNumber: null,
        newLineNumber: null,
      }

      if (type === 'same') {
        line.oldLineNumber = oldLineNum++
        line.newLineNumber = newLineNum++
      } else if (type === 'remove') {
        line.oldLineNumber = oldLineNum++
      } else {
        line.newLineNumber = newLineNum++
      }

      lines.push(line)
    }
  }

  return lines
}

/**
 * Split a change value into lines, trimming the trailing empty string
 * that results from a trailing newline.
 */
function splitLines(value: string): string[] {
  const parts = value.split('\n')
  if (parts.length > 0 && parts[parts.length - 1] === '') {
    parts.pop()
  }
  return parts
}

function applyWordDiffs(lines: DiffLine[], maxHunkSize: number): void {
  let i = 0
  while (i < lines.length) {
    if (lines[i].type !== 'remove') {
      i++
      continue
    }

    const removeStart = i
    while (i < lines.length && lines[i].type === 'remove') i++
    const removeEnd = i

    const addStart = i
    while (i < lines.length && lines[i].type === 'add') i++
    const addEnd = i

    const removeCount = removeEnd - removeStart
    const addCount = addEnd - addStart

    if (addCount === 0) continue
    if (removeCount + addCount > maxHunkSize) continue

    const pairCount = Math.min(removeCount, addCount)
    for (let j = 0; j < pairCount; j++) {
      const removeLine = lines[removeStart + j]
      const addLine = lines[addStart + j]
      const wordChanges = Diff.diffWords(removeLine.text, addLine.text)

      removeLine.wordSegments = buildWordSegments(wordChanges, 'remove')
      addLine.wordSegments = buildWordSegments(wordChanges, 'add')
    }
  }
}

/**
 * Build word segments for one side of a word diff.
 * 'remove' side: unchanged + removed parts (skip added).
 * 'add' side: unchanged + added parts (skip removed).
 */
function buildWordSegments(
  wordChanges: Diff.Change[],
  side: 'remove' | 'add',
): WordSegment[] {
  const segments: WordSegment[] = []

  for (const change of wordChanges) {
    if (change.added && side === 'remove') continue
    if (change.removed && side === 'add') continue

    let segType: 'add' | 'remove' | 'same'
    if (change.added) {
      segType = 'add'
    } else if (change.removed) {
      segType = 'remove'
    } else {
      segType = 'same'
    }

    segments.push({ text: change.value, type: segType })
  }

  return segments
}

/**
 * Group flat lines into hunks, collapsing long runs of 'same' lines.
 *
 * Each hunk has:
 * - `hiddenLinesBefore`: count of collapsed context lines above this hunk
 * - `hiddenLines`: the actual collapsed DiffLine[] (for expand)
 * - `lines`: the visible lines in this hunk
 */
function groupIntoHunks(
  lines: DiffLine[],
  contextLines: number,
  collapseThreshold: number,
): { hunks: DiffHunk[]; totalHiddenLines: number } {
  if (lines.length === 0) {
    return { hunks: [{ lines: [], hiddenLinesBefore: 0 }], totalHiddenLines: 0 }
  }

  // Find indices of all changed (non-same) lines
  const changedIndices: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== 'same') changedIndices.push(i)
  }

  // If no changes at all, show everything as one hunk
  if (changedIndices.length === 0) {
    // Collapse if too many lines
    if (lines.length > contextLines * 2 + collapseThreshold) {
      const topContext = lines.slice(0, contextLines)
      const bottomContext = lines.slice(lines.length - contextLines)
      const hidden = lines.slice(contextLines, lines.length - contextLines)
      return {
        hunks: [
          { lines: topContext, hiddenLinesBefore: 0 },
          { lines: bottomContext, hiddenLinesBefore: hidden.length, hiddenLines: hidden },
        ],
        totalHiddenLines: hidden.length,
      }
    }
    return { hunks: [{ lines, hiddenLinesBefore: 0 }], totalHiddenLines: 0 }
  }

  // Build visible ranges: each changed region expanded by contextLines
  const ranges: Array<{ start: number; end: number }> = []
  let rStart = Math.max(0, changedIndices[0] - contextLines)
  let rEnd = Math.min(lines.length, changedIndices[0] + contextLines + 1)

  for (let c = 1; c < changedIndices.length; c++) {
    const newStart = Math.max(0, changedIndices[c] - contextLines)
    const newEnd = Math.min(lines.length, changedIndices[c] + contextLines + 1)

    // Merge if gap between ranges is smaller than collapseThreshold
    if (newStart - rEnd < collapseThreshold) {
      rEnd = newEnd
    } else {
      ranges.push({ start: rStart, end: rEnd })
      rStart = newStart
      rEnd = newEnd
    }
  }
  ranges.push({ start: rStart, end: rEnd })

  // Build hunks from ranges
  const hunks: DiffHunk[] = []
  let totalHiddenLines = 0

  for (let r = 0; r < ranges.length; r++) {
    const range = ranges[r]
    let hiddenCount: number
    let hiddenLines: DiffLine[] | undefined

    if (r === 0) {
      // Lines before first visible range
      hiddenCount = range.start
      hiddenLines = hiddenCount > 0 ? lines.slice(0, range.start) : undefined
    } else {
      // Gap between previous range end and this range start
      const prevEnd = ranges[r - 1].end
      hiddenCount = range.start - prevEnd
      hiddenLines = hiddenCount > 0 ? lines.slice(prevEnd, range.start) : undefined
    }

    totalHiddenLines += hiddenCount

    hunks.push({
      lines: lines.slice(range.start, range.end),
      hiddenLinesBefore: hiddenCount,
      hiddenLines,
    })
  }

  // Trailing hidden lines after last visible range
  const lastEnd = ranges[ranges.length - 1].end
  if (lastEnd < lines.length) {
    const trailingHidden = lines.slice(lastEnd)
    totalHiddenLines += trailingHidden.length
    // Add a trailing hunk marker so the UI can show "N hidden lines" at the bottom
    hunks.push({
      lines: [],
      hiddenLinesBefore: trailingHidden.length,
      hiddenLines: trailingHidden,
    })
  }

  return { hunks, totalHiddenLines }
}
