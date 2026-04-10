/**
 * useTerminal — Terminal lifecycle hook.
 * Uses the Terminal Runtime Registry to persist sessions across
 * React unmount/remount (worktree switches).
 *
 * @author Subash Karki
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import '@xterm/xterm/css/xterm.css';
import {
  attachSession,
  detachSession,
  getSession,
  type AttachOptions,
} from './state.js';

export const useTerminal = (
  containerRef: React.RefObject<HTMLDivElement | null>,
  paneId: string,
  cwd?: string,
  initialCommand?: string,
  metadata?: {
    workspaceId?: string;
    projectId?: string;
    recipeCommand?: string;
    recipeLabel?: string;
    recipeCategory?: string;
    port?: number | null;
  },
) => {
  const [connected, setConnected] = useState(false);
  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const attachedRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    console.log(`[useTerminal] effect paneId=${paneId.slice(0,8)} container=${!!container} attachedRef=${attachedRef.current}`);
    if (!container) return;
    if (attachedRef.current) return; // Prevent double-attach in StrictMode

    attachedRef.current = true;
    console.log(`[useTerminal] ATTACHING paneId=${paneId.slice(0,8)}`);

    const opts: AttachOptions = {
      cwd,
      initialCommand,
      metadata,
      coldRestore: false, // Will be set by pane data if cold restoring
    };

    // Check if pane has coldRestore flag (set by atoms.ts on cold boot)
    const paneEl = container.closest('[data-pane-id]');
    if (paneEl?.getAttribute('data-cold-restore') === 'true') {
      opts.coldRestore = true;
    }

    attachSession(paneId, container, opts).then((session) => {
      setConnected(session.connected);
      if (session.showRestoreBanner) {
        setShowRestoreBanner(true);
        session.showRestoreBanner = false;
        // Auto-hide banner after 4 seconds
        setTimeout(() => setShowRestoreBanner(false), 4000);
      }

      // Poll connected state from the session (WebSocket may connect async)
      const interval = setInterval(() => {
        const s = getSession(paneId);
        if (s?.connected) {
          setConnected(true);
          clearInterval(interval);
        }
      }, 200);

      // Clear interval after 10 seconds max
      setTimeout(() => clearInterval(interval), 10000);
    });

    return () => {
      console.log(`[useTerminal] CLEANUP paneId=${paneId.slice(0,8)} — calling detachSession`);
      attachedRef.current = false;
      detachSession(paneId);
    };
  // cwd, initialCommand, and metadata are captured via refs — intentionally mount-time-only
  }, [containerRef, paneId]);

  const dismissBanner = useCallback(() => setShowRestoreBanner(false), []);

  return { connected, showRestoreBanner, dismissBanner };
};
