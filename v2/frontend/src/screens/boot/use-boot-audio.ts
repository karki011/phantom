import { onCleanup } from 'solid-js';

export type BootPhase = 'BURST' | 'CONVERGE' | 'CONFIRM' | 'DISMISS';

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

  let blipPitch = 800;

  function scanBlip() {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = blipPitch;
    blipPitch += 40;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  }

  function nominalChime() {
    if (!ctx) return;
    [600, 800, 1200].forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const t = ctx!.currentTime + i * 0.1;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
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

  return { onPhase, scanBlip, nominalChime };
}
