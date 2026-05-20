// Author: Subash Karki

export type LineChangeType = 'add' | 'remove' | 'same'

export interface WordSegment {
  text: string
  type: 'add' | 'remove' | 'same'
}

export interface DiffLine {
  type: LineChangeType
  text: string
  oldLineNumber: number | null
  newLineNumber: number | null
  wordSegments?: WordSegment[]
}

export interface DiffHunk {
  lines: DiffLine[]
  hiddenLinesBefore: number
  /** The collapsed context lines, stored so they can be shown when expanded */
  hiddenLines?: DiffLine[]
}

export interface DiffResult {
  hunks: DiffHunk[]
  stats: { added: number; removed: number }
  totalHiddenLines: number
}

export type DiffViewMode = 'split' | 'unified'

export interface DiffViewerProps {
  originalContent: string
  modifiedContent: string
  mode?: DiffViewMode
  contextLines?: number
  collapseThreshold?: number
  wordDiffMaxHunkSize?: number
  class?: string
}
