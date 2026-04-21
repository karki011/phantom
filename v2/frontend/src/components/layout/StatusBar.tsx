// PhantomOS v2 — Footer status bar
// Author: Subash Karki

import { createMemo } from 'solid-js';
import { backendConnected, activeWorktreeId } from '@/core/signals/app';
import { sessions } from '@/core/signals/sessions';
import * as shellStyles from '@/styles/app-shell.css';

export function StatusBar() {
  const totalSessions = createMemo(() => sessions().length);

  const activeSessions = createMemo(() =>
    sessions().filter((s) => s.status === 'active' || s.status === 'running').length
  );

  return (
    <footer class={shellStyles.statusBar} role="status" aria-label="System status">
      {/* Left: Backend connection */}
      <div class={shellStyles.statusLeft}>
        <span
          class={
            backendConnected()
              ? shellStyles.statusDotConnected
              : shellStyles.statusDotDisconnected
          }
          aria-hidden="true"
        />
        <span class={shellStyles.statusText}>
          {backendConnected() ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {/* Center: Session + worktree info */}
      <div class={shellStyles.statusCenter}>
        <span class={shellStyles.statusText}>
          {activeSessions()} / {totalSessions()} sessions
        </span>
        {activeWorktreeId() && (
          <>
            <span class={shellStyles.statusDivider}>·</span>
            <span class={shellStyles.statusText}>{activeWorktreeId()}</span>
          </>
        )}
      </div>

      {/* Right: Placeholders for hunter level / safety */}
      <div class={shellStyles.statusRight}>
        <span class={shellStyles.statusMuted}>Hunter Lv —</span>
        <span class={shellStyles.statusDivider}>·</span>
        <span class={shellStyles.statusMuted}>Safety —</span>
      </div>
    </footer>
  );
}
