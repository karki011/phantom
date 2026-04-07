/**
 * @phantom-os/panes — Tab strip
 * @author Subash Karki
 */

import type { CSSProperties } from 'react';
import { usePanes } from './usePanes.js';

const barStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  height: 32,
  background: 'var(--tab-bar-bg, rgba(0,0,0,0.3))',
  borderBottom: '1px solid var(--pane-border, rgba(255,255,255,0.08))',
  overflow: 'hidden',
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
};

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, addTab, removeTab } = usePanes();

  return (
    <div style={barStyle}>
      {tabs.map((t) => (
        <div key={t.id} style={tabStyle(t.id === activeTabId)} onClick={() => setActiveTab(t.id)}>
          <span>{t.label}</span>
          {tabs.length > 1 && (
            <button
              type="button"
              style={closeStyle}
              onClick={(e) => {
                e.stopPropagation();
                removeTab(t.id);
              }}
              aria-label={`Close tab ${t.label}`}
            >
              ×
            </button>
          )}
        </div>
      ))}
      <button type="button" style={addStyle} onClick={() => addTab()} aria-label="Add tab">
        +
      </button>
    </div>
  );
}
