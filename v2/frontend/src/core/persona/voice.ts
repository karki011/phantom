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
  let currentUtterance: SpeechSynthesisUtterance | null = null;

  const hasSpeechRecognition =
    typeof window !== 'undefined' &&
    ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);

  const hasSpeechSynthesis =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

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

  /** Pick a good macOS voice for TTS. Prefer Samantha / Alex / system default. */
  const pickVoice = (): SpeechSynthesisVoice | null => {
    if (!hasSpeechSynthesis) return null;
    const voices = speechSynthesis.getVoices();
    // Prefer English voices that sound natural.
    const preferred = ['Samantha', 'Alex', 'Karen', 'Daniel'];
    for (const name of preferred) {
      const v = voices.find((v) => v.name === name);
      if (v) return v;
    }
    // Fallback to first English voice.
    return voices.find((v) => v.lang.startsWith('en')) ?? voices[0] ?? null;
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

      // Try browser TTS first.
      if (hasSpeechSynthesis) {
        return new Promise<void>((resolve) => {
          // Cancel any in-progress speech.
          speechSynthesis.cancel();

          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 1.05;
          utterance.pitch = 1.0;
          utterance.volume = 1.0;

          const voice = pickVoice();
          if (voice) utterance.voice = voice;

          currentUtterance = utterance;

          utterance.onstart = () => setState('speaking');
          utterance.onend = () => {
            currentUtterance = null;
            setState('idle');
            resolve();
          };
          utterance.onerror = () => {
            currentUtterance = null;
            setState('idle');
            resolve();
          };

          speechSynthesis.speak(utterance);
        });
      }

      // Fallback to Go binding.
      setState('speaking');
      await goSpeak(text);
      setState('idle');
    },

    stopSpeaking() {
      if (hasSpeechSynthesis) {
        speechSynthesis.cancel();
      }
      currentUtterance = null;
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
      if (hasSpeechSynthesis) {
        speechSynthesis.cancel();
      }
      resultCallbacks = [];
      stateCallbacks = [];
      setState('idle');
    },
  };
}
