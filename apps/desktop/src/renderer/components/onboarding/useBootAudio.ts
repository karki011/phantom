import { useRef, useCallback, useEffect } from 'react';

export type SoundCue = 'typing' | 'scan' | 'ok' | 'reveal' | 'whoosh' | 'bass' | 'hum_start' | 'hum_stop';

let audioCtx: AudioContext | null = null;
function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playTone(
  ctx: AudioContext,
  freq: number,
  duration: number,
  gain: number,
  type: OscillatorType = 'sine',
  freqEnd?: number,
): void {
  const osc = ctx.createOscillator();
  const vol = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  if (freqEnd) osc.frequency.linearRampToValueAtTime(freqEnd, ctx.currentTime + duration);
  vol.gain.setValueAtTime(gain, ctx.currentTime);
  vol.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(vol).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

const SOUNDS: Record<SoundCue, (ctx: AudioContext, volume: number) => void> = {
  typing: (ctx, v) => playTone(ctx, 800 + Math.random() * 400, 0.03, v * 0.15, 'square'),
  scan: (ctx, v) => {
    playTone(ctx, 1200, 0.15, v * 0.2, 'sine', 1800);
    playTone(ctx, 600, 0.15, v * 0.1, 'sine', 900);
  },
  ok: (ctx, v) => {
    playTone(ctx, 523, 0.1, v * 0.25, 'sine');
    setTimeout(() => playTone(ctx, 659, 0.15, v * 0.25, 'sine'), 100);
  },
  reveal: (ctx, v) => {
    playTone(ctx, 400, 0.3, v * 0.3, 'sine', 800);
    playTone(ctx, 200, 0.3, v * 0.15, 'triangle', 400);
  },
  whoosh: (ctx, v) => playTone(ctx, 200, 0.25, v * 0.2, 'sawtooth', 2000),
  bass: (ctx, v) => {
    playTone(ctx, 80, 0.6, v * 0.4, 'sine');
    playTone(ctx, 160, 0.4, v * 0.2, 'triangle');
    playTone(ctx, 40, 0.8, v * 0.3, 'sine');
  },
  hum_start: () => { /* handled by the hum oscillator below */ },
  hum_stop: () => { /* handled by the hum oscillator below */ },
};

export function useBootAudio(volume = 0.5) {
  const humRef = useRef<{ osc: OscillatorNode; gain: GainNode } | null>(null);

  const play = useCallback((cue: SoundCue) => {
    const ctx = getCtx();
    if (cue === 'hum_start') {
      if (humRef.current) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(55, ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(volume * 0.12, ctx.currentTime + 1.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      humRef.current = { osc, gain };
      return;
    }
    if (cue === 'hum_stop') {
      if (!humRef.current) return;
      const { osc, gain } = humRef.current;
      gain.gain.linearRampToValueAtTime(0, getCtx().currentTime + 1);
      osc.stop(getCtx().currentTime + 1.2);
      humRef.current = null;
      return;
    }
    SOUNDS[cue](ctx, volume);
  }, [volume]);

  useEffect(() => {
    return () => {
      if (humRef.current) {
        humRef.current.osc.stop();
        humRef.current = null;
      }
    };
  }, []);

  return { play };
}
