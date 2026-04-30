// PhantomOS v2 — xterm.js Quick-Fix Lightbulb addon
// Author: Subash Karki
//
// Watches the OSC 633 command timeline for failed commands. When the failed
// command's output matches one of a small set of well-known error patterns
// (port already in use, "did you mean push", non-fast-forward pull, ...) we
// render a small lightbulb decoration over the prompt line. Clicking it
// types the suggested command into the PTY (Ctrl-U first, then the fix) but
// does NOT press Enter — the user reviews and runs it themselves.
//
// Regex table is ported from VS Code:
//   src/vs/workbench/contrib/terminalContrib/quickFix/browser/
//     terminalQuickFixBuiltinActions.ts
//
// SCOPE: regex only. No AI, no settings UI. Pure function from
// `(command, exitCode, outputText)` → `{ label, suggestion } | null`.

import type { IDecoration, IMarker, Terminal } from '@xterm/xterm';

import { writeTerminal } from '../../bindings/terminal';
import * as styles from '../../../styles/quickFix.css';
import {
  type TerminalCommand,
  onCommandFinished,
} from './shellIntegration';

// ---------------------------------------------------------------------------
// Fix table
// ---------------------------------------------------------------------------

interface QuickFix {
  /** Stable identifier (used for logging only). */
  id: string;
  /** Regex matched against the command line itself, e.g. /^git\s+push/. */
  commandRegex: RegExp;
  /** Predicate over the failed command's exit code. */
  matchExit: (code: number | undefined) => boolean;
  /**
   * Examine the output text and return the suggested replacement command
   * plus a label, or null if no fix applies.
   */
  build(
    output: string,
    cmd: TerminalCommand,
  ): { label: string; suggestion: string } | null;
}

const isError = (code: number | undefined): boolean =>
  typeof code === 'number' && code !== 0;
const isSuccess = (code: number | undefined): boolean => code === 0;

const GitCommandLineRegex = /git\b/;
const GitPushCommandLineRegex = /git\s+push\b/;
const GitPushSetUpstreamRegex =
  /git push --set-upstream origin (?<branchName>[^\s]+)/;
const GitTwoDashesRegex = /error: did you mean `--(.+)` \(with two dashes\)\?/;
const GitSimilarOutputRegex = /most similar commands? (?:is|are)/;
const GitFastForwardPullRegex =
  /(?:and can be fast-forwarded|hint:.*fast-forwarded)/i;
const GitNonFastForwardRegex =
  /(?:Updates were rejected because the tip of your current branch is behind|\(non-fast-forward\)|fetch first)/;
const GitCreatePrRegex =
  /remote:\s*(?<link>https:\/\/github\.com\/[^\s]+\/pull\/new\/[^\s]+)/;
const FreePortRegex =
  /(?:address already in use (?:0\.0\.0\.0|127\.0\.0\.1|localhost|::):|EADDRINUSE[^\d]*|Unable to bind [^ ]*:|can't listen on port |listen EADDRINUSE [^ ]*:)(?<portNumber>\d{2,5})/;

const FIXES: QuickFix[] = [
  // 1. git push → "set the upstream"
  {
    id: 'gitPushSetUpstream',
    commandRegex: GitPushCommandLineRegex,
    matchExit: isError,
    build(output) {
      const m = output.match(GitPushSetUpstreamRegex);
      const branch = m?.groups?.branchName;
      if (!branch) return null;
      const suggestion = `git push --set-upstream origin ${branch}`;
      return { label: `Set upstream to origin/${branch}`, suggestion };
    },
  },
  // 2. EADDRINUSE / port in use → kill -9 $(lsof -ti:<port>)
  {
    id: 'freePort',
    commandRegex: /.+/,
    matchExit: isError,
    build(output) {
      const m = output.match(FreePortRegex);
      const port = m?.groups?.portNumber;
      if (!port) return null;
      const suggestion = `kill -9 $(lsof -ti:${port})`;
      return { label: `Free port ${port}`, suggestion };
    },
  },
  // 3. git --foo → git foo
  {
    id: 'gitTwoDashes',
    commandRegex: GitCommandLineRegex,
    matchExit: isError,
    build(output, cmd) {
      const m = output.match(GitTwoDashesRegex);
      const arg = m?.[1];
      if (!arg) return null;
      // Replace ` -<arg>` with ` --<arg>` in the original command.
      const suggestion = cmd.command.replace(` -${arg}`, ` --${arg}`);
      if (suggestion === cmd.command) return null;
      return { label: `Use --${arg}`, suggestion };
    },
  },
  // 4. git puhs → "did you mean push"
  {
    id: 'gitSimilar',
    commandRegex: GitCommandLineRegex,
    matchExit: isError,
    build(output, cmd) {
      const m = output.match(GitSimilarOutputRegex);
      if (!m) return null;
      // The line(s) AFTER the "most similar" header contain candidate
      // subcommands, indented with whitespace. Pick the first.
      const lines = output.split('\n');
      const headerIdx = lines.findIndex((l) => GitSimilarOutputRegex.test(l));
      if (headerIdx === -1) return null;
      for (let i = headerIdx + 1; i < lines.length; i++) {
        const candidate = lines[i].trim();
        if (!candidate) continue;
        // Only accept word-like subcommands (e.g. "push", "status").
        if (!/^[a-z][a-z0-9-]*$/i.test(candidate)) continue;
        const suggestion = cmd.command.replace(/git\s+\S+/, `git ${candidate}`);
        if (suggestion === cmd.command) return null;
        return { label: `Run \`git ${candidate}\``, suggestion };
      }
      return null;
    },
  },
  // 5. git pull non-fast-forward → git pull --rebase
  {
    id: 'gitFastForwardPull',
    commandRegex: /git\s+pull\b/,
    matchExit: (code) => isError(code) || isSuccess(code),
    build(output) {
      // Apply on success when git suggests fast-forward, OR on error for
      // a real non-ff rejection.
      if (
        !GitFastForwardPullRegex.test(output) &&
        !GitNonFastForwardRegex.test(output)
      ) {
        return null;
      }
      return { label: 'Pull with --rebase', suggestion: 'git pull --rebase' };
    },
  },
  // 6. After `git push -u` → gh pr create --fill
  {
    id: 'gitCreatePr',
    commandRegex: GitPushCommandLineRegex,
    matchExit: isSuccess,
    build(output) {
      if (!GitCreatePrRegex.test(output)) return null;
      return { label: 'Create PR with gh', suggestion: 'gh pr create --fill' };
    },
  },
];

// ---------------------------------------------------------------------------
// Terminal-side rendering
// ---------------------------------------------------------------------------

/**
 * Read the output text emitted between `executedMarker` and `endMarker`. When
 * either marker is missing we fall back to the lines between command-start and
 * end (covers shells that don't emit OSC 633;C).
 */
function readOutput(terminal: Terminal, cmd: TerminalCommand): string {
  const startMarker: IMarker | undefined =
    cmd.executedMarker ?? cmd.commandStartMarker;
  const endMarker: IMarker | undefined = cmd.endMarker;
  if (!startMarker || !endMarker) return '';

  const buf = terminal.buffer.active;
  // marker.line is 0-indexed in the *active* buffer; same coordinate space as
  // buf.getLine. Clamp defensively.
  const startLine = Math.max(0, startMarker.line + 1);
  const endLine = Math.max(startLine, endMarker.line);

  const out: string[] = [];
  for (let i = startLine; i <= endLine; i++) {
    const line = buf.getLine(i);
    if (!line) continue;
    out.push(line.translateToString(true));
  }
  return out.join('\n');
}

function findFix(
  terminal: Terminal,
  cmd: TerminalCommand,
): { label: string; suggestion: string } | null {
  if (!cmd.command) return null;
  const output = readOutput(terminal, cmd);
  for (const fix of FIXES) {
    if (!fix.commandRegex.test(cmd.command)) continue;
    if (!fix.matchExit(cmd.exitCode)) continue;
    const result = fix.build(output, cmd);
    if (result) return result;
  }
  return null;
}

/**
 * Build the lightbulb DOM node. Same node used by both decoration and absolute
 * fallback paths; the wrapper just gets positioned differently.
 */
function buildButton(
  label: string,
  suggestion: string,
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = styles.lightbulb;
  btn.title = `${label} — ${suggestion}`;
  btn.setAttribute('aria-label', label);
  btn.textContent = '\u{1F4A1}'; // 💡
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}

/**
 * Anchor `node` over the line containing `marker` using absolute positioning
 * relative to `host`. Used as the fallback when terminal.registerDecoration is
 * not available.
 */
function positionAbsolute(
  host: HTMLElement,
  terminal: Terminal,
  marker: IMarker,
  wrapper: HTMLElement,
): void {
  const buf = terminal.buffer.active;
  const rowFromTop = marker.line - buf.viewportY;
  const xtermEl = host.querySelector('.xterm') as HTMLElement | null;
  const rowHeight =
    (xtermEl?.querySelector('.xterm-rows > div') as HTMLElement | null)
      ?.offsetHeight ?? 18;

  wrapper.style.position = 'absolute';
  wrapper.style.right = '8px';
  wrapper.style.top = `${rowFromTop * rowHeight}px`;
  wrapper.style.zIndex = '20';
  wrapper.style.pointerEvents = 'auto';
  host.appendChild(wrapper);
}

/**
 * Install the quick-fix watcher on `terminal` for `sessionId`. Returns a
 * cleanup function that removes the listener and disposes any active
 * decorations.
 */
export function installQuickFix(
  terminal: Terminal,
  sessionId: string,
  host: HTMLElement,
): () => void {
  const decorations = new Set<IDecoration>();
  const fallbackNodes = new Set<HTMLElement>();

  const handle = (cmd: TerminalCommand): void => {
    const fix = findFix(terminal, cmd);
    if (!fix) return;

    const marker = cmd.commandStartMarker ?? cmd.promptStartMarker;
    if (!marker) return;

    const onClick = (): void => {
      // Ctrl-U clears the current input line, then we type the suggestion.
      // Trailing space is intentional — easier for the user to append flags.
      void writeTerminal(sessionId, `\x15${fix.suggestion} `);
      // Pop the lightbulb after click.
      cleanupOne();
    };

    let cleanupOne: () => void = () => {};

    // Prefer the native decoration API (xterm.js >= 5).
    type RegisterDecoration = Terminal['registerDecoration'];
    const reg = (terminal as { registerDecoration?: RegisterDecoration })
      .registerDecoration;
    if (typeof reg === 'function') {
      const decoration = reg.call(terminal, {
        marker,
        width: 1,
        backgroundColor: undefined,
      });
      if (decoration) {
        decorations.add(decoration);
        decoration.onRender((el) => {
          // Decoration el is a sized box already aligned with the line. Just
          // append our button — ensure we don't double-render on re-render.
          if (el.dataset.qfRendered === '1') return;
          el.dataset.qfRendered = '1';
          el.classList.add(styles.decorationHost);
          el.appendChild(buildButton(fix.label, fix.suggestion, onClick));
        });
        decoration.onDispose(() => decorations.delete(decoration));
        cleanupOne = () => {
          try {
            decoration.dispose();
          } catch {
            /* ignore */
          }
        };
        return;
      }
    }

    // Fallback: absolute-position over the host element.
    const wrapper = document.createElement('div');
    wrapper.appendChild(buildButton(fix.label, fix.suggestion, onClick));
    positionAbsolute(host, terminal, marker, wrapper);
    fallbackNodes.add(wrapper);
    cleanupOne = () => {
      wrapper.remove();
      fallbackNodes.delete(wrapper);
    };
  };

  const unsubscribe = onCommandFinished(sessionId, handle);

  return () => {
    unsubscribe();
    for (const d of decorations) {
      try {
        d.dispose();
      } catch {
        /* ignore */
      }
    }
    decorations.clear();
    for (const n of fallbackNodes) n.remove();
    fallbackNodes.clear();
  };
}
