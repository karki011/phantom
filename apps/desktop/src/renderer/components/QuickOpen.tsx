/**
 * QuickOpen — Cmd+P file search overlay
 * VS Code-style command palette for quickly opening files in the active worktree.
 *
 * @author Subash Karki
 */
import { useAtomValue } from 'jotai';
import { File, Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { usePaneStore } from '@phantom-os/panes';
import { API_BASE, type FileEntry } from '../lib/api';
import { activeWorktreeAtom } from '../atoms/worktrees';

export const QuickOpen = () => {
  const [open, setOpen] = useState(false);

  // Global keyboard shortcut: Cmd+P / Ctrl+P — always active.
  // Guard against Shift so Cmd+Shift+P (command palette) doesn't also match.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        e.stopPropagation();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  if (!open) return null;

  return <QuickOpenInner onClose={() => setOpen(false)} />;
};

const QuickOpenInner = ({ onClose }: { onClose: () => void }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FileEntry[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const worktree = useAtomValue(activeWorktreeAtom);
  const store = usePaneStore();

  // Auto-focus input on mount
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // ---------------------------------------------------------------------------
  // Debounced search
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!worktree || !query.trim()) {
      setResults([]);
      setSelectedIndex(0);
      return;
    }

    setLoading(true);
    const timer = setTimeout(() => {
      fetch(
        `${API_BASE}/api/worktrees/${worktree.id}/files/search?q=${encodeURIComponent(query.trim())}`,
      )
        .then((r) => r.json())
        .then((data: { entries: FileEntry[] }) => {
          const entries = (data.entries ?? []).slice(0, 20);
          setResults(entries);
          setSelectedIndex(0);
        })
        .catch(() => {
          setResults([]);
        })
        .finally(() => setLoading(false));
    }, 200);

    return () => clearTimeout(timer);
  }, [query, worktree?.id]);

  // ---------------------------------------------------------------------------
  // Open a file
  // ---------------------------------------------------------------------------
  const openFile = useCallback(
    (entry: FileEntry) => {
      if (!worktree) return;
      store.addPaneAsTab(
        'editor',
        {
          filePath: entry.relativePath,
          worktreeId: worktree.id,
          repoPath: worktree.worktreePath,
        } as Record<string, unknown>,
        entry.name,
      );
      onClose();
    },
    [worktree, store, onClose],
  );

  // ---------------------------------------------------------------------------
  // Keyboard navigation inside the modal
  // ---------------------------------------------------------------------------
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
          results.length === 0 ? 0 : (prev + 1) % results.length,
        );
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) =>
          results.length === 0 ? 0 : (prev - 1 + results.length) % results.length,
        );
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (results[selectedIndex]) {
          openFile(results[selectedIndex]);
        }
      }
    },
    [results, selectedIndex, openFile, onClose],
  );

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selected = listRef.current.children[selectedIndex] as HTMLElement | undefined;
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const hasQuery = query.trim().length > 0;

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
      {/* Modal */}
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          background: 'var(--phantom-surface-card, #1a1a2e)',
          border: '1px solid var(--phantom-border-subtle, rgba(255,255,255,0.12))',
          borderRadius: 12,
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderBottom: '1px solid var(--phantom-border-subtle, rgba(255,255,255,0.12))',
          }}
        >
          <Search
            size={16}
            style={{ color: 'var(--phantom-text-muted)', flexShrink: 0 }}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to search files..."
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

        {/* Results list */}
        <div
          ref={listRef}
          style={{
            maxHeight: 360,
            overflowY: 'auto',
          }}
        >
          {!hasQuery && (
            <div
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                color: 'var(--phantom-text-muted)',
                fontSize: 13,
              }}
            >
              Type to search files...
            </div>
          )}

          {hasQuery && !loading && results.length === 0 && (
            <div
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                color: 'var(--phantom-text-muted)',
                fontSize: 13,
              }}
            >
              No results
            </div>
          )}

          {results.map((entry, i) => {
            const isSelected = i === selectedIndex;
            return (
              <div
                key={entry.relativePath}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 16px',
                  cursor: 'pointer',
                  backgroundColor: isSelected
                    ? 'rgba(99,102,241,0.15)'
                    : 'transparent',
                  borderLeft: isSelected
                    ? '2px solid rgb(99,102,241)'
                    : '2px solid transparent',
                  transition: 'background-color 80ms ease',
                }}
                onClick={() => openFile(entry)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <File
                  size={14}
                  style={{
                    color: 'var(--phantom-text-muted)',
                    flexShrink: 0,
                  }}
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
                    {entry.name}
                  </div>
                  <div
                    style={{
                      color: 'var(--phantom-text-muted)',
                      fontSize: 11,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {entry.relativePath}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
