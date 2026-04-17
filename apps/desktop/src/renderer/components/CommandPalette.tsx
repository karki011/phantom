/**
 * CommandPalette — Cmd+Shift+P overlay listing all worktree-scoped commands.
 * Reuses QuickOpen's visual language so the two palettes feel like siblings.
 *
 * @author Subash Karki
 */
import { useAtomValue } from 'jotai';
import { Search, Terminal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { usePaneStore } from '@phantom-os/panes';
import { activeWorktreeAtom } from '../atoms/worktrees';
import { COMMANDS, scoreCommand, type Command } from '../commands/registry';

export const CommandPalette = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+Shift+P / Ctrl+Shift+P
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        e.stopPropagation();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  if (!open) return null;
  return <CommandPaletteInner onClose={() => setOpen(false)} />;
};

const CommandPaletteInner = ({ onClose }: { onClose: () => void }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const worktree = useAtomValue(activeWorktreeAtom);
  const store = usePaneStore();

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Filter + rank commands. Empty query shows all visible commands in
  // registry order (preserving semantic grouping).
  const visibleCommands = useMemo(() => {
    const ctx = { worktree, store };
    const available = COMMANDS.filter((c) => (c.when ? c.when(ctx) : true));
    if (!query.trim()) return available;
    return available
      .map((cmd) => ({ cmd, score: scoreCommand(cmd, query.trim()) }))
      .filter((r) => r.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.cmd);
  }, [query, worktree, store]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const runCommand = useCallback(
    (cmd: Command) => {
      onClose();
      // Defer so the palette unmounts before the action fires — avoids
      // focus-stealing races (e.g. an action that opens another modal).
      queueMicrotask(() => {
        try {
          void cmd.run({ worktree, store });
        } catch (err) {
          console.error(`[CommandPalette] ${cmd.id} failed`, err);
        }
      });
    },
    [worktree, store, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          visibleCommands.length === 0 ? 0 : (prev + 1) % visibleCommands.length,
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          visibleCommands.length === 0
            ? 0
            : (prev - 1 + visibleCommands.length) % visibleCommands.length,
        );
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = visibleCommands[selectedIndex];
        if (cmd) runCommand(cmd);
      }
    },
    [visibleCommands, selectedIndex, runCommand, onClose],
  );

  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '15vh',
        backgroundColor: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 620,
          background: 'var(--phantom-surface-card)',
          border: '1px solid var(--phantom-border-subtle)',
          borderRadius: 12,
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderBottom: '1px solid var(--phantom-border-subtle)',
          }}
        >
          <Search size={16} style={{ color: 'var(--phantom-text-muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--phantom-text-primary)',
              fontSize: 14,
              fontFamily: 'inherit',
            }}
          />
        </div>

        <div
          ref={listRef}
          style={{ maxHeight: 400, overflowY: 'auto' }}
        >
          {visibleCommands.length === 0 && (
            <div
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                color: 'var(--phantom-text-muted)',
                fontSize: 13,
              }}
            >
              No matching commands
            </div>
          )}

          {visibleCommands.map((cmd, i) => {
            const isSelected = i === selectedIndex;
            return (
              <div
                key={cmd.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 16px',
                  cursor: 'pointer',
                  backgroundColor: isSelected
                    ? 'color-mix(in srgb, var(--phantom-accent-cyan, #00d4ff) 14%, transparent)'
                    : 'transparent',
                  borderLeft: isSelected
                    ? '2px solid var(--phantom-accent-cyan, #00d4ff)'
                    : '2px solid transparent',
                  transition: 'background-color 80ms ease',
                }}
                onClick={() => runCommand(cmd)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <Terminal
                  size={14}
                  style={{ color: 'var(--phantom-text-muted)', flexShrink: 0 }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      color: 'var(--phantom-text-primary)',
                      fontSize: 13,
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    <span style={{ color: 'var(--phantom-text-muted)', fontWeight: 400 }}>
                      {cmd.category}:{' '}
                    </span>
                    {cmd.title}
                  </div>
                </div>
                {cmd.keybinding && (
                  <div
                    style={{
                      color: 'var(--phantom-text-muted)',
                      fontSize: 11,
                      fontFamily: 'JetBrains Mono, monospace',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {cmd.keybinding}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div
          style={{
            padding: '6px 12px',
            borderTop: '1px solid var(--phantom-border-subtle)',
            color: 'var(--phantom-text-muted)',
            fontSize: 11,
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>↑↓ navigate · ⏎ run · esc close</span>
          <span>{visibleCommands.length} command{visibleCommands.length === 1 ? '' : 's'}</span>
        </div>
      </div>
    </div>
  );
};
