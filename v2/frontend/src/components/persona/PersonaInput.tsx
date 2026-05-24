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
  voiceEnabled,
  toggleVoice,
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

  const [micTooltip, setMicTooltip] = createSignal('');

  const handleMicClick = () => {
    if (!isVoiceSupported()) {
      // STT not available in WKWebView — show transient feedback.
      setMicTooltip('Voice input unavailable — type your question');
      setTimeout(() => setMicTooltip(''), 2500);
      inputRef?.focus();
      return;
    }
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
        disabled={loading()}
        style={!isVoiceSupported() ? { opacity: '0.5' } : undefined}
        aria-label={
          !isVoiceSupported()
            ? 'Voice input unavailable — click for info'
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
      {/* Voice TTS toggle — controls whether responses are spoken aloud */}
      <button
        class={styles.micButton}
        type="button"
        onClick={toggleVoice}
        aria-label={voiceEnabled() ? 'Mute voice output' : 'Unmute voice output'}
        title={voiceEnabled() ? 'Voice on — click to mute' : 'Voice off — click to unmute'}
        style={!voiceEnabled() ? { opacity: '0.4' } : undefined}
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
          {voiceEnabled() ? (
            <>
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </>
          ) : (
            <>
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </>
          )}
        </svg>
      </button>
      {micTooltip() && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          'margin-bottom': '6px',
          padding: '4px 10px',
          'border-radius': '6px',
          background: 'var(--phantom-bg-secondary, #1e1e2e)',
          color: 'var(--phantom-text-primary, #cdd6f4)',
          'font-size': '12px',
          'white-space': 'nowrap',
          'pointer-events': 'none',
          'z-index': '100',
        }}>
          {micTooltip()}
        </div>
      )}
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
