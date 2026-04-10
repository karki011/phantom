/**
 * @phantom-os/panes — Tab strip with pane type menu
 * @author Subash Karki
 *
 * Horizontal tab bar with:
 * - Tab buttons (click to switch, close button)
 * - "+" button with optional pane type dropdown
 * - Drag-to-reorder tabs (native HTML5 drag)
 */
import {
  type CSSProperties,
  type DragEvent,
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react';
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
  gap: 2,
  padding: '0 4px',
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

const addStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'rgba(255,255,255,0.5)',
  cursor: 'pointer',
  fontSize: 16,
  lineHeight: 1,
  padding: '0 6px',
  position: 'relative',
};

const menuStyle: CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: 0,
  zIndex: 9999,
  background: 'var(--pane-header-bg, #1a1a2e)',
  border: '1px solid var(--pane-border, rgba(255,255,255,0.12))',
  borderRadius: 6,
  padding: '4px 0',
  minWidth: 160,
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
};

const menuItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 12px',
  fontSize: 12,
  cursor: 'pointer',
  color: 'rgba(255,255,255,0.8)',
  background: 'transparent',
  border: 'none',
  width: '100%',
  textAlign: 'left',
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleOpenPane = useCallback(
    (kind: string) => {
      store.addPane(kind);
      setMenuOpen(false);
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

  return (
    <div style={barStyle}>
      {tabs.map((t, i) => (
        <div
          key={t.id}
          style={{
            ...tabStyle(t.id === activeTabId),
            ...(dragOverIndex === i
              ? { borderLeft: '2px solid rgba(99,102,241,0.7)' }
              : {}),
          }}
          onClick={() => store.setActiveTab(t.id)}
          draggable
          onDragStart={(e) => onTabDragStart(e, i)}
          onDragOver={(e) => onTabDragOver(e, i)}
          onDrop={(e) => onTabDrop(e, i)}
          onDragEnd={onTabDragEnd}
        >
          <span
            title={t.label}
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >{t.label}</span>
          {!Object.values(t.panes).some((p) => p.kind === 'workspace-home') && (
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
      ))}
      <div style={{ position: 'relative' }} ref={menuRef}>
        <button
          type="button"
          style={addStyle}
          onClick={() => (paneMenu ? setMenuOpen(!menuOpen) : store.addTab())}
          aria-label="Add pane"
        >
          +
        </button>
        {menuOpen && paneMenu && (
          <div style={menuStyle}>
            {paneMenu.map((item) => (
              <button
                key={item.kind}
                type="button"
                style={menuItemStyle}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.background =
                    'rgba(255,255,255,0.08)';
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.background = 'transparent';
                }}
                onClick={() => handleOpenPane(item.kind)}
              >
                {item.icon && <span>{item.icon}</span>}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
