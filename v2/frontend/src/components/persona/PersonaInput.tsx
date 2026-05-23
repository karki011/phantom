// Author: Subash Karki

import type { Component } from 'solid-js';
import { createSignal } from 'solid-js';
import { sendToPersona } from '@/core/persona/signals';
import * as styles from './PersonaDropdown.css';

export const PersonaInput: Component = () => {
  const [value, setValue] = createSignal('');
  const [loading, setLoading] = createSignal(false);

  const handleSubmit = async () => {
    const text = value().trim();
    if (!text || loading()) return;

    setValue('');
    setLoading(true);
    try {
      await sendToPersona(text);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  let inputRef: HTMLInputElement | undefined;

  return (
    <div class={styles.inputArea}>
      <input
        ref={(el) => {
          inputRef = el;
          requestAnimationFrame(() => el.focus());
        }}
        class={styles.inputBox}
        type="text"
        value={value()}
        onInput={(e) => setValue(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        disabled={loading()}
        placeholder={loading() ? 'Thinking...' : 'Ask Phantom anything…'}
        aria-label="Message input"
        autocomplete="off"
      />
      <button
        class={styles.sendButton}
        type="button"
        onClick={handleSubmit}
        disabled={loading() || !value().trim()}
        aria-label="Send message"
      >
        Send
      </button>
    </div>
  );
};
