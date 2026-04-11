/**
 * ResizeHandle — drag handle for sidebar resizing
 *
 * @author Subash Karki
 */
import { useCallback, useEffect, useRef } from 'react';

interface ResizeHandleProps {
  position: 'left' | 'right';
  onResize: (delta: number) => void;
}

export function ResizeHandle({ position, onResize }: ResizeHandleProps) {
  const dragging = useRef(false);
  const lastX = useRef(0);

  // Reset body styles if component unmounts during a drag
  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true;
      lastX.current = e.clientX;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      const delta = e.clientX - lastX.current;
      lastX.current = e.clientX;
      // For left-edge handles, dragging right should shrink (negative delta)
      onResize(position === 'left' ? -delta : delta);
    },
    [onResize, position],
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        [position]: -2,
        width: 4,
        cursor: 'col-resize',
        zIndex: 10,
        transition: 'background-color 150ms ease',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor =
          'var(--phantom-accent-cyan)';
      }}
      onMouseLeave={(e) => {
        if (!dragging.current) {
          (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
        }
      }}
    />
  );
}
