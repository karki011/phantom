// Author: Subash Karki

import type { Component } from 'solid-js';
import { createEffect, For, Show } from 'solid-js';
import { personaExpanded, closePersona, personaMessages, statusText, personaThinking } from '@/core/persona/signals';
import { PersonaMessage } from './PersonaMessage';
import { PersonaInput } from './PersonaInput';
import { PersonaQuickActions } from './PersonaQuickActions';
import * as styles from './PersonaDropdown.css';

export const PersonaDropdown: Component = () => {
  let chatRef: HTMLDivElement | undefined;

  createEffect(() => {
    const msgs = personaMessages();
    if (msgs.length > 0 && chatRef) {
      chatRef.scrollTop = chatRef.scrollHeight;
    }
  });

  return (
    <Show when={personaExpanded()}>
      <div
        class={styles.overlay}
        onClick={closePersona}
        aria-hidden="true"
      />
      <div
        class={styles.dropdown}
        role="dialog"
        aria-label="Phantom assistant"
        onClick={(e) => e.stopPropagation()}
      >
        <div class={styles.statusBanner}>
          <span class={styles.statusDot} />
          <span class={styles.statusLabel}>{statusText()}</span>
        </div>

        <PersonaQuickActions />

        <div class={styles.chatArea} ref={chatRef}>
          <Show
            when={personaMessages().length > 0}
            fallback={
              <div class={styles.emptyChat}>Ask Phantom anything…</div>
            }
          >
            <For each={personaMessages()}>
              {(msg) => <PersonaMessage message={msg} />}
            </For>
            <Show when={personaThinking()}>
              <div class={styles.thinkingBubble}>
                <span class={styles.thinkingDot} />
                <span class={styles.thinkingDot} />
                <span class={styles.thinkingDot} />
              </div>
            </Show>
          </Show>
        </div>

        <PersonaInput />
      </div>
    </Show>
  );
};
