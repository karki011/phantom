// PhantomOS v2 — Right sidebar resize handle (left edge drag)
// Author: Subash Karki

import { onCleanup } from 'solid-js';
import * as styles from '@/styles/right-sidebar.css';
import {
  rightSidebarWidth,
  rightSidebarCollapsed,
  setRightSidebarCollapsed,
  setRightSidebarWidth,
  setIsRightResizing,
} from '@/core/signals/files';

const MIN_WIDTH = 200;
const MAX_WIDTH = 500;

export function RightResizeHandle() {
  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    // Dragging the LEFT edge: moving left increases width (right side panel)
    const delta = startX - e.clientX;
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
    setRightSidebarWidth(next);
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    setIsRightResizing(false);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  function onPointerDown(e: PointerEvent) {
    e.preventDefault();
    dragging = true;
    setIsRightResizing(true);
    startX = e.clientX;
    startWidth = rightSidebarWidth();
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function onDblClick() {
    setRightSidebarCollapsed(!rightSidebarCollapsed());
  }

  onCleanup(() => {
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
  });

  return (
    <div
      class={styles.resizeHandle}
      onPointerDown={onPointerDown}
      onDblClick={onDblClick}
      title="Drag to resize. Double-click to collapse."
    />
  );
}
