/**
 * @phantom-os/panes — Tab strip with pane type menu
 * @author Subash Karki
 */
import { type CSSProperties, useState, useRef, useEffect } from 'react';
import { usePanes } from './usePanes.js';

const barStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', height: 32,
  background: 'var(--tab-bar-bg, rgba(0,0,0,0.3))',
  borderBottom: '1px solid var(--pane-border, rgba(255,255,255,0.08))',
  overflow: 'hidden', userSelect: 'none', gap: 2, padding: '0 4px',
};

const tabStyle = (active: boolean): CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '0 10px', height: 26, fontSize: 12, borderRadius: 4, cursor: 'pointer',
  background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
  color: active ? '#fff' : 'rgba(255,255,255,0.55)',
  border: 'none', whiteSpace: 'nowrap',
});

const closeStyle: CSSProperties = {
  background: 'none', border: 'none', color: 'inherit',
  cursor: 'pointer', fontSize: 14, lineHeight: 1, opacity: 0.5, padding: 0,
};

const addStyle: CSSProperties = {
  background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)',
  cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 6px', position: 'relative',
};

const menuStyle: CSSProperties = {
  position: 'absolute', top: '100%', right: 0, zIndex: 100,
  background: 'var(--pane-header-bg, #1a1a2e)', border: '1px solid var(--pane-border, rgba(255,255,255,0.12))',
  borderRadius: 6, padding: '4px 0', minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
};

const menuItemStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
  fontSize: 12, cursor: 'pointer', color: 'rgba(255,255,255,0.8)',
  background: 'transparent', border: 'none', width: '100%', textAlign: 'left',
};

/** Menu items — injected from outside via paneMenu prop or default */
export interface PaneMenuItem { kind: string; label: string; icon?: string }

interface TabBarProps {
  paneMenu?: PaneMenuItem[];
}

export function TabBar({ paneMenu }: TabBarProps) {
  const { tabs, activeTabId, setActiveTab, addTab, removeTab, openPane } = usePanes();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const handleOpenPane = (kind: string) => {
    openPane(kind);
    setMenuOpen(false);
  };

  return (
    <div style={barStyle}>
      {tabs.map((t) => (
        <div key={t.id} style={tabStyle(t.id === activeTabId)} onClick={() => setActiveTab(t.id)}>
          <span>{t.label}</span>
          {tabs.length > 1 && (
            <button type="button" style={closeStyle}
              onClick={(e) => { e.stopPropagation(); removeTab(t.id); }}
              aria-label={`Close tab ${t.label}`}>×</button>
          )}
        </div>
      ))}
      <div style={{ position: 'relative' }} ref={menuRef}>
        <button type="button" style={addStyle}
          onClick={() => paneMenu ? setMenuOpen(!menuOpen) : addTab()}
          aria-label="Add pane">+</button>
        {menuOpen && paneMenu && (
          <div style={menuStyle}>
            {paneMenu.map((item) => (
              <button key={item.kind} type="button" style={menuItemStyle}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
                onClick={() => handleOpenPane(item.kind)}>
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
