// Author: Subash Karki

type SoundCue = 'typing' | 'scan' | 'ok' | 'reveal' | 'whoosh' | 'bass' | 'ceremony' | 'droplet' | 'hum_start' | 'hum_stop';

let ctx: AudioContext | null = null;
let humOsc: OscillatorNode | null = null;
let humGain: GainNode | null = null;
let keepAliveOsc: OscillatorNode | null = null;
let enabled = true;
let volume = 0.5;

function getCtx(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext();
    startKeepAlive(ctx);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function startKeepAlive(c: AudioContext): void {
  if (keepAliveOsc) return;
  keepAliveOsc = c.createOscillator();
  const silentGain = c.createGain();
  silentGain.gain.value = 0;
  keepAliveOsc.connect(silentGain).connect(c.destination);
  keepAliveOsc.start();
}

function playTone(
  freq: number,
  endFreq: number,
  duration: number,
  type: OscillatorType = 'sine',
  gain: number = 0.15,
  delay: number = 0,
): void {
  if (!enabled) return;
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + delay);
  osc.frequency.exponentialRampToValueAtTime(endFreq, c.currentTime + delay + duration);
  g.gain.setValueAtTime(gain * volume, c.currentTime + delay);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + duration);
  osc.connect(g).connect(c.destination);
  osc.start(c.currentTime + delay);
  osc.stop(c.currentTime + delay + duration);
}

function playChord(tones: { freq: number; endFreq: number; type?: OscillatorType }[], duration: number, gain: number = 0.1): void {
  tones.forEach((t) => playTone(t.freq, t.endFreq, duration, t.type ?? 'sine', gain));
}

const cues: Record<SoundCue, () => void> = {
  typing: () => {
    const freq = 800 + Math.random() * 400;
    playTone(freq, freq * 1.1, 0.03, 'square', 0.04);
  },
  scan: () => {
    playTone(1200, 1800, 0.15, 'sine', 0.08);
    playTone(600, 900, 0.15, 'sine', 0.06, 0.05);
  },
  ok: () => {
    playTone(523, 523, 0.12, 'sine', 0.12);
    playTone(659, 659, 0.12, 'sine', 0.10, 0.08);
  },
  reveal: () => {
    playTone(400, 800, 0.3, 'sine', 0.1);
    playTone(200, 400, 0.3, 'triangle', 0.06, 0.05);
  },
  whoosh: () => {
    playTone(200, 2000, 0.15, 'sawtooth', 0.06);
  },
  bass: () => {
    playChord([
      { freq: 80, endFreq: 80, type: 'sine' },
      { freq: 160, endFreq: 160, type: 'sine' },
      { freq: 40, endFreq: 40, type: 'triangle' },
    ], 0.4, 0.08);
  },
  droplet: () => {
    playTone(500, 350, 0.15, 'sine', 0.1);
  },
  ceremony: () => {
    // Grand ascending fanfare for rank-up celebrations
    playTone(330, 330, 0.2, 'sine', 0.12);
    playTone(392, 392, 0.2, 'sine', 0.12, 0.15);
    playTone(494, 494, 0.2, 'sine', 0.12, 0.3);
    playTone(659, 659, 0.4, 'sine', 0.15, 0.45);
    playChord([
      { freq: 330, endFreq: 330, type: 'sine' },
      { freq: 494, endFreq: 494, type: 'sine' },
      { freq: 659, endFreq: 659, type: 'sine' },
    ], 0.6, 0.1);
  },
  hum_start: () => {
    if (humOsc) return;
    const c = getCtx();
    humOsc = c.createOscillator();
    humGain = c.createGain();
    humOsc.type = 'sine';
    humOsc.frequency.value = 55;
    humGain.gain.setValueAtTime(0, c.currentTime);
    humGain.gain.linearRampToValueAtTime(0.06 * volume, c.currentTime + 1.5);
    humOsc.connect(humGain).connect(c.destination);
    humOsc.start();
  },
  hum_stop: () => {
    if (!humGain || !humOsc) return;
    const c = getCtx();
    humGain.gain.linearRampToValueAtTime(0, c.currentTime + 1);
    humOsc.stop(c.currentTime + 1.1);
    humOsc = null;
    humGain = null;
  },
};

export function playSound(cue: SoundCue): void {
  try {
    cues[cue]();
  } catch {
    // Audio failures are non-fatal
  }
}

export function setAudioEnabled(on: boolean): void {
  enabled = on;
  if (!on && humOsc) cues.hum_stop();
}

export function setAudioVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
}

export function isAudioEnabled(): boolean {
  return enabled;
}

// ── Speech synthesis ─────────────────────────────────────────────────────────

let speechEnabled = true;
let speechRate = 0.95;
let preferredVoice: SpeechSynthesisVoice | null = null;

function pickVoice(): SpeechSynthesisVoice | null {
  if (preferredVoice) return preferredVoice;
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const preferred = ['Samantha (Enhanced)', 'Samantha', 'Alex', 'Daniel', 'Karen', 'Moira', 'Tessa'];
  for (const name of preferred) {
    const match = voices.find((v) => v.name.includes(name) && v.lang.startsWith('en'));
    if (match) { preferredVoice = match; return match; }
  }
  const english = voices.find((v) => v.lang.startsWith('en'));
  if (english) { preferredVoice = english; return english; }
  return voices[0] ?? null;
}

export function speak(text: string, rate?: number, pitch?: number): Promise<void> {
  return new Promise((resolve) => {
    if (!enabled || !speechEnabled || !window.speechSynthesis) {
      resolve();
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const voice = pickVoice();
      if (voice) utterance.voice = voice;
      utterance.rate = rate ?? speechRate;
      utterance.pitch = pitch ?? 0.9;
      utterance.volume = volume;

      let resolved = false;
      const done = () => { if (!resolved) { resolved = true; resolve(); } };

      utterance.onend = done;
      utterance.onerror = done;

      const maxWait = (text.length / 12) * 1000 / (rate ?? speechRate) + 3000;
      setTimeout(done, maxWait);

      window.speechSynthesis.speak(utterance);
    } catch {
      resolve();
    }
  });
}

export function setSpeechEnabled(on: boolean): void {
  speechEnabled = on;
  if (!on) window.speechSynthesis?.cancel();
}

export function isSpeechEnabled(): boolean {
  return speechEnabled;
}

export type { SoundCue };
