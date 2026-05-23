// Author: Subash Karki

import { createMemo } from 'solid-js';
import { pillState, statusText, togglePersonaExpanded } from '@/core/persona/signals';
import * as styles from './PersonaPill.css';

export function PersonaPill() {
  const dotClass = createMemo(() => {
    switch (pillState()) {
      case 'observing':  return styles.dotObserving;
      case 'attention':  return styles.dotAttention;
      case 'listening':  return styles.dotListening;
      case 'speaking':   return styles.dotSpeaking;
      default:           return styles.dotIdle;
    }
  });

  return (
    <button
      type="button"
      class={styles.pill}
      aria-label="Phantom persona"
      aria-expanded={false}
      onClick={() => togglePersonaExpanded()}
    >
      <span class={dotClass()} aria-hidden="true" />
      <span class={styles.statusLabel}>{statusText()}</span>
      <span class={styles.shortcutHint} aria-hidden="true">⌘⌘</span>
    </button>
  );
}
