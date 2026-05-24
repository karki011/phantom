// Author: Subash Karki

/**
 * Voice engine for Phantom Persona — wraps Web Speech API for STT/TTS.
 * Falls back to Go `say` binding when browser TTS is unavailable.
 */

export type VoiceState = 'idle' | 'listening' | 'speaking';

export interface VoiceEngine {
  isSupported(): boolean;
  startListening(): void;
  stopListening(): void;
  speak(text: string): Promise<void>;
  stopSpeaking(): void;
  onResult(callback: (text: string, isFinal: boolean) => void): void;
  onStateChange(callback: (state: VoiceState) => void): void;
  dispose(): void;
}

type ResultCallback = (text: string, isFinal: boolean) => void;
type StateCallback = (state: VoiceState) => void;

// Fallback: call Go binding for macOS `say` command.
const goSpeak = async (text: string): Promise<void> => {
  try {
    await (window as any).go?.app?.App?.PersonaSpeak(text);
  } catch (err) {
    console.warn('[voice] Go TTS fallback failed:', err);
  }
};

/**
 * Creates a VoiceEngine backed by Web Speech API.
 * If `webkitSpeechRecognition` is missing, STT degrades to no-op.
 * If `speechSynthesis` is missing, TTS falls back to Go `say`.
 */
export function createVoiceEngine(): VoiceEngine {
  let recognition: any = null;
  let state: VoiceState = 'idle';
  let resultCallbacks: ResultCallback[] = [];
  let stateCallbacks: StateCallback[] = [];

  const hasSpeechRecognition =
    typeof window !== 'undefined' &&
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

  const setState = (next: VoiceState) => {
    if (state === next) return;
    state = next;
    for (const cb of stateCallbacks) {
      try { cb(next); } catch { /* swallow listener errors */ }
    }
  };

  const buildRecognition = () => {
    if (!hasSpeechRecognition) return null;
    const Ctor = (window as any).webkitSpeechRecognition ?? (window as any).SpeechRecognition;
    const r = new Ctor();
    r.continuous = false;
    r.interimResults = true;
    r.lang = 'en-US';
    r.maxAlternatives = 1;

    r.onresult = (event: any) => {
      const last = event.results[event.results.length - 1];
      const transcript: string = last[0].transcript;
      const isFinal: boolean = last.isFinal;
      for (const cb of resultCallbacks) {
        try { cb(transcript, isFinal); } catch { /* swallow */ }
      }
    };

    r.onerror = (event: any) => {
      // 'no-speech' and 'aborted' are non-fatal — just go idle.
      if (event.error === 'no-speech' || event.error === 'aborted') {
        setState('idle');
        return;
      }
      console.warn('[voice] recognition error:', event.error);
      setState('idle');
    };

    r.onend = () => {
      // Only go idle if we're still in listening state.
      // (If we transitioned to 'speaking' via onresult, leave it alone.)
      if (state === 'listening') {
        setState('idle');
      }
    };

    return r;
  };

  return {
    isSupported() {
      return hasSpeechRecognition;
    },

    startListening() {
      if (!hasSpeechRecognition) return;
      // Stop any in-flight recognition first.
      if (recognition) {
        try { recognition.abort(); } catch { /* ok */ }
      }
      recognition = buildRecognition();
      if (!recognition) return;
      try {
        recognition.start();
        setState('listening');
      } catch (err) {
        console.warn('[voice] failed to start recognition:', err);
      }
    },

    stopListening() {
      if (!recognition) return;
      try {
        recognition.stop();
      } catch { /* already stopped */ }
      recognition = null;
      if (state === 'listening') {
        setState('idle');
      }
    },

    async speak(text: string) {
      if (!text) return;
      // Always use Go binding (macOS `say`) — browser speechSynthesis is
      // unreliable / unavailable in WKWebView.
      setState('speaking');
      await goSpeak(text);
      setState('idle');
    },

    stopSpeaking() {
      // Note: cannot cancel Go-side `say` process from here — just reset state.
      // Future: send a cancel signal to Go if needed.
      if (state === 'speaking') {
        setState('idle');
      }
    },

    onResult(callback: ResultCallback) {
      resultCallbacks.push(callback);
    },

    onStateChange(callback: StateCallback) {
      stateCallbacks.push(callback);
    },

    dispose() {
      if (recognition) {
        try { recognition.abort(); } catch { /* ok */ }
        recognition = null;
      }
      resultCallbacks = [];
      stateCallbacks = [];
      setState('idle');
    },
  };
}
