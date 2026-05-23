// Author: Subash Karki

import type { Component } from 'solid-js';
import type { Message } from '@/core/persona/types';
import * as styles from './PersonaDropdown.css';

interface PersonaMessageProps {
  message: Message;
}

export const PersonaMessage: Component<PersonaMessageProps> = (props) => {
  const isUser = () => props.message.role === 'user';

  const formattedTime = () => {
    const d = new Date(props.message.timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div class={isUser() ? styles.messageUser : styles.messagePhantom}>
      {props.message.text}
      <div class={styles.messageTimestamp}>{formattedTime()}</div>
    </div>
  );
};
