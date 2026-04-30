// Phantom -- Git blame decorations for Monaco editor
// Author: Subash Karki
//
// Two levels of blame display:
//   Level 1: Current-line inline blame (always on) -- faded text after line content
//   Level 2: Full-file blame gutter (toggle via Cmd+Shift+G) -- grouped by commit
//
// Uses Monaco InjectedTextDecoration, HoverProvider, and createDecorationsCollection.

import type * as MonacoNS from 'monaco-editor';
import type { BlameLine } from '../types';
import { getWorkspaceBlame } from '../bindings/editor';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BlameState {
  /** Blame data for the current file, ordered by line_num (1-based) */
  lines: BlameLine[];
  /** Currently active inline decoration (current line only) */
  inlineDecoration: MonacoNS.editor.IEditorDecorationsCollection | null;
  /** Full-file gutter decorations (when blame view is toggled on) */
  gutterDecorations: MonacoNS.editor.IEditorDecorationsCollection | null;
  /** Whether full-file blame gutter is visible */
  fullBlameVisible: boolean;
  /** Hover provider disposable */
  hoverDisposable: MonacoNS.IDisposable | null;
  /** Cursor change listener disposable */
  cursorDisposable: MonacoNS.IDisposable | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const UNCOMMITTED_PREFIX = '0000000';

/** CSS class names -- defined via globalStyle in editor.css.ts */
const CSS = {
  inlineBlame: 'phantom-blame-inline',
  gutterBlame: 'phantom-blame-gutter',
  blameLineEven: 'phantom-blame-line-even',
  blameLineOdd: 'phantom-blame-line-odd',
} as const;

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

const timeAgo = (unixSeconds: number): string => {
  const seconds = Math.floor(Date.now() / 1000) - unixSeconds;
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
};

/** Truncate string with ellipsis */
const truncate = (str: string, max: number): string =>
  str.length > max ? str.slice(0, max - 1) + '…' : str;

/** Check if a blame commit hash represents an uncommitted line */
const isUncommitted = (commit: string): boolean =>
  commit.startsWith(UNCOMMITTED_PREFIX);

// ---------------------------------------------------------------------------
// BlameManager
// ---------------------------------------------------------------------------

export class BlameManager {
  private monaco: typeof MonacoNS;
  private editor: MonacoNS.editor.IStandaloneCodeEditor;
  private state: BlameState;
  /** Cache: "workspaceId:filePath" -> BlameLine[] */
  private cache = new Map<string, BlameLine[]>();
  /** Toggle action disposable */
  private toggleActionDisposable: MonacoNS.IDisposable | null = null;

  constructor(
    monaco: typeof MonacoNS,
    editor: MonacoNS.editor.IStandaloneCodeEditor,
  ) {
    this.monaco = monaco;
    this.editor = editor;
    this.state = {
      lines: [],
      inlineDecoration: null,
      gutterDecorations: null,
      fullBlameVisible: false,
      hoverDisposable: null,
      cursorDisposable: null,
    };
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Call when a file is opened or tab switches. Fetches blame in background. */
  async activate(workspaceId: string, filePath: string): Promise<void> {
    this.clearDecorations();

    // Check cache first
    const cacheKey = `${workspaceId}:${filePath}`;
    let lines = this.cache.get(cacheKey);
    if (!lines) {
      lines = await getWorkspaceBlame(workspaceId, filePath);
      if (lines.length > 0) {
        this.cache.set(cacheKey, lines);
      }
    }

    this.state.lines = lines;

    if (lines.length === 0) return; // untracked file or error

    // Start current-line blame (always on)
    this.setupCurrentLineBlame();

    // Register hover provider for detailed blame info
    this.setupHoverProvider();

    // If full blame was on before tab switch, re-apply it
    if (this.state.fullBlameVisible) {
      this.applyFullBlameGutter();
    }
  }

  /** Call when EditorPane unmounts or file closes */
  dispose(): void {
    this.clearDecorations();
    this.toggleActionDisposable?.dispose();
    this.toggleActionDisposable = null;
    this.cache.clear();
  }

  /** Invalidate cache for a file (call after save/commit) */
  invalidateCache(workspaceId: string, filePath: string): void {
    this.cache.delete(`${workspaceId}:${filePath}`);
  }

  /** Whether full blame gutter is currently visible */
  isFullBlameVisible(): boolean {
    return this.state.fullBlameVisible;
  }

  // -------------------------------------------------------------------------
  // Level 1: Current Line Blame (always on)
  // -------------------------------------------------------------------------

  private setupCurrentLineBlame(): void {
    // Clean up previous listener
    this.state.cursorDisposable?.dispose();

    // Show blame for initial cursor position
    this.updateCurrentLineDecoration();

    // Update on cursor move
    this.state.cursorDisposable = this.editor.onDidChangeCursorPosition(() => {
      this.updateCurrentLineDecoration();
    });
  }

  private updateCurrentLineDecoration(): void {
    const position = this.editor.getPosition();
    if (!position) return;

    const model = this.editor.getModel();
    if (!model) return;

    // Find blame for this line (blame lines are 1-based via line_num)
    const blame = this.state.lines.find(b => b.line_num === position.lineNumber);
    console.log('[Blame] line', position.lineNumber, 'blame:', blame?.commit?.slice(0, 8), blame?.author);
    if (!blame || isUncommitted(blame.commit)) return;

    const text = `  ${blame.author}, ${timeAgo(blame.date)}`;

    const prevIds = (this.state as any).inlineDecorationIds ?? [];
    const newIds = this.editor.deltaDecorations(prevIds, [
      {
        range: new this.monaco.Range(
          position.lineNumber,
          1,
          position.lineNumber,
          model.getLineMaxColumn(position.lineNumber),
        ),
        options: {
          isWholeLine: true,
          after: {
            content: text,
            inlineClassName: CSS.inlineBlame,
          },
        },
      },
    ]);
    (this.state as any).inlineDecorationIds = newIds;
  }

  // -------------------------------------------------------------------------
  // Level 2: Full File Blame Gutter (toggle-able)
  // -------------------------------------------------------------------------

  /** Toggle full-file blame on/off */
  toggleFullBlame(): void {
    this.state.fullBlameVisible = !this.state.fullBlameVisible;
    if (this.state.fullBlameVisible) {
      this.applyFullBlameGutter();
    } else {
      this.state.gutterDecorations?.clear();
      this.state.gutterDecorations = null;
    }
  }

  private applyFullBlameGutter(): void {
    this.state.gutterDecorations?.clear();

    if (this.state.lines.length === 0) return;

    // Group consecutive lines by commit for visual grouping
    const decorations: MonacoNS.editor.IModelDeltaDecoration[] = [];
    let groupIndex = 0;
    let prevCommit = '';

    for (let i = 0; i < this.state.lines.length; i++) {
      const blame = this.state.lines[i];
      const lineNumber = blame.line_num;

      // Toggle group index on commit boundary
      if (blame.commit !== prevCommit) {
        groupIndex++;
        prevCommit = blame.commit;
      }

      const isGroupStart = i === 0 || this.state.lines[i - 1].commit !== blame.commit;
      const uncommitted = isUncommitted(blame.commit);

      // Only show author+date on the first line of each commit group
      const gutterText = isGroupStart && !uncommitted
        ? `${truncate(blame.author, 12)} ${timeAgo(blame.date)}`
        : '';

      decorations.push({
        range: new this.monaco.Range(lineNumber, 1, lineNumber, 1),
        options: {
          isWholeLine: true,
          // Alternating background for visual grouping
          className: groupIndex % 2 === 0 ? CSS.blameLineEven : CSS.blameLineOdd,
          // Gutter text via injected before-content
          ...(gutterText
            ? {
                before: {
                  content: gutterText,
                  inlineClassName: CSS.gutterBlame,
                  cursorStops: this.monaco.editor.InjectedTextCursorStops.None,
                },
              }
            : {}),
          // Color-code by recency in overview ruler
          overviewRuler: !uncommitted
            ? {
                color: this.getRecencyColor(blame.date),
                position: this.monaco.editor.OverviewRulerLane.Right,
              }
            : undefined,
        },
      });
    }

    this.state.gutterDecorations = this.editor.createDecorationsCollection(decorations);
  }

  /** Map unix timestamp to a color -- recent = brighter, old = more muted */
  private getRecencyColor(unixSeconds: number): string {
    const ageSeconds = Math.floor(Date.now() / 1000) - unixSeconds;
    const ageDays = ageSeconds / 86400;

    if (ageDays < 1) return 'rgba(78, 201, 176, 0.8)';   // today - bright teal
    if (ageDays < 7) return 'rgba(78, 201, 176, 0.5)';   // this week
    if (ageDays < 30) return 'rgba(78, 201, 176, 0.3)';  // this month
    if (ageDays < 90) return 'rgba(128, 128, 128, 0.3)'; // this quarter
    return 'rgba(128, 128, 128, 0.15)';                   // older
  }

  // -------------------------------------------------------------------------
  // Hover Provider
  // -------------------------------------------------------------------------

  private setupHoverProvider(): void {
    this.state.hoverDisposable?.dispose();

    this.state.hoverDisposable = this.monaco.languages.registerHoverProvider('*', {
      provideHover: (model, position) => {
        // Only respond for the active editor's model
        if (model !== this.editor.getModel()) return null;

        const blame = this.state.lines.find(b => b.line_num === position.lineNumber);
        if (!blame || isUncommitted(blame.commit)) return null;

        const dateStr = new Date(blame.date * 1000).toLocaleString();

        return {
          range: new this.monaco.Range(
            position.lineNumber, 1,
            position.lineNumber, model.getLineLength(position.lineNumber) + 1,
          ),
          contents: [
            { value: '**Git Blame**' },
            {
              value: [
                '```',
                `Commit:  ${blame.commit.slice(0, 12)}`,
                `Author:  ${blame.author}`,
                `Date:    ${dateStr} (${timeAgo(blame.date)})`,
                '```',
              ].join('\n'),
            },
          ],
        };
      },
    });
  }

  // -------------------------------------------------------------------------
  // Editor Action (Cmd+Shift+G toggle)
  // -------------------------------------------------------------------------

  /** Register the toggle action. Call once per editor instance. */
  registerToggleAction(): void {
    this.toggleActionDisposable?.dispose();
    this.toggleActionDisposable = this.editor.addAction({
      id: 'phantom.toggleBlame',
      label: 'Toggle Git Blame',
      keybindings: [
        this.monaco.KeyMod.CtrlCmd | this.monaco.KeyMod.Shift | this.monaco.KeyCode.KeyG,
      ],
      contextMenuGroupId: 'phantom',
      contextMenuOrder: 2,
      run: () => {
        this.toggleFullBlame();
      },
    });
  }

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------

  private clearDecorations(): void {
    this.state.inlineDecoration?.clear();
    this.state.inlineDecoration = null;
    this.state.gutterDecorations?.clear();
    this.state.gutterDecorations = null;
    this.state.hoverDisposable?.dispose();
    this.state.hoverDisposable = null;
    this.state.cursorDisposable?.dispose();
    this.state.cursorDisposable = null;
    this.state.lines = [];
  }
}
