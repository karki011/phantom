// PhantomOS v2 — Pane resize handle (drag to resize splits)
// Author: Subash Karki

import { createSignal, onCleanup } from 'solid-js';
import * as styles from '@/styles/panes.css';
import { resizeSplit } from '@/core/panes/signals';

interface PaneResizeHandleProps {
  direction: 'horizontal' | 'vertical';
  /** Path in the layout tree to the split being resized */
  path: number[];
  /** Current split percentage (0–100) */
  currentPercentage: number;
  /** Total pixel size of the split container (width for H, height for V) */
  containerSize: number;
}

export function PaneResizeHandle(props: PaneResizeHandleProps) {
  const [dragging, setDragging] = createSignal(false);

  let startPos = 0;
  let startPct = 0;

  const onPointerMove = (e: PointerEvent) => {
    const delta =
      props.direction === 'horizontal'
        ? e.clientX - startPos
        : e.clientY - startPos;

    const deltaPct = (delta / props.containerSize) * 100;
    const newPct = Math.min(90, Math.max(10, startPct + deltaPct));
    resizeSplit(props.path, newPct);
  };

  const onPointerUp = (e: PointerEvent) => {
    (e.currentTarget as HTMLElement)?.releasePointerCapture?.(e.pointerId);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    setDragging(false);
  };

  const onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    startPos =
      props.direction === 'horizontal' ? e.clientX : e.clientY;
    startPct = props.currentPercentage;
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  };

  onCleanup(() => {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
  });

  const baseClass =
    props.direction === 'horizontal'
      ? styles.resizeHandleHorizontal
      : styles.resizeHandleVertical;

  return (
    <div
      class={`${baseClass} ${dragging() ? styles.resizeHandleActive : ''}`}
      onPointerDown={onPointerDown}
      role="separator"
      aria-orientation={props.direction === 'horizontal' ? 'vertical' : 'horizontal'}
    />
  );
}
