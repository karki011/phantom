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

  function ghostCall() {
    if (!ctx) return;
    const now = ctx.currentTime;

    // Ethereal "wooo" — descending sine
    const top = ctx.createOscillator();
    const topGain = ctx.createGain();
    top.type = 'sine';
    top.frequency.setValueAtTime(440, now);
    top.frequency.exponentialRampToValueAtTime(220, now + 0.85);
    topGain.gain.setValueAtTime(0, now);
    topGain.gain.linearRampToValueAtTime(0.1, now + 0.12);
    topGain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
    top.connect(topGain).connect(ctx.destination);
    top.start(now);
    top.stop(now + 1.0);

    // Low fundamental
    const low = ctx.createOscillator();
    const lowGain = ctx.createGain();
    low.type = 'sine';
    low.frequency.setValueAtTime(220, now + 0.05);
    low.frequency.exponentialRampToValueAtTime(110, now + 0.9);
    lowGain.gain.setValueAtTime(0, now + 0.05);
    lowGain.gain.linearRampToValueAtTime(0.07, now + 0.18);
    lowGain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
    low.connect(lowGain).connect(ctx.destination);
    low.start(now + 0.05);
    low.stop(now + 1.05);

    // Vibrato shimmer
    const shimmer = ctx.createOscillator();
    const shimmerGain = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    shimmer.type = 'triangle';
    shimmer.frequency.setValueAtTime(660, now);
    lfo.type = 'sine';
    lfo.frequency.value = 7;
    lfoGain.gain.value = 14;
    lfo.connect(lfoGain).connect(shimmer.frequency);
    shimmerGain.gain.setValueAtTime(0, now);
    shimmerGain.gain.linearRampToValueAtTime(0.04, now + 0.18);
    shimmerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
    shimmer.connect(shimmerGain).connect(ctx.destination);
    shimmer.start(now);
    lfo.start(now);
    shimmer.stop(now + 0.8);
    lfo.stop(now + 0.8);
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

  return { onPhase, scanBlip, nominalChime, ghostCall };
}
