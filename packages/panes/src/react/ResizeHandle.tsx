/**
 * @phantom-os/panes — Draggable resize handle between split panes
 * @author Subash Karki
 *
 * Uses pointer events for smooth cross-browser dragging.
 * Works for both horizontal and vertical splits.
 */

import { useCallback, useRef, type PointerEvent, type CSSProperties } from 'react';

export interface ResizeHandleProps {
  direction: 'horizontal' | 'vertical';
  onResize: (percentage: number) => void;
}

const baseStyle: CSSProperties = {
  flex: '0 0 4px',
  zIndex: 2,
  touchAction: 'none',
  userSelect: 'none',
  position: 'relative',
};

const hoverZone: CSSProperties = {
  position: 'absolute',
  inset: 0,
};

export function ResizeHandle({ direction, onResize }: ResizeHandleProps) {
  const handleRef = useRef<HTMLDivElement>(null);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const handle = handleRef.current;
      if (!handle) return;

      // Capture pointer for smooth dragging even outside the element
      handle.setPointerCapture(e.pointerId);

      const container = handle.parentElement;
      if (!container) return;

      const onPointerMove = (ev: globalThis.PointerEvent) => {
        const rect = container.getBoundingClientRect();
        const pos =
          direction === 'horizontal'
            ? ev.clientX - rect.left
            : ev.clientY - rect.top;
        const size = direction === 'horizontal' ? rect.width : rect.height;
        const pct = Math.min(90, Math.max(10, (pos / size) * 100));
        onResize(pct);
      };

      const onPointerUp = () => {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        // Remove "resizing" class from body
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      // Set cursor on body during drag for smooth UX
      document.body.style.cursor =
        direction === 'horizontal' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    },
    [direction, onResize],
  );

  const isH = direction === 'horizontal';

  return (
    <div
      ref={handleRef}
      onPointerDown={onPointerDown}
      style={{
        ...baseStyle,
        cursor: isH ? 'col-resize' : 'row-resize',
        background: 'var(--pane-border, rgba(255,255,255,0.08))',
      }}
    >
      {/* Larger invisible hover target for easier grabbing */}
      <div
        style={{
          ...hoverZone,
          ...(isH
            ? { left: '-3px', right: '-3px' }
            : { top: '-3px', bottom: '-3px' }),
        }}
      />
    </div>
  );
}
