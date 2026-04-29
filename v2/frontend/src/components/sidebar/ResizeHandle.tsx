// PhantomOS v2 — Sidebar resize handle
// Author: Subash Karki

import { onCleanup } from 'solid-js';
import * as styles from '@/styles/sidebar.css';
import {
  leftSidebarWidth,
  leftSidebarCollapsed,
  setLeftSidebarCollapsed,
  persistSidebarWidth,
  setIsLeftResizing,
} from '@/core/signals/worktrees';

const MIN_WIDTH = 180;
const MAX_WIDTH = 400;

export function ResizeHandle() {
  let dragging = false;
  let startX = 0;
  let startWidth = 0;

  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    const delta = e.clientX - startX;
    const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
    persistSidebarWidth(next);
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    setIsLeftResizing(false);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  function onPointerDown(e: PointerEvent) {
    e.preventDefault();
    dragging = true;
    setIsLeftResizing(true);
    startX = e.clientX;
    startWidth = leftSidebarWidth();
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function onDblClick() {
    setLeftSidebarCollapsed(!leftSidebarCollapsed());
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
