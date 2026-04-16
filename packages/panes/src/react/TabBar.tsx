/**
 * @phantom-os/panes — Tab strip with pane type menu
 * @author Subash Karki
 *
 * Horizontal tab bar with:
 * - Tab buttons (click to switch, close button)
 * - "+" button with optional pane type dropdown
 * - Drag-to-reorder tabs (native HTML5 drag)
 * - Right-click context menu using Mantine Menu
 */
import {
  type CSSProperties,
  type DragEvent,
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import { Menu } from '@mantine/core';
import { usePaneStore } from './WorkspaceProvider.js';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const barStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  height: 32,
  background: 'var(--tab-bar-bg, rgba(0,0,0,0.3))',
  borderBottom: '1px solid var(--pane-border, rgba(255,255,255,0.08))',
  overflow: 'visible',
  userSelect: 'none',
  padding: '0 4px',
  position: 'relative',
  zIndex: 10,
};

const tabsScrollStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  flex: 1,
  minWidth: 0,
  overflowX: 'auto',
  overflowY: 'hidden',
  scrollbarWidth: 'none',
};

const tabStyle = (active: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '0 10px',
  height: 26,
  fontSize: 12,
  borderRadius: 4,
  cursor: 'pointer',
  flexShrink: 0,
  background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
  color: active ? '#fff' : 'rgba(255,255,255,0.55)',
  border: 'none',
  whiteSpace: 'nowrap',
  maxWidth: 160,
});

const closeStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1,
  opacity: 0.5,
  padding: 0,
};

const menuDropdownStyles = {
  dropdown: {
    backgroundColor: 'var(--phantom-surface-card, #1a1a2e)',
    borderColor: 'var(--phantom-border-subtle, rgba(255,255,255,0.12))',
  },
  item: {
    fontSize: '0.8rem',
    color: 'var(--phantom-text-secondary, rgba(255,255,255,0.8))',
    padding: '8px 12px',
    cursor: 'pointer',
  },
  separator: {
    borderColor: 'var(--phantom-border-subtle, rgba(255,255,255,0.12))',
  },
};

// ---------------------------------------------------------------------------
// Tab drag MIME type
// ---------------------------------------------------------------------------

const TAB_DRAG_TYPE = 'application/x-phantom-tab';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaneMenuItem {
  kind: string;
  label: string;
  icon?: string;
}

export interface TabBarProps {
  paneMenu?: PaneMenuItem[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TabBar({ paneMenu }: TabBarProps) {
  const store = usePaneStore();
  const { tabs, activeTabId } = store;
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Tab context menu state
  const [ctxTabId, setCtxTabId] = useState<string | null>(null);

  // Inline rename state
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Track which panes have unsaved changes (dirty state)
  const [dirtyPanes, setDirtyPanes] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handler = (e: CustomEvent<{ paneId: string; dirty: boolean }>) => {
      setDirtyPanes((prev) => {
        const next = new Set(prev);
        if (e.detail.dirty) {
          next.add(e.detail.paneId);
        } else {
          next.delete(e.detail.paneId);
        }
        return next;
      });
    };
    window.addEventListener('phantom:pane-dirty' as any, handler);
    return () => window.removeEventListener('phantom:pane-dirty' as any, handler);
  }, []);

  const isTabDirty = useCallback(
    (tab: typeof tabs[0]) =>
      Object.keys(tab.panes).some((pid) => dirtyPanes.has(pid)),
    [dirtyPanes],
  );

  // Focus rename input when it appears
  useEffect(() => {
    if (renamingTabId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingTabId]);

  const handleTabContextMenu = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.preventDefault();
      setCtxTabId(tabId);
    },
    [],
  );

  const startRename = useCallback(
    (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      setRenameValue(tab.label);
      setRenamingTabId(tabId);
      setCtxTabId(null);
    },
    [tabs],
  );

  const commitRename = useCallback(() => {
    if (renamingTabId && renameValue.trim()) {
      store.renameTab(renamingTabId, renameValue.trim());
    }
    setRenamingTabId(null);
  }, [renamingTabId, renameValue, store]);

  const cancelRename = useCallback(() => {
    setRenamingTabId(null);
  }, []);

  const handleOpenPane = useCallback(
    (kind: string) => {
      store.addPane(kind);
      setAddMenuOpen(false);
    },
    [store],
  );

  // Tab drag handlers
  const onTabDragStart = useCallback(
    (e: DragEvent, index: number) => {
      e.dataTransfer.setData(TAB_DRAG_TYPE, String(index));
      e.dataTransfer.effectAllowed = 'move';
    },
    [],
  );

  const onTabDragOver = useCallback(
    (e: DragEvent, index: number) => {
      if (!e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return;
      e.preventDefault();
      setDragOverIndex(index);
    },
    [],
  );

  const onTabDrop = useCallback(
    (e: DragEvent, toIndex: number) => {
      e.preventDefault();
      const fromIndex = Number(e.dataTransfer.getData(TAB_DRAG_TYPE));
      if (!Number.isNaN(fromIndex) && fromIndex !== toIndex) {
        store.reorderTab(fromIndex, toIndex);
      }
      setDragOverIndex(null);
    },
    [store],
  );

  const onTabDragEnd = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  // Auto-scroll active tab into view
  const activeTabRef = useCallback((node: HTMLDivElement | null) => {
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [activeTabId]);

  // Get editor file info for context menu extras
  const getEditorInfo = useCallback((tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return null;
    const editorPane = Object.values(tab.panes).find(
      (p) => p.kind === 'editor' && p.data?.filePath,
    );
    if (!editorPane) return null;
    const filePath = editorPane.data.filePath as string;
    const repoPath = editorPane.data.repoPath as string | undefined;
    const absolutePath = repoPath
      ? `${repoPath.replace(/\/$/, '')}/${filePath.replace(/^\//, '')}`
      : filePath;
    return { filePath, absolutePath };
  }, [tabs]);

  return (
    <div style={barStyle}>
      <div style={tabsScrollStyle}>
      {tabs.map((t, i) => {
        const isCtxTarget = ctxTabId === t.id;
        const isHome = Object.values(t.panes).some((p) => p.kind === 'workspace-home');
        const editorInfo = isCtxTarget ? getEditorInfo(t.id) : null;

        return (
          <Menu
            key={t.id}
            opened={isCtxTarget}
            onChange={(val) => { if (!val) setCtxTabId(null); }}
            shadow="md"
            width={180}
            position="bottom-start"
            withinPortal
            middlewares={{ shift: true, flip: true }}
            styles={menuDropdownStyles}
          >
            <Menu.Target>
              <div
                ref={t.id === activeTabId ? activeTabRef : undefined}
                style={{
                  ...tabStyle(t.id === activeTabId),
                  ...(dragOverIndex === i
                    ? { borderLeft: '2px solid rgba(99,102,241,0.7)' }
                    : {}),
                }}
                onClick={() => store.setActiveTab(t.id)}
                onContextMenu={(e) => handleTabContextMenu(e, t.id)}
                onDoubleClick={() => startRename(t.id)}
                draggable={renamingTabId !== t.id}
                onDragStart={(e) => onTabDragStart(e, i)}
                onDragOver={(e) => onTabDragOver(e, i)}
                onDrop={(e) => onTabDrop(e, i)}
                onDragEnd={onTabDragEnd}
              >
                {renamingTabId === t.id ? (
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') cancelRename();
                    }}
                    onBlur={commitRename}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      background: 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(99,102,241,0.5)',
                      borderRadius: 3,
                      color: '#fff',
                      fontSize: 12,
                      padding: '1px 4px',
                      outline: 'none',
                      width: '100%',
                      maxWidth: 140,
                    }}
                  />
                ) : (
                  <span
                    title={t.label}
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    {isTabDirty(t) && (
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: 'var(--phantom-accent-gold, #f59e0b)',
                          flexShrink: 0,
                        }}
                      />
                    )}
                    {t.label}
                  </span>
                )}
                {!isHome && (
                  <button
                    type="button"
                    style={closeStyle}
                    onClick={(e) => {
                      e.stopPropagation();
                      store.removeTab(t.id);
                    }}
                    aria-label={`Close tab ${t.label}`}
                  >
                    ×
                  </button>
                )}
              </div>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => startRename(t.id)}>
                Rename
              </Menu.Item>
              {!isHome && (
                <Menu.Item
                  color="red"
                  onClick={() => { store.removeTab(t.id); setCtxTabId(null); }}
                >
                  Close Tab
                </Menu.Item>
              )}
              {tabs.length > 1 && (
                <Menu.Item
                  onClick={() => { store.closeOtherTabs(t.id); setCtxTabId(null); }}
                >
                  Close Other Tabs
                </Menu.Item>
              )}
              {editorInfo && (
                <>
                  <Menu.Divider />
                  <Menu.Item
                    onClick={() => { navigator.clipboard.writeText(editorInfo.filePath); setCtxTabId(null); }}
                  >
                    Copy Relative Path
                  </Menu.Item>
                  <Menu.Item
                    onClick={() => { navigator.clipboard.writeText(editorInfo.absolutePath); setCtxTabId(null); }}
                  >
                    Copy Absolute Path
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('phantom:reveal-file', { detail: { filePath: editorInfo.filePath } }));
                      setCtxTabId(null);
                    }}
                  >
                    Reveal in Sidebar
                  </Menu.Item>
                </>
              )}
            </Menu.Dropdown>
          </Menu>
        );
      })}
      </div>
      {/* "+" add pane menu */}
      <Menu
        opened={addMenuOpen}
        onChange={setAddMenuOpen}
        shadow="md"
        width={160}
        position="bottom-end"
        withinPortal
        styles={menuDropdownStyles}
      >
        <Menu.Target>
          <button
            type="button"
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255,255,255,0.5)',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              padding: '0 6px',
            }}
            onClick={() => { if (!paneMenu) store.addTab(); }}
            aria-label="Add pane"
          >
            +
          </button>
        </Menu.Target>
        {paneMenu && (
          <Menu.Dropdown>
            {paneMenu.map((item) => (
              <Menu.Item key={item.kind} onClick={() => handleOpenPane(item.kind)}>
                {item.icon && <span>{item.icon}</span>}
                {item.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        )}
      </Menu>
    </div>
  );
}
