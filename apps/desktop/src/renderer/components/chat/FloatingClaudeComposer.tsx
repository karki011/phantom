/**
 * FloatingClaudeComposer — bottom-anchored, persistent prompt composer.
 * Opens with Cmd+I. Instead of starting a new conversation, it injects the
 * typed text into whichever terminal pane was active when the composer was
 * opened — so a Claude terminal just sees it as if the user had typed.
 *
 * Why terminal injection (not a new chat transport): the user wants "room to
 * write" for prompts that still run through their existing Claude CLI
 * session — preserving MCP, skills, permissions, and conversation state.
 *
 * @author Subash Karki
 */
import { ActionIcon, Badge, Button, Select, Textarea } from '@mantine/core';
import { useAtom, useAtomValue } from 'jotai';
import { MessageSquareText, Slash, TerminalIcon, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { usePaneStore, jotaiStore, activeTabAtom, paneStateAtom } from '@phantom-os/panes';
import { getSession } from '@phantom-os/terminal';

import { CLAUDE_SLASH_COMMANDS, type ClaudeSlashCommand } from '../../commands/claudeSlashCommands';
import { lastTerminalPaneIdAtom } from '../../atoms/chatDraft';

interface DiscoveredCommand {
  name: string;
  description: string;
  source: 'skill' | 'user-command' | 'project-command';
}

interface TerminalOption {
  paneId: string;
  tabId: string;
  tabLabel: string;
  title: string;
}
// getSession returns the live xterm + WebSocket handle for a given pane id
// (packages/terminal/src/state.ts:108).

import { activeWorktreeAtom } from '../../atoms/worktrees';
import { chatDraftFamily, composerOpenAtom } from '../../atoms/chatDraft';

// ---------------------------------------------------------------------------

export const FloatingClaudeComposer = () => {
  const [open, setOpen] = useAtom(composerOpenAtom);
  const worktree = useAtomValue(activeWorktreeAtom);

  const draftKey = worktree?.id ?? '__none__';
  const [draft, setDraft] = useAtom(chatDraftFamily(draftKey));

  const store = usePaneStore();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Snapshot the terminal pane that was active when the composer opened.
  // State (not ref) so the Textarea's `disabled` prop re-evaluates after we
  // find a target — otherwise the initial render sees null and locks itself.
  const [targetPaneId, setTargetPaneId] = useState<string | null>(null);

  // All open terminal panes across all tabs — used for the target dropdown
  // so users with split terminals can pick which one to send to.
  const [allTerminals, setAllTerminals] = useState<TerminalOption[]>([]);

  // The last-focused terminal pane id — reliable "where did I last type".
  const lastTerminalPaneId = useAtomValue(lastTerminalPaneIdAtom);

  // Skills + user/project commands discovered by the server on open.
  const [discovered, setDiscovered] = useState<DiscoveredCommand[]>([]);

  useEffect(() => {
    if (!open) {
      setTargetPaneId(null);
      setAllTerminals([]);
      return;
    }

    // Enumerate all terminal panes across every tab so the user can pick
    // explicitly if they have splits open.
    const workspace = jotaiStore.get(paneStateAtom);
    const terminals: TerminalOption[] = [];
    for (const tab of workspace.tabs) {
      for (const pane of Object.values(tab.panes)) {
        if (pane.kind === 'terminal') {
          terminals.push({
            paneId: pane.id,
            tabId: tab.id,
            tabLabel: tab.label,
            title: pane.title ?? 'Terminal',
          });
        }
      }
    }
    // Sort: active tab first, then by createdAt descending within each tab.
    terminals.sort((a, b) => {
      if (a.tabId === workspace.activeTabId && b.tabId !== workspace.activeTabId) return -1;
      if (b.tabId === workspace.activeTabId && a.tabId !== workspace.activeTabId) return 1;
      return a.title.localeCompare(b.title);
    });
    setAllTerminals(terminals);

    // Choose target: active pane > last-focused terminal > newest terminal in
    // the active tab > any terminal.
    const active = store.getActivePane();
    const pickFrom = (id: string | null | undefined) =>
      id && terminals.some((t) => t.paneId === id) ? id : null;

    const picked =
      (active?.kind === 'terminal' ? active.id : null) ??
      pickFrom(lastTerminalPaneId) ??
      terminals[0]?.paneId ??
      null;
    setTargetPaneId(picked);

    // Blur the currently-focused element first — xterm aggressively holds
    // keyboard focus, so we have to take it before Mantine's ref lands.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    // Fetch skills + custom commands from the server. Server caches for 30s.
    const wt = worktree?.id ?? '';
    fetch(`/api/claude/slash-commands?worktreeId=${encodeURIComponent(wt)}`)
      .then((r) => (r.ok ? r.json() : { commands: [] }))
      .then((j: { commands: DiscoveredCommand[] }) => {
        setDiscovered(Array.isArray(j.commands) ? j.commands : []);
      })
      .catch(() => setDiscovered([]));

    // Two rAFs: first paints the mount, second gives Mantine time to wire
    // its internal ref before we grab focus.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, [open, store, worktree?.id, lastTerminalPaneId]);

  // ── Slash-command picker ────────────────────────────────────────────────
  // Detect a `/foo` fragment at the cursor that starts at col 0 of a line
  // (matches how slash commands work in Claude CLI and in most chat UIs).
  // When present, open a picker and filter CLAUDE_SLASH_COMMANDS.
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);

  const detectSlashQuery = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return null;
    const pos = el.selectionStart ?? 0;
    const before = draft.slice(0, pos);
    // Match the current line's prefix: must start at position 0 or after a \n
    const lineStart = Math.max(0, before.lastIndexOf('\n') + 1);
    const line = before.slice(lineStart);
    // Activate while the line is a valid command fragment: a slash followed by
    // letters/digits and any of : _ - / . (colons for namespaces like
    // `team:start`, dots for nested names). Whitespace closes the picker.
    const match = /^\/([a-zA-Z][a-zA-Z0-9:_\-./]*)?$/.exec(line);
    return match ? (match[1] ?? '') : null;
  }, [draft]);

  useEffect(() => {
    const q = detectSlashQuery();
    setSlashQuery(q);
    setSlashIndex(0);
  }, [draft, detectSlashQuery]);

  // Built-in commands always carry source: 'builtin'; discovered carry theirs.
  type MergedCommand = ClaudeSlashCommand & {
    source: 'builtin' | 'skill' | 'user-command' | 'project-command';
  };

  const allCommands = useMemo<MergedCommand[]>(() => {
    const builtins: MergedCommand[] = CLAUDE_SLASH_COMMANDS.map((c) => ({
      ...c,
      source: 'builtin',
    }));
    const extra: MergedCommand[] = discovered.map((c) => ({
      name: c.name,
      description: c.description,
      source: c.source,
    }));
    // Dedupe by name — discovered overrides builtin (user customized it).
    const byName = new Map<string, MergedCommand>();
    for (const c of builtins) byName.set(c.name, c);
    for (const c of extra) byName.set(c.name, c);
    return [...byName.values()];
  }, [discovered]);

  const filteredSlash = useMemo<MergedCommand[]>(() => {
    if (slashQuery === null) return [];
    if (!slashQuery) return allCommands.slice(0, 40);
    const q = slashQuery.toLowerCase();
    const prefix = allCommands.filter((c) => c.name.toLowerCase().startsWith(q));
    const other = allCommands.filter(
      (c) => !c.name.toLowerCase().startsWith(q) && c.name.toLowerCase().includes(q),
    );
    return [...prefix, ...other].slice(0, 40);
  }, [slashQuery, allCommands]);

  const applySlashCommand = useCallback(
    (cmd: ClaudeSlashCommand) => {
      const el = textareaRef.current;
      if (!el) return;
      const pos = el.selectionStart ?? draft.length;
      const before = draft.slice(0, pos);
      const after = draft.slice(pos);
      const lineStart = Math.max(0, before.lastIndexOf('\n') + 1);
      // Replace the `/partial` fragment with the full command.
      // Add a trailing space if the command accepts an argument.
      const trailing = cmd.takesArg ? ' ' : '';
      const next = before.slice(0, lineStart) + '/' + cmd.name + trailing + after;
      setDraft(next);
      setSlashQuery(null);
      // After React commits the new value, move the caret to just after the
      // inserted command.
      const newCursor = lineStart + 1 + cmd.name.length + trailing.length;
      requestAnimationFrame(() => {
        const el2 = textareaRef.current;
        if (!el2) return;
        el2.setSelectionRange(newCursor, newCursor);
        el2.focus();
      });
    },
    [draft, setDraft],
  );

  const injectIntoTerminal = useCallback((text: string): boolean => {
    if (!targetPaneId) return false;
    const session = getSession(targetPaneId);
    if (!session?.ws || session.ws.readyState !== WebSocket.OPEN) return false;
    // Append \r so the terminal submits the input (same effect as pressing
    // Enter in a shell). xterm/pty translate \r to newline + submit.
    session.ws.send(JSON.stringify({ type: 'input', data: `${text}\r` }));
    return true;
  }, [targetPaneId]);

  const handleSend = useCallback(() => {
    if (!draft.trim()) return;
    const ok = injectIntoTerminal(draft.trim());
    if (!ok) {
      // No terminal target — surface the error inline. User can open a
      // terminal, focus it, then reopen the composer.
      return;
    }
    setDraft('');
    setOpen(false);
  }, [draft, injectIntoTerminal, setDraft, setOpen]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // When the slash picker is open, arrow/enter/esc are consumed by it.
      if (slashQuery !== null && filteredSlash.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSlashIndex((i) => (i + 1) % filteredSlash.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSlashIndex((i) => (i - 1 + filteredSlash.length) % filteredSlash.length);
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          applySlashCommand(filteredSlash[slashIndex]);
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          applySlashCommand(filteredSlash[slashIndex]);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setSlashQuery(null);
          return;
        }
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSend();
      }
    },
    [setOpen, handleSend, slashQuery, filteredSlash, slashIndex, applySlashCommand],
  );

  if (!open) return null;

  const hasTerminalTarget = targetPaneId !== null;
  // When the draft is a "pure" slash command (starts with /command, no
  // arguments/following text), paint the whole textarea cyan so the user
  // sees at a glance that this is a command-mode prompt. Since native
  // <textarea> can't color individual tokens, we tint the whole input.
  const isPureSlashCommand = /^\/[a-zA-Z][a-zA-Z0-9:_\-./]*\s*$/.test(draft);
  const canSend = hasTerminalTarget && draft.trim().length > 0;

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-end',
        paddingBottom: 40,
        background: 'transparent',
        pointerEvents: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(720px, 92vw)',
          background: 'var(--phantom-surface-card)',
          border: '1px solid var(--phantom-border-subtle)',
          borderRadius: 14,
          boxShadow:
            '0 24px 64px rgba(0,0,0,0.45), 0 0 0 1px color-mix(in srgb, var(--phantom-accent-cyan, #00d4ff) 25%, transparent)',
          overflow: 'hidden',
          backdropFilter: 'blur(6px)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            borderBottom: '1px solid var(--phantom-border-subtle)',
            fontSize: 11,
            color: 'var(--phantom-text-muted)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageSquareText
              size={13}
              style={{ color: 'var(--phantom-accent-cyan, #00d4ff)' }}
            />
            <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>⌘I</span>
            <span>·</span>
            <span>Send to Terminal</span>
            {allTerminals.length > 0 ? (
              <Select
                size="xs"
                value={targetPaneId}
                onChange={(v) => setTargetPaneId(v)}
                data={allTerminals.map((t) => ({
                  value: t.paneId,
                  label: `${t.title} · ${t.tabLabel}`,
                }))}
                leftSection={
                  <TerminalIcon size={11} style={{ color: 'var(--phantom-accent-cyan)' }} />
                }
                allowDeselect={false}
                styles={{
                  input: {
                    background: 'var(--phantom-surface-elevated)',
                    borderColor: 'color-mix(in srgb, var(--phantom-accent-cyan, #00d4ff) 30%, transparent)',
                    color: 'var(--phantom-accent-cyan)',
                    fontSize: 11,
                    fontFamily: 'JetBrains Mono, monospace',
                    minHeight: 22,
                    height: 22,
                  },
                }}
                w={220}
              />
            ) : (
              <Badge size="xs" color="red" variant="light" style={{ textTransform: 'none' }}>
                no terminal open
              </Badge>
            )}
            {worktree && (
              <span style={{ color: 'var(--phantom-text-muted)' }}>
                · {worktree.name ?? worktree.branch}
              </span>
            )}
          </div>
          <ActionIcon
            variant="subtle"
            size="xs"
            onClick={() => setOpen(false)}
            aria-label="Close composer"
          >
            <X size={13} />
          </ActionIcon>
        </div>

        {/* Slash picker — floats above the textarea when active */}
        {slashQuery !== null && filteredSlash.length > 0 && (
          <div
            style={{
              maxHeight: 220,
              overflowY: 'auto',
              borderBottom: '1px solid var(--phantom-border-subtle)',
              background: 'var(--phantom-surface-elevated)',
            }}
          >
            <div
              style={{
                padding: '6px 12px',
                fontSize: 10,
                color: 'var(--phantom-text-muted)',
                fontFamily: 'JetBrains Mono, monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Claude Slash Commands · ↑↓ · ⏎ to insert · esc to dismiss
            </div>
            {filteredSlash.map((cmd, i) => {
              const isSelected = i === slashIndex;
              const sourceLabel =
                cmd.source === 'skill'
                  ? 'skill'
                  : cmd.source === 'user-command'
                    ? 'user'
                    : cmd.source === 'project-command'
                      ? 'project'
                      : null;
              const sourceColor =
                cmd.source === 'skill'
                  ? 'var(--phantom-accent-purple)'
                  : cmd.source === 'project-command'
                    ? 'var(--phantom-status-active)'
                    : 'var(--phantom-text-muted)';
              return (
                <div
                  key={cmd.name}
                  onMouseEnter={() => setSlashIndex(i)}
                  onMouseDown={(e) => {
                    // onMouseDown so click happens before textarea blur
                    e.preventDefault();
                    applySlashCommand(cmd);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '6px 12px',
                    cursor: 'pointer',
                    backgroundColor: isSelected
                      ? 'color-mix(in srgb, var(--phantom-accent-cyan, #00d4ff) 14%, transparent)'
                      : 'transparent',
                    borderLeft: isSelected
                      ? '2px solid var(--phantom-accent-cyan, #00d4ff)'
                      : '2px solid transparent',
                  }}
                >
                  <Slash
                    size={12}
                    style={{
                      color: 'var(--phantom-accent-cyan, #00d4ff)',
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'JetBrains Mono, monospace',
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--phantom-text-primary)',
                      minWidth: 140,
                    }}
                  >
                    /{cmd.name}
                    {cmd.takesArg && (
                      <span style={{ color: 'var(--phantom-text-muted)', fontWeight: 400 }}>
                        {' '}&lt;arg&gt;
                      </span>
                    )}
                  </span>
                  {sourceLabel && (
                    <span
                      style={{
                        fontSize: 9,
                        fontFamily: 'JetBrains Mono, monospace',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: sourceColor,
                        background: 'color-mix(in srgb, currentColor 15%, transparent)',
                        padding: '1px 6px',
                        borderRadius: 4,
                        flexShrink: 0,
                      }}
                    >
                      {sourceLabel}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--phantom-text-muted)',
                      flex: 1,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {cmd.description}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Textarea */}
        <div style={{ padding: '12px 12px 0' }}>
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              hasTerminalTarget
                ? 'Write your prompt — Enter for a new line, ⌘↩ to send to the terminal'
                : 'Open or focus a terminal (e.g. ⌘K C for a Claude session) first'
            }
            autosize
            minRows={4}
            maxRows={20}
            disabled={!hasTerminalTarget}
            styles={{
              input: {
                background: 'var(--phantom-surface-elevated)',
                border: isPureSlashCommand
                  ? '1px solid color-mix(in srgb, var(--phantom-accent-cyan, #00d4ff) 40%, transparent)'
                  : '1px solid var(--phantom-border-subtle)',
                color: isPureSlashCommand
                  ? 'var(--phantom-accent-cyan, #00d4ff)'
                  : 'var(--phantom-text-primary)',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 13,
                lineHeight: 1.5,
                fontWeight: isPureSlashCommand ? 600 : 400,
              },
            }}
          />
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px 10px',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 10, color: 'var(--phantom-text-muted)' }}>
            Text is injected into the focused terminal with a trailing newline.
          </span>

          <Button
            size="xs"
            onClick={handleSend}
            disabled={!canSend}
            rightSection={
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 10,
                  opacity: 0.7,
                }}
              >
                ⌘↩
              </span>
            }
            styles={{
              root: {
                background: canSend
                  ? 'var(--phantom-accent-cyan, #00d4ff)'
                  : 'var(--phantom-surface-hover)',
                color: canSend ? '#000' : 'var(--phantom-text-muted)',
                fontWeight: 600,
              },
            }}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
};
