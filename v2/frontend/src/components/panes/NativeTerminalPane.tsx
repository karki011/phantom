// Phantom — Native (libghostty) terminal pane
// Author: Subash Karki
//
// Renders a placeholder div whose only job is to report its bounds via
// ResizeObserver. The actual terminal pixels come from a sibling NSView
// (PhantomTerminalView) attached to the Wails NSWindow's contentView and
// positioned to match this div on every layout change.

import { onMount, onCleanup, createEffect } from 'solid-js';
import {
  nativeTerminalCreate,
  nativeTerminalDestroy,
  nativeTerminalFocus,
  nativeTerminalSetOcclusion,
  nativeTerminalSetPlacement,
} from '@/core/bindings/native-terminal';
import { activePaneId } from '@/core/panes/signals';

interface NativeTerminalPaneProps {
  paneId: string;
  cwd?: string;
  worktreeId?: string;
}

export default function NativeTerminalPane(props: NativeTerminalPaneProps) {
  let containerRef!: HTMLDivElement;
  let resizeObserver: ResizeObserver | undefined;
  let scrollListenerTarget: Window | undefined;
  let lastBounds = { x: 0, y: 0, w: 0, h: 0 };
  let alive = true;

  const pushPlacement = () => {
    if (!alive || !containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    const x = Math.round(rect.left);
    const y = Math.round(rect.top);
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    if (x === lastBounds.x && y === lastBounds.y && w === lastBounds.w && h === lastBounds.h) return;
    lastBounds = { x, y, w, h };
    void nativeTerminalSetPlacement(props.paneId, x, y, w, h);
  };

  onMount(async () => {
    const id = await nativeTerminalCreate(
      props.paneId,
      props.worktreeId ?? '',
      props.cwd ?? '',
    );
    if (!alive || !id) return;

    pushPlacement();

    resizeObserver = new ResizeObserver(() => pushPlacement());
    resizeObserver.observe(containerRef);

    scrollListenerTarget = window;
    scrollListenerTarget.addEventListener('scroll', pushPlacement, true);
    scrollListenerTarget.addEventListener('resize', pushPlacement);
  });

  // Mark the surface occluded whenever this pane isn't the active one —
  // libghostty drops to a low-power render state so backgrounded terminals
  // don't burn CPU. Re-runs cheaply on activePaneId changes.
  createEffect(() => {
    if (!alive) return;
    const hidden = activePaneId() !== props.paneId;
    void nativeTerminalSetOcclusion(props.paneId, hidden);
  });

  onCleanup(() => {
    alive = false;
    if (resizeObserver) resizeObserver.disconnect();
    if (scrollListenerTarget) {
      scrollListenerTarget.removeEventListener('scroll', pushPlacement, true);
      scrollListenerTarget.removeEventListener('resize', pushPlacement);
    }
    void nativeTerminalDestroy(props.paneId);
  });

  const onPointerDown = () => {
    void nativeTerminalFocus(props.paneId);
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      style={{
        height: '100%',
        width: '100%',
        background: 'transparent',
      }}
    />
  );
}
