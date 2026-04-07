/**
 * @phantom-os/panes — Individual pane wrapper
 * @author Subash Karki
 */

import type { CSSProperties, ReactNode } from 'react';
import type { Pane } from '../core/types.js';
import { usePanes } from './usePanes.js';

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: 28,
  padding: '0 8px',
  fontSize: 12,
  background: 'var(--pane-header-bg, rgba(255,255,255,0.04))',
  borderBottom: '1px solid var(--pane-border, rgba(255,255,255,0.08))',
  userSelect: 'none',
};

const closeBtn: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'inherit',
  cursor: 'pointer',
  opacity: 0.6,
  fontSize: 14,
  lineHeight: 1,
};

export interface PaneContainerProps {
  pane: Pane;
  children: ReactNode;
}

export function PaneContainer({ pane, children }: PaneContainerProps) {
  const { closePane, setActivePane } = usePanes();

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
      onMouseDown={() => setActivePane(pane.id)}
    >
      <div style={headerStyle}>
        <span>{pane.title}</span>
        {!pane.pinned && (
          <button type="button" style={closeBtn} onClick={() => closePane(pane.id)} aria-label="Close pane">
            ×
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>{children}</div>
    </div>
  );
}
