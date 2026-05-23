// Author: Subash Karki

import type { Component } from 'solid-js';
import { createSignal, createMemo } from 'solid-js';
import {
  sendToPersona,
  isVoiceSupported,
  voiceState,
  interimTranscript,
  startVoiceInput,
  stopVoiceInput,
} from '@/core/persona/signals';
import * as styles from './PersonaDropdown.css';

export const PersonaInput: Component = () => {
  const [value, setValue] = createSignal('');
  const [loading, setLoading] = createSignal(false);

  const isListening = createMemo(() => voiceState() === 'listening');

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

  const handleMicClick = () => {
    if (isListening()) {
      stopVoiceInput();
    } else {
      startVoiceInput();
    }
  };

  const placeholder = createMemo(() => {
    if (loading()) return 'Thinking...';
    if (isListening()) return interimTranscript() || 'Listening...';
    return 'Ask Phantom anything…';
  });

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
        value={isListening() ? interimTranscript() : value()}
        onInput={(e) => {
          if (!isListening()) setValue(e.currentTarget.value);
        }}
        onKeyDown={handleKeyDown}
        disabled={loading() || isListening()}
        placeholder={placeholder()}
        aria-label="Message input"
        autocomplete="off"
      />
      <button
        class={isListening() ? styles.micButtonActive : styles.micButton}
        type="button"
        onClick={handleMicClick}
        disabled={loading() || !isVoiceSupported()}
        aria-label={
          !isVoiceSupported()
            ? 'Voice input unavailable in this runtime'
            : isListening()
              ? 'Stop listening'
              : 'Start voice input'
        }
        title={
          !isVoiceSupported()
            ? 'Voice input unavailable in this runtime'
            : isListening()
              ? 'Stop listening'
              : 'Voice input'
        }
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
      </button>
      <button
        class={styles.sendButton}
        type="button"
        onClick={handleSubmit}
        disabled={loading() || !value().trim() || isListening()}
        aria-label="Send message"
      >
        Send
      </button>
    </div>
  );
};
