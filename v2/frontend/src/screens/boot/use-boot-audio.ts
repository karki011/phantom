import { onCleanup } from 'solid-js';
import type { BootPhase } from './particle-math';

export function useBootAudio() {
  let ctx: AudioContext | null = null;
  let hum: OscillatorNode | null = null;
  let humGain: GainNode | null = null;

  function init() {
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
  }

  function bassHit() {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(55, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  }

  function startHum() {
    if (!ctx) return;
    hum = ctx.createOscillator();
    humGain = ctx.createGain();
    hum.type = 'sine';
    hum.frequency.value = 45;
    humGain.gain.setValueAtTime(0, ctx.currentTime);
    humGain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.5);
    hum.connect(humGain).connect(ctx.destination);
    hum.start();
  }

  function fadeHum() {
    if (!ctx || !hum || !humGain) return;
    humGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
    hum.stop(ctx.currentTime + 0.6);
    hum = null;
    humGain = null;
  }

  function onPhase(phase: BootPhase) {
    switch (phase) {
      case 'BURST':
        init();
        bassHit();
        break;
      case 'CONFIRM':
        startHum();
        break;
      case 'DISMISS':
        fadeHum();
        break;
    }
  }

  onCleanup(() => {
    if (hum) { try { hum.stop(); } catch { /* already stopped */ } }
    if (ctx) { ctx.close(); }
  });

  return { onPhase };
}
