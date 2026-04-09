/**
 * @phantom-os/panes — Individual pane wrapper
 * @author Subash Karki
 *
 * Wraps each pane with a header (title, split buttons, close) and content area.
 * Supports drag-and-drop via native HTML5 drag events.
 */

import { useCallback, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import type { Pane } from '../core/types.js';
import { usePaneStore } from './WorkspaceProvider.js';
import { PANE_DRAG_TYPE, DropZone, type DropPosition } from './DropZone.js';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  background: 'var(--pane-bg, transparent)',
};

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
  cursor: 'grab',
};

const headerLeftStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flex: 1,
  overflow: 'hidden',
};

const headerActionsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  flexShrink: 0,
};

const iconBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'inherit',
  cursor: 'pointer',
  opacity: 0.5,
  fontSize: 12,
  lineHeight: 1,
  padding: '2px 4px',
  borderRadius: 3,
  display: 'flex',
  alignItems: 'center',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface PaneContainerProps {
  pane: Pane;
  tabId: string;
  children: ReactNode;
  /** Hide the pane header (used when tab has a single pane — tab bar already shows the title) */
  hideHeader?: boolean;
}

export function PaneContainer({ pane, tabId, children, hideHeader }: PaneContainerProps) {
  const store = usePaneStore();

  const handleFocus = useCallback(() => {
    store.setActivePaneInTab(tabId, pane.id);
  }, [store, tabId, pane.id]);

  const handleClose = useCallback(() => {
    store.closePane(pane.id);
  }, [store, pane.id]);

  const handleSplitH = useCallback(() => {
    store.splitPane(pane.id, 'horizontal', pane.kind);
  }, [store, pane.id, pane.kind]);

  const handleSplitV = useCallback(() => {
    store.splitPane(pane.id, 'vertical', pane.kind);
  }, [store, pane.id, pane.kind]);

  // Drag start — attach pane id to drag data
  const onDragStart = useCallback(
    (e: DragEvent) => {
      e.dataTransfer.setData(PANE_DRAG_TYPE, pane.id);
      e.dataTransfer.effectAllowed = 'move';
    },
    [pane.id],
  );

  // Drop handler from DropZone
  const onDropPane = useCallback(
    (droppedPaneId: string, targetPaneId: string, position: NonNullable<DropPosition>) => {
      if (position === 'center') {
        // Swap or merge — for now, just move to split
        store.movePaneToSplit(droppedPaneId, targetPaneId, 'horizontal', 'after');
        return;
      }
      const direction: 'horizontal' | 'vertical' =
        position === 'left' || position === 'right' ? 'horizontal' : 'vertical';
      const insertPos: 'before' | 'after' =
        position === 'left' || position === 'top' ? 'before' : 'after';
      store.movePaneToSplit(droppedPaneId, targetPaneId, direction, insertPos);
    },
    [store],
  );

  return (
    <DropZone paneId={pane.id} onDrop={onDropPane}>
      <div style={containerStyle} onMouseDown={handleFocus}>
        {!hideHeader && (
          <div
            style={headerStyle}
            draggable
            onDragStart={onDragStart}
          >
            <div style={headerLeftStyle}>
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {pane.title}
              </span>
            </div>
            <div style={headerActionsStyle}>
              <button
                type="button"
                style={iconBtnStyle}
                onClick={handleSplitH}
                title="Split horizontally"
                aria-label="Split horizontally"
              >
                ⊞
              </button>
              <button
                type="button"
                style={iconBtnStyle}
                onClick={handleSplitV}
                title="Split vertically"
                aria-label="Split vertically"
              >
                ⊟
              </button>
              {!pane.pinned && (
                <button
                  type="button"
                  style={{ ...iconBtnStyle, fontSize: 14 }}
                  onClick={handleClose}
                  aria-label="Close pane"
                >
                  ×
                </button>
              )}
            </div>
          </div>
        )}
        <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>{children}</div>
      </div>
    </DropZone>
  );
}
