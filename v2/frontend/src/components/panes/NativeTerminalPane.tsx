// Phantom — Native (libghostty) terminal pane
// Author: Subash Karki
//
// Renders a placeholder div whose only job is to report its bounds via
// ResizeObserver. The actual terminal pixels come from a sibling NSView
// (PhantomTerminalView) attached to the Wails NSWindow's contentView and
// positioned to match this div on every layout change.

import { onMount, onCleanup, createEffect, createSignal, Show } from 'solid-js';
import {
  nativeTerminalCreate,
  nativeTerminalDestroy,
  nativeTerminalFocus,
  nativeTerminalSetOcclusion,
  nativeTerminalSetPlacement,
} from '@/core/bindings/native-terminal';
import { activePaneId } from '@/core/panes/signals';
import { vars } from '@/styles/theme.css';

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
  let waitRafId: number | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const [createError, setCreateError] = createSignal<string | null>(null);

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

  // The NSView attach path needs a realized window + real bounds; the first
  // frame after mount can report 0x0, so wait for layout before creating.
  const waitForNonZeroRect = () =>
    new Promise<void>((resolve) => {
      const check = () => {
        if (!alive) { resolve(); return; }
        const rect = containerRef?.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) { resolve(); return; }
        waitRafId = requestAnimationFrame(check);
      };
      check();
    });

  const delay = (ms: number) =>
    new Promise<void>((resolve) => { retryTimer = setTimeout(resolve, ms); });

  const MAX_CREATE_ATTEMPTS = 8;

  // `window not ready` is the transient early-boot error from the Go binding
  // (see contract at FindHostWindow in internal/terminal/ghostty/wails_host.go) — retry with linear backoff.
  // Anything else (`native terminal disabled`, `libghostty not available`) is permanent.
  const createWithRetry = async (): Promise<string | null> => {
    for (let attempt = 1; attempt <= MAX_CREATE_ATTEMPTS; attempt++) {
      try {
        return await nativeTerminalCreate(
          props.paneId,
          props.worktreeId ?? '',
          props.cwd ?? '',
        );
      } catch (error) {
        if (!alive) return null;
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes('window not ready') || attempt === MAX_CREATE_ATTEMPTS) {
          setCreateError(msg || 'native terminal failed to start');
          return null;
        }
        await delay(250 * attempt);
        if (!alive) return null;
      }
    }
    return null;
  };

  onMount(async () => {
    await waitForNonZeroRect();
    if (!alive) return;

    const id = await createWithRetry();
    if (!alive) return;
    if (!id) {
      if (!createError()) setCreateError('native terminal unavailable');
      return;
    }

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
    if (waitRafId !== undefined) cancelAnimationFrame(waitRafId);
    if (retryTimer !== undefined) clearTimeout(retryTimer);
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
    >
      <Show when={createError()}>
        <div
          style={{
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            height: '100%',
            padding: vars.space.md,
            color: vars.color.textSecondary,
            'font-family': vars.font.mono,
            'text-align': 'center',
          }}
        >
          {createError()}
        </div>
      </Show>
    </div>
  );
}
