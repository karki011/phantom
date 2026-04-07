/**
 * @phantom-os/panes — Drop zone visual indicator for DnD pane repositioning
 * @author Subash Karki
 *
 * Renders an overlay on a pane showing where a dragged pane will land.
 * Supports four edge drop zones (top, bottom, left, right) + center.
 */

import { useState, useCallback, type CSSProperties, type DragEvent, type ReactNode } from 'react';

export type DropPosition = 'top' | 'bottom' | 'left' | 'right' | 'center' | null;

export interface DropZoneProps {
  paneId: string;
  onDrop: (
    droppedPaneId: string,
    targetPaneId: string,
    position: NonNullable<DropPosition>,
  ) => void;
  children: ReactNode;
}

const overlayBase: CSSProperties = {
  position: 'absolute',
  pointerEvents: 'none',
  transition: 'opacity 150ms ease',
  borderRadius: 4,
};

function getHighlightStyle(position: DropPosition): CSSProperties | null {
  if (!position) return null;
  const bg = 'rgba(99, 102, 241, 0.25)';
  const border = '2px solid rgba(99, 102, 241, 0.6)';

  switch (position) {
    case 'left':
      return { ...overlayBase, top: 0, left: 0, bottom: 0, width: '50%', background: bg, border };
    case 'right':
      return { ...overlayBase, top: 0, right: 0, bottom: 0, width: '50%', background: bg, border };
    case 'top':
      return { ...overlayBase, top: 0, left: 0, right: 0, height: '50%', background: bg, border };
    case 'bottom':
      return { ...overlayBase, bottom: 0, left: 0, right: 0, height: '50%', background: bg, border };
    case 'center':
      return { ...overlayBase, inset: '10%', background: bg, border };
    default:
      return null;
  }
}

/** Determine which zone the cursor is in based on position within the container. */
function getDropPosition(
  e: DragEvent,
  rect: DOMRect,
): NonNullable<DropPosition> {
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const w = rect.width;
  const h = rect.height;

  // Relative position (0-1)
  const rx = x / w;
  const ry = y / h;

  // Edge threshold (20% from each edge)
  const threshold = 0.2;

  if (rx < threshold) return 'left';
  if (rx > 1 - threshold) return 'right';
  if (ry < threshold) return 'top';
  if (ry > 1 - threshold) return 'bottom';
  return 'center';
}

/** MIME type used for pane drag data */
export const PANE_DRAG_TYPE = 'application/x-phantom-pane';

export function DropZone({ paneId, onDrop, children }: DropZoneProps) {
  const [highlight, setHighlight] = useState<DropPosition>(null);

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(PANE_DRAG_TYPE)) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setHighlight(getDropPosition(e, rect));
  }, []);

  const onDragLeave = useCallback(() => {
    setHighlight(null);
  }, []);

  const onDropHandler = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const droppedPaneId = e.dataTransfer.getData(PANE_DRAG_TYPE);
      if (!droppedPaneId || droppedPaneId === paneId) {
        setHighlight(null);
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const position = getDropPosition(e, rect);
      setHighlight(null);
      onDrop(droppedPaneId, paneId, position);
    },
    [paneId, onDrop],
  );

  const highlightStyle = getHighlightStyle(highlight);

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%' }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDropHandler}
    >
      {children}
      {highlightStyle && <div style={highlightStyle} />}
    </div>
  );
}
