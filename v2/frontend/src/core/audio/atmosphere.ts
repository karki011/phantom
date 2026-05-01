// Author: Subash Karki

import type { PhaseId } from '../../screens/onboarding/config/types';

// ---------------------------------------------------------------------------
// Phase-indexed gain / parameter tables
// ---------------------------------------------------------------------------

interface PhaseParams {
  subDrone: number;
  darkPadGain: number;
  darkPadCutoff: number;
  tensionGain: number;
  pulseHz: number;
}

const PHASE_MAP: Record<PhaseId, PhaseParams> = {
  awakening:       { subDrone: 0.012, darkPadGain: 0,     darkPadCutoff: 200,  tensionGain: 0,     pulseHz: 0.7 },
  'deps-check':    { subDrone: 0.016, darkPadGain: 0.008, darkPadCutoff: 250,  tensionGain: 0,     pulseHz: 0.9 },
  'identity-bind': { subDrone: 0.020, darkPadGain: 0.015, darkPadCutoff: 350,  tensionGain: 0.012, pulseHz: 1.1 },
  'domain-select': { subDrone: 0.020, darkPadGain: 0.020, darkPadCutoff: 400,  tensionGain: 0.020, pulseHz: 1.3 },
  'domain-link':   { subDrone: 0.024, darkPadGain: 0.020, darkPadCutoff: 450,  tensionGain: 0.016, pulseHz: 1.3 },
  'ai-engine':     { subDrone: 0.028, darkPadGain: 0.024, darkPadCutoff: 500,  tensionGain: 0.024, pulseHz: 1.5 },
  'ability-awaken':{ subDrone: 0.032, darkPadGain: 0.028, darkPadCutoff: 600,  tensionGain: 0,     pulseHz: 2.0 },
  complete:        { subDrone: 0.032, darkPadGain: 0.028, darkPadCutoff: 600,  tensionGain: 0,     pulseHz: 0   },
};

const TRANSITION_TIME = 1.5;
const COMPLETE_RAMP_TIME = 0.5;
const COMPLETE_SILENCE_GAP = 1.8;
const RESOLUTION_SUSTAIN = 3;
const RESOLUTION_RELEASE = 2;

// Cmaj9: C3, G3, D4, B4
const RESOLUTION_CHORD = [130.81, 196, 293.66, 493.88];

// ---------------------------------------------------------------------------
// BackgroundAtmosphere
// ---------------------------------------------------------------------------

export interface BackgroundAtmosphere {
  start: () => void;
  setPhase: (id: PhaseId) => void;
  stop: () => void;
}

export const createAtmosphere = (
  ctx: AudioContext,
  getVolume: () => number,
): BackgroundAtmosphere => {
  // -- Shared state --
  let running = false;
  let stopped = false;
  let currentPhase: PhaseId = 'awakening';

  // -- Node references for cleanup --
  const allNodes: AudioNode[] = [];
  const allOscillators: OscillatorNode[] = [];
  const timers: number[] = [];

  const track = <T extends AudioNode>(node: T): T => {
    allNodes.push(node);
    return node;
  };

  const trackOsc = (osc: OscillatorNode): OscillatorNode => {
    allOscillators.push(osc);
    return track(osc);
  };

  const scheduleTimer = (fn: () => void, ms: number): number => {
    const id = window.setTimeout(fn, ms);
    timers.push(id);
    return id;
  };

  const vol = (): number => getVolume();

  // Smooth ramp helper — avoids exponentialRamp to 0 (illegal)
  const rampGain = (
    param: AudioParam,
    target: number,
    duration: number,
    startTime?: number,
  ): void => {
    const t = startTime ?? ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value || 0.0001, t);
    if (target <= 0.0001) {
      param.linearRampToValueAtTime(0.0001, t + duration);
    } else {
      param.exponentialRampToValueAtTime(target, t + duration);
    }
  };

  // -----------------------------------------------------------------------
  // Layer 1: Sub-Drone ("The Abyss")
  // -----------------------------------------------------------------------
  let droneSine: OscillatorNode;
  let droneTriangle: OscillatorNode;
  let droneGain: GainNode;
  let droneLfo: OscillatorNode;
  let droneLfoGain: GainNode;
  let droneFilter: BiquadFilterNode;

  const initSubDrone = (): void => {
    try {
      droneGain = track(ctx.createGain());
      droneGain.gain.value = 0.0001;

      droneFilter = track(ctx.createBiquadFilter());
      droneFilter.type = 'lowpass';
      droneFilter.frequency.value = 100;

      // Sine at 35Hz
      droneSine = trackOsc(ctx.createOscillator());
      droneSine.type = 'sine';
      droneSine.frequency.value = 35;

      // Triangle at 70Hz, +3 cents detune
      droneTriangle = trackOsc(ctx.createOscillator());
      droneTriangle.type = 'triangle';
      droneTriangle.frequency.value = 70;
      droneTriangle.detune.value = 3;

      // LFO at 0.05Hz modulates gain ±20%
      droneLfo = trackOsc(ctx.createOscillator());
      droneLfo.type = 'sine';
      droneLfo.frequency.value = 0.05;

      droneLfoGain = track(ctx.createGain());
      droneLfoGain.gain.value = 0.1; // ±10% depth — subtle breathing

      droneLfo.connect(droneLfoGain);
      droneLfoGain.connect(droneGain.gain);

      droneSine.connect(droneFilter);
      droneTriangle.connect(droneFilter);
      droneFilter.connect(droneGain);
      droneGain.connect(ctx.destination);

      droneSine.start();
      droneTriangle.start();
      droneLfo.start();
    } catch {
      // Audio failures are non-fatal
    }
  };

  // -----------------------------------------------------------------------
  // Layer 2: Dark Pad ("The Depths")
  // -----------------------------------------------------------------------
  let padOsc1: OscillatorNode;
  let padOsc2: OscillatorNode;
  let padGain: GainNode;
  let padFilter: BiquadFilterNode;
  let padLfo: OscillatorNode;
  let padLfoGain: GainNode;

  const initDarkPad = (): void => {
    try {
      padGain = track(ctx.createGain());
      padGain.gain.value = 0.0001;

      padFilter = track(ctx.createBiquadFilter());
      padFilter.type = 'lowpass';
      padFilter.frequency.value = 200;
      padFilter.Q.value = 4;

      // Sawtooth at 110Hz
      padOsc1 = trackOsc(ctx.createOscillator());
      padOsc1.type = 'sawtooth';
      padOsc1.frequency.value = 110;

      // Sawtooth at 165Hz, -12 cents
      padOsc2 = trackOsc(ctx.createOscillator());
      padOsc2.type = 'sawtooth';
      padOsc2.frequency.value = 165;
      padOsc2.detune.value = -12;

      // LFO at 0.03Hz sweeps cutoff 200–600Hz
      padLfo = trackOsc(ctx.createOscillator());
      padLfo.type = 'sine';
      padLfo.frequency.value = 0.03;

      padLfoGain = track(ctx.createGain());
      padLfoGain.gain.value = 200; // ±200Hz around center (400Hz midpoint → 200–600 range)

      padLfo.connect(padLfoGain);
      padLfoGain.connect(padFilter.frequency);

      padOsc1.connect(padFilter);
      padOsc2.connect(padFilter);
      padFilter.connect(padGain);
      padGain.connect(ctx.destination);

      padOsc1.start();
      padOsc2.start();
      padLfo.start();
    } catch {
      // Audio failures are non-fatal
    }
  };

  // -----------------------------------------------------------------------
  // Layer 3: Tension Texture ("Static Field")
  // -----------------------------------------------------------------------
  let noiseSource: AudioBufferSourceNode | null = null;
  let tensionGain: GainNode;
  let tensionFilter: BiquadFilterNode;
  let tensionBurstTimer: number | null = null;
  let burstOn = false;

  const createNoiseBuffer = (): AudioBuffer => {
    const length = ctx.sampleRate * 2; // 2 seconds of noise
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  };

  const initTensionTexture = (): void => {
    try {
      tensionGain = track(ctx.createGain());
      tensionGain.gain.value = 0.0001;

      tensionFilter = track(ctx.createBiquadFilter());
      tensionFilter.type = 'bandpass';
      tensionFilter.frequency.value = 2000;
      tensionFilter.Q.value = 5;

      startNoiseSource();
    } catch {
      // Audio failures are non-fatal
    }
  };

  const startNoiseSource = (): void => {
    try {
      if (noiseSource) {
        try { noiseSource.stop(); } catch { /* already stopped */ }
      }
      noiseSource = ctx.createBufferSource();
      noiseSource.buffer = createNoiseBuffer();
      noiseSource.loop = true;
      noiseSource.connect(tensionFilter);
      tensionFilter.connect(tensionGain);
      tensionGain.connect(ctx.destination);
      noiseSource.start();
      track(noiseSource);
    } catch {
      // Audio failures are non-fatal
    }
  };

  const startTensionBursts = (): void => {
    if (tensionBurstTimer !== null) return;
    const cycle = (): void => {
      if (stopped || !tensionGain) return;
      const targetGain = PHASE_MAP[currentPhase].tensionGain * vol();

      if (burstOn) {
        // Turn off for 800ms
        rampGain(tensionGain.gain, 0.0001, 0.02);
        burstOn = false;
        tensionBurstTimer = scheduleTimer(cycle, 800);
      } else {
        // Turn on for 200ms with randomized filter freq 1.5–3kHz
        const freq = 1500 + Math.random() * 1500;
        tensionFilter.frequency.setValueAtTime(freq, ctx.currentTime);
        rampGain(tensionGain.gain, Math.max(targetGain, 0.0001), 0.02);
        burstOn = true;
        tensionBurstTimer = scheduleTimer(cycle, 200);
      }
    };
    cycle();
  };

  const stopTensionBursts = (): void => {
    if (tensionBurstTimer !== null) {
      clearTimeout(tensionBurstTimer);
      tensionBurstTimer = null;
    }
    if (tensionGain) {
      rampGain(tensionGain.gain, 0.0001, TRANSITION_TIME);
    }
  };

  // -----------------------------------------------------------------------
  // Layer 4: Pulse ("Heartbeat")
  // -----------------------------------------------------------------------
  let pulseTimer: number | null = null;

  const firePulse = (): void => {
    if (stopped) return;
    try {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 45;

      const now = ctx.currentTime;
      const peakGain = 0.05 * vol();

      // Sharp attack 10ms
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(peakGain, now + 0.01);
      // Medium decay 300ms
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.31);

      osc.connect(g).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
    } catch {
      // Audio failures are non-fatal
    }
  };

  const startPulse = (hz: number): void => {
    stopPulse();
    if (hz <= 0) return;

    const interval = 1000 / hz;
    const loop = (): void => {
      if (stopped) return;
      firePulse();
      pulseTimer = scheduleTimer(loop, interval);
    };
    loop();
  };

  const stopPulse = (): void => {
    if (pulseTimer !== null) {
      clearTimeout(pulseTimer);
      pulseTimer = null;
    }
  };

  // -----------------------------------------------------------------------
  // Complete phase sequence
  // -----------------------------------------------------------------------

  const playCompleteSequence = (): void => {
    const now = ctx.currentTime;

    // 1. Ramp all layers to peak over 0.5s
    if (droneGain) rampGain(droneGain.gain, 0.04 * vol(), COMPLETE_RAMP_TIME, now);
    if (padGain) rampGain(padGain.gain, 0.035 * vol(), COMPLETE_RAMP_TIME, now);

    // 2. Hard cut — stop all oscillators after ramp
    scheduleTimer(() => {
      try {
        for (const osc of allOscillators) {
          try { osc.stop(); } catch { /* already stopped */ }
        }
      } catch {
        // non-fatal
      }
      stopPulse();
      stopTensionBursts();
      if (noiseSource) {
        try { noiseSource.stop(); } catch { /* already stopped */ }
        noiseSource = null;
      }
    }, COMPLETE_RAMP_TIME * 1000);

    // 3. After silence gap, play resolution chord
    scheduleTimer(() => {
      if (stopped) return;
      playResolutionChord();
    }, (COMPLETE_RAMP_TIME + COMPLETE_SILENCE_GAP) * 1000);
  };

  const playResolutionChord = (): void => {
    try {
      const now = ctx.currentTime;
      const chordGain = track(ctx.createGain());
      chordGain.gain.setValueAtTime(0.025 * vol(), now);
      chordGain.gain.setValueAtTime(0.025 * vol(), now + RESOLUTION_SUSTAIN);
      chordGain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + RESOLUTION_SUSTAIN + RESOLUTION_RELEASE,
      );
      chordGain.connect(ctx.destination);

      for (const freq of RESOLUTION_CHORD) {
        // Sine voice
        const sine = ctx.createOscillator();
        sine.type = 'sine';
        sine.frequency.value = freq;
        sine.connect(chordGain);
        sine.start(now);
        sine.stop(now + RESOLUTION_SUSTAIN + RESOLUTION_RELEASE + 0.1);

        // Triangle voice (blended)
        const tri = ctx.createOscillator();
        tri.type = 'triangle';
        tri.frequency.value = freq;
        const triGain = ctx.createGain();
        triGain.gain.value = 0.5; // blend: triangle at half volume
        tri.connect(triGain).connect(chordGain);
        tri.start(now);
        tri.stop(now + RESOLUTION_SUSTAIN + RESOLUTION_RELEASE + 0.1);
      }
    } catch {
      // Audio failures are non-fatal
    }
  };

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  const start = (): void => {
    if (running) return;
    running = true;
    stopped = false;

    initSubDrone();
    initDarkPad();
    initTensionTexture();

    // Start sub-drone at awakening gain
    if (droneGain) {
      rampGain(droneGain.gain, PHASE_MAP.awakening.subDrone * vol(), 0.5);
    }

    // Start pulse at awakening rate
    startPulse(PHASE_MAP.awakening.pulseHz);
  };

  const setPhase = (id: PhaseId): void => {
    currentPhase = id;
    if (!running || stopped) return;

    if (id === 'complete') {
      // Fire one final hard pulse, then play complete sequence
      firePulse();
      stopPulse();
      playCompleteSequence();
      return;
    }

    const p = PHASE_MAP[id];

    // Layer 1: Sub-Drone
    if (droneGain) {
      rampGain(droneGain.gain, p.subDrone * vol(), TRANSITION_TIME);
    }

    // Layer 2: Dark Pad
    if (padGain) {
      rampGain(padGain.gain, Math.max(p.darkPadGain, 0.0001) * vol(), TRANSITION_TIME);
    }
    if (padFilter && p.darkPadCutoff > 0) {
      // Set the LFO center to the phase cutoff value
      padFilter.frequency.cancelScheduledValues(ctx.currentTime);
      padFilter.frequency.setValueAtTime(p.darkPadCutoff, ctx.currentTime);
      padFilter.frequency.linearRampToValueAtTime(p.darkPadCutoff, ctx.currentTime + TRANSITION_TIME);
    }

    // Layer 3: Tension
    if (p.tensionGain > 0) {
      startTensionBursts();
    } else {
      stopTensionBursts();
    }

    // Layer 4: Pulse
    startPulse(p.pulseHz);
  };

  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    running = false;

    // Clear all scheduled timers
    for (const id of timers) {
      clearTimeout(id);
    }
    timers.length = 0;

    stopPulse();
    stopTensionBursts();

    // Fade everything to silence over 1s
    const now = ctx.currentTime;
    if (droneGain) rampGain(droneGain.gain, 0.0001, 1, now);
    if (padGain) rampGain(padGain.gain, 0.0001, 1, now);
    if (tensionGain) rampGain(tensionGain.gain, 0.0001, 1, now);

    // Disconnect and stop all nodes after fade
    scheduleTimer(() => {
      for (const osc of allOscillators) {
        try { osc.stop(); } catch { /* already stopped */ }
      }
      if (noiseSource) {
        try { noiseSource.stop(); } catch { /* already stopped */ }
        noiseSource = null;
      }
      for (const node of allNodes) {
        try { node.disconnect(); } catch { /* already disconnected */ }
      }
      allNodes.length = 0;
      allOscillators.length = 0;
    }, 1100);
  };

  return { start, setPhase, stop };
};
