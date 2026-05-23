// Author: Subash Karki

import { createSignal, createMemo } from 'solid-js';
import type { PillState, PersonaState, PersonaResponse, Message } from './types';
import { personaGetState, personaGetHistory, personaAsk } from './bindings';

const [personaState, setPersonaState] = createSignal<PersonaState>({
  pillState: 'idle',
  statusText: 'Phantom',
  activeProject: '',
  expanded: false,
});

const [messages, setMessages] = createSignal<Message[]>([]);
const [isExpanded, setIsExpanded] = createSignal(false);
const [lastResponse, setLastResponse] = createSignal<PersonaResponse | null>(null);

export const pillState = createMemo<PillState>(() => personaState().pillState);
export const statusText = createMemo(() => personaState().statusText);
export const personaMessages = messages;
export const personaExpanded = isExpanded;
export const togglePersonaExpanded = () => setIsExpanded((v) => !v);
export const closePersona = () => setIsExpanded(false);
export const openPersona = () => setIsExpanded(true);

export async function sendToPersona(input: string): Promise<PersonaResponse> {
  const userMsg: Message = { role: 'user', text: input, timestamp: new Date().toISOString() };
  setMessages((prev) => [...prev, userMsg]);

  const resp = await personaAsk(input);

  const phantomMsg: Message = { role: 'phantom', text: resp.text, timestamp: new Date().toISOString() };
  setMessages((prev) => [...prev, phantomMsg]);
  setLastResponse(resp);
  return resp;
}

export function initPersonaSignals() {
  personaGetState().then(setPersonaState);
  personaGetHistory().then((h) => {
    if (h.length > 0) setMessages(h);
  });

  if (typeof window !== 'undefined' && (window as any).runtime) {
    (window as any).runtime.EventsOn('persona:state', (data: PersonaState) => {
      setPersonaState(data);
    });
    (window as any).runtime.EventsOn('persona:response', (data: PersonaResponse) => {
      setLastResponse(data);
    });
  }
}

let lastMetaDown = 0;

export function setupDoubleTapMeta() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Meta' && !e.repeat) {
      const now = Date.now();
      if (now - lastMetaDown < 300) {
        e.preventDefault();
        setIsExpanded((v) => !v);
        lastMetaDown = 0;
      } else {
        lastMetaDown = now;
      }
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.key !== 'Meta') {
      lastMetaDown = 0;
    }
  });
}
