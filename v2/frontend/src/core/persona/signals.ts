// Author: Subash Karki

import { createSignal, createMemo } from 'solid-js';
import type { PillState, PersonaState, PersonaResponse, Message } from './types';
import { personaGetState, personaGetHistory, personaAsk, personaSpeak } from './bindings';
import { createVoiceEngine, type VoiceEngine, type VoiceState } from './voice';

const [personaState, setPersonaState] = createSignal<PersonaState>({
  pillState: 'idle',
  statusText: 'Phantom',
  activeProject: '',
  expanded: false,
});

const [messages, setMessages] = createSignal<Message[]>([]);
const [isExpanded, setIsExpanded] = createSignal(false);
const [lastResponse, setLastResponse] = createSignal<PersonaResponse | null>(null);
const [isThinking, setIsThinking] = createSignal(false);

// ─── Voice preference ─────────────────────────────────────────────────────
const [voiceEnabled, setVoiceEnabled] = createSignal(true);
export { voiceEnabled };
export const toggleVoice = () => setVoiceEnabled((v) => !v);

// ─── Voice engine ──────────────────────────────────────────────────────────
let voiceEngine: VoiceEngine | null = null;
const [voiceState, setVoiceState] = createSignal<VoiceState>('idle');
const [interimTranscript, setInterimTranscript] = createSignal('');

export const isVoiceSupported = createMemo(() => {
  return voiceEngine?.isSupported() ?? false;
});
export { voiceState, interimTranscript };

export const pillState = createMemo<PillState>(() => {
  // Voice state overrides the backend pill state for visual feedback.
  const vs = voiceState();
  if (vs === 'listening') return 'listening';
  if (vs === 'speaking') return 'speaking';
  return personaState().pillState;
});
export const statusText = createMemo(() => {
  const vs = voiceState();
  if (vs === 'listening') return 'Listening...';
  if (vs === 'speaking') return 'Speaking...';
  return personaState().statusText;
});
export const personaMessages = messages;
export const personaExpanded = isExpanded;
export const personaThinking = isThinking;
export const togglePersonaExpanded = () => setIsExpanded((v) => !v);
export const closePersona = () => setIsExpanded(false);
export const openPersona = () => setIsExpanded(true);

export async function sendToPersona(input: string): Promise<PersonaResponse> {
  const userMsg: Message = { role: 'user', text: input, timestamp: new Date().toISOString() };
  setMessages((prev) => [...prev, userMsg]);
  setIsThinking(true);

  try {
    const resp = await personaAsk(input);
    const phantomMsg: Message = { role: 'phantom', text: resp.text, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, phantomMsg]);
    setLastResponse(resp);

    // Always speak the response via Go TTS (macOS `say`) when voice is enabled.
    if (voiceEnabled()) {
      const speakText = resp.speak || resp.text;
      if (speakText) {
        personaSpeak(speakText);
      }
    }

    return resp;
  } finally {
    setIsThinking(false);
  }
}

// ─── Voice control ─────────────────────────────────────────────────────────

/**
 * Start voice input. Transcribes speech, sends final result to Persona,
 * then speaks the response aloud.
 */
export function startVoiceInput() {
  if (!voiceEngine || !voiceEngine.isSupported()) return;
  setInterimTranscript('');
  voiceEngine.startListening();
}

/** Stop voice input (cancels in-flight recognition). */
export function stopVoiceInput() {
  if (!voiceEngine) return;
  voiceEngine.stopListening();
  setInterimTranscript('');
}

/** Stop any in-progress speech output. */
export function stopSpeaking() {
  if (!voiceEngine) return;
  voiceEngine.stopSpeaking();
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

  // Initialize voice engine.
  voiceEngine = createVoiceEngine();

  voiceEngine.onStateChange((vs) => {
    setVoiceState(vs);
  });

  voiceEngine.onResult((text, isFinal) => {
    setInterimTranscript(text);
    if (isFinal && text.trim()) {
      setInterimTranscript('');
      // Send to Persona — TTS is handled inside sendToPersona now.
      sendToPersona(text.trim());
    }
  });
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
