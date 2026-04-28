// Author: Subash Karki

import { Show } from 'solid-js';
import { shutdownConfirmVisible, confirmShutdown, cancelShutdown } from '@/core/signals/shutdown';
import * as styles from './shutdown-confirm-modal.css';

interface ShutdownConfirmModalProps {
  sessionCount?: number;
}

export function ShutdownConfirmModal(props: ShutdownConfirmModalProps) {
  const handleOverlayClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) cancelShutdown();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') cancelShutdown();
  };

  return (
    <Show when={shutdownConfirmVisible()}>
      <div class={styles.overlay} onClick={handleOverlayClick} onKeyDown={handleKeyDown}>
        <div class={styles.panel}>
          <h2 class={styles.title}>Terminate session?</h2>

          <Show when={props.sessionCount != null && props.sessionCount > 0}>
            <p class={styles.sessionInfo}>
              {props.sessionCount} session{props.sessionCount === 1 ? '' : 's'} active today
            </p>
          </Show>

          <div class={styles.actions}>
            <button class={styles.cancelButton} onClick={cancelShutdown}>
              Cancel
            </button>
            <button class={styles.shutdownButton} onClick={confirmShutdown}>
              Shutdown
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}
