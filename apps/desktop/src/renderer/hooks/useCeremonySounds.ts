/**
 * useCeremonySounds — Web Audio API synthesizer for boot/shutdown ceremonies.
 * Generates electronic sounds programmatically — zero audio files, zero dependencies.
 * Sounds are designed to match the Phantom OS cyberpunk aesthetic.
 *
 * Supports granular per-event toggles, volume control, and sound style presets.
 *
 * @author Subash Karki
 */
import { useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// Sound Styles — different frequency/waveform profiles
// ---------------------------------------------------------------------------

export type SoundStyle = 'electronic' | 'minimal' | 'warm' | 'retro';

interface StyleProfile {
  label: string;
  description: string;
  wave: OscillatorType;
  /** Frequency multiplier — shifts all frequencies */
  freqMult: number;
  /** Whether to add harmonic layers */
  harmonics: boolean;
}

export const SOUND_STYLES: Record<SoundStyle, StyleProfile> = {
  electronic: {
    label: 'Electronic',
    description: 'Clean sine waves with harmonic layers',
    wave: 'sine',
    freqMult: 1.0,
    harmonics: true,
  },
  minimal: {
    label: 'Minimal',
    description: 'Simple single tones, no harmonics',
    wave: 'sine',
    freqMult: 1.0,
    harmonics: false,
  },
  warm: {
    label: 'Warm',
    description: 'Lower frequencies with soft triangle waves',
    wave: 'triangle',
    freqMult: 0.75,
    harmonics: true,
  },
  retro: {
    label: 'Retro',
    description: '8-bit style square wave blips',
    wave: 'square',
    freqMult: 1.2,
    harmonics: false,
  },
};

// ---------------------------------------------------------------------------
// Sound event keys — for granular per-event control
// ---------------------------------------------------------------------------

export type SoundEvent =
  | 'boot_start'
  | 'boot_step'
  | 'boot_complete'
  | 'shutdown_init'
  | 'shutdown_start'
  | 'shutdown_step'
  | 'shutdown_complete'
  | 'claude_complete'
  | 'task_complete';

export type SoundGroup = 'boot' | 'shutdown' | 'terminal';

export interface SoundEventInfo {
  key: SoundEvent;
  label: string;
  description: string;
  group: SoundGroup;
}

export const SOUND_EVENTS: SoundEventInfo[] = [
  { key: 'boot_start', label: 'Boot Start', description: 'Rising sweep when app starts', group: 'boot' },
  { key: 'boot_step', label: 'Boot Step', description: 'Blip when each boot step completes', group: 'boot' },
  { key: 'boot_complete', label: 'Boot Complete', description: 'Triumphant chord when boot finishes', group: 'boot' },
  { key: 'shutdown_init', label: 'Shutdown Warning', description: 'Warning pulse when shutdown dialog appears', group: 'shutdown' },
  { key: 'shutdown_start', label: 'Shutdown Start', description: 'Descending sweep when shutdown begins', group: 'shutdown' },
  { key: 'shutdown_step', label: 'Shutdown Step', description: 'Blip when each shutdown step completes', group: 'shutdown' },
  { key: 'shutdown_complete', label: 'Shutdown Complete', description: 'Low drone when shutdown finishes', group: 'shutdown' },
  { key: 'claude_complete', label: 'Claude Finished', description: 'Chime when a Claude session completes', group: 'terminal' },
  { key: 'task_complete', label: 'Task Completed', description: 'Blip when a tracked task is done', group: 'terminal' },
];

// ---------------------------------------------------------------------------
// Audio engine
// ---------------------------------------------------------------------------

let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new AudioContext();
  }
  if (sharedCtx.state === 'suspended') {
    sharedCtx.resume();
  }
  return sharedCtx;
}

function playTone(
  ctx: AudioContext,
  startFreq: number,
  endFreq: number,
  duration: number,
  gain: number,
  type: OscillatorType = 'sine',
  delay: number = 0,
) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  const t = ctx.currentTime + delay;

  osc.type = type;
  osc.frequency.setValueAtTime(startFreq, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 20), t + duration);

  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);

  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration);
}

function playChord(
  ctx: AudioContext,
  freqs: number[],
  duration: number,
  gain: number,
  type: OscillatorType = 'sine',
) {
  const perTone = gain / freqs.length;
  for (const freq of freqs) {
    playTone(ctx, freq, freq * 0.95, duration, perTone, type);
  }
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

const NOOP = () => {};
const NOOP_STEPS = (_n: number, _fn?: () => void) => {};

export interface SoundOptions {
  enabled?: boolean;
  volume?: number;          // 0–1, default 0.5
  style?: SoundStyle;
  /** Per-event overrides — if a key is false, that specific sound is muted */
  events?: Partial<Record<SoundEvent, boolean>>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCeremonySounds(opts: boolean | SoundOptions = true) {
  const lastStepCountRef = useRef(0);

  const options: SoundOptions = typeof opts === 'boolean'
    ? { enabled: opts }
    : opts;

  const {
    enabled = true,
    volume = 0.5,
    style = 'electronic',
    events = {},
  } = options;

  const profile = SOUND_STYLES[style] ?? SOUND_STYLES.electronic;
  const vol = volume * 0.3; // scale to comfortable range (max 0.3)
  const fm = profile.freqMult;
  const wave = profile.wave;

  const isEventOn = (key: SoundEvent): boolean => events[key] !== false;

  // -- Boot sounds --

  const bootStart = useCallback(() => {
    const ctx = getCtx();
    playTone(ctx, 200 * fm, 600 * fm, 0.6, vol, wave);
    if (profile.harmonics) {
      playTone(ctx, 300 * fm, 800 * fm, 0.5, vol * 0.3, 'triangle', 0.1);
    }
  }, [vol, fm, wave, profile.harmonics]);

  const stepComplete = useCallback(() => {
    const ctx = getCtx();
    playTone(ctx, 600 * fm, 900 * fm, 0.12, vol * 0.8, wave);
    if (profile.harmonics) {
      playTone(ctx, 800 * fm, 1100 * fm, 0.1, vol * 0.4, wave, 0.08);
    }
  }, [vol, fm, wave, profile.harmonics]);

  const bootComplete = useCallback(() => {
    const ctx = getCtx();
    playTone(ctx, 400 * fm, 500 * fm, 0.15, vol * 0.6, wave, 0);
    playTone(ctx, 500 * fm, 600 * fm, 0.15, vol * 0.6, wave, 0.12);
    playTone(ctx, 600 * fm, 700 * fm, 0.15, vol * 0.6, wave, 0.24);
    playChord(ctx, [400, 500, 600, 800].map(f => f * fm), 0.8, vol, wave);
  }, [vol, fm, wave]);

  // -- Shutdown sounds --

  const shutdownInit = useCallback(() => {
    const ctx = getCtx();
    playTone(ctx, 250 * fm, 200 * fm, 0.2, vol * 0.7, wave);
    playTone(ctx, 250 * fm, 200 * fm, 0.2, vol * 0.7, wave, 0.25);
  }, [vol, fm, wave]);

  const shutdownStart = useCallback(() => {
    const ctx = getCtx();
    playTone(ctx, 600 * fm, 200 * fm, 0.5, vol, wave);
    if (profile.harmonics) {
      playTone(ctx, 500 * fm, 150 * fm, 0.4, vol * 0.3, 'triangle', 0.1);
    }
  }, [vol, fm, wave, profile.harmonics]);

  const shutdownStep = useCallback(() => {
    const ctx = getCtx();
    playTone(ctx, 500 * fm, 350 * fm, 0.15, vol * 0.6, wave);
  }, [vol, fm, wave]);

  const shutdownComplete = useCallback(() => {
    const ctx = getCtx();
    playChord(ctx, [150, 200, 250].map(f => f * fm), 1.2, vol * 0.8, wave);
  }, [vol, fm, wave]);

  // -- Terminal sounds --

  /** Satisfying ascending double-chime — Claude session complete */
  const claudeComplete = useCallback(() => {
    const ctx = getCtx();
    playTone(ctx, 500 * fm, 700 * fm, 0.15, vol * 0.7, wave);
    playTone(ctx, 700 * fm, 900 * fm, 0.15, vol * 0.7, wave, 0.12);
    if (profile.harmonics) {
      playChord(ctx, [500, 700, 900].map(f => f * fm), 0.5, vol * 0.4, wave);
    }
  }, [vol, fm, wave, profile.harmonics]);

  /** Quick bright blip — task completed */
  const taskComplete = useCallback(() => {
    const ctx = getCtx();
    playTone(ctx, 800 * fm, 1200 * fm, 0.1, vol * 0.6, wave);
  }, [vol, fm, wave]);

  // -- Step tracking --

  const onStepsDone = useCallback((doneCount: number, playFn: () => void = stepComplete) => {
    if (doneCount > lastStepCountRef.current) {
      playFn();
      lastStepCountRef.current = doneCount;
    }
  }, [stepComplete]);

  const resetStepCounter = useCallback(() => {
    lastStepCountRef.current = 0;
  }, []);

  // -- Preview: always plays regardless of enabled state --

  const preview = useCallback((event: SoundEvent) => {
    const fns: Record<SoundEvent, () => void> = {
      boot_start: bootStart,
      boot_step: stepComplete,
      boot_complete: bootComplete,
      shutdown_init: shutdownInit,
      shutdown_start: shutdownStart,
      shutdown_step: shutdownStep,
      shutdown_complete: shutdownComplete,
      claude_complete: claudeComplete,
      task_complete: taskComplete,
    };
    fns[event]?.();
  }, [bootStart, stepComplete, bootComplete, shutdownInit, shutdownStart, shutdownStep, shutdownComplete, claudeComplete, taskComplete]);

  if (!enabled) {
    return {
      bootStart: NOOP, stepComplete: NOOP, bootComplete: NOOP,
      shutdownInit: NOOP, shutdownStart: NOOP, shutdownStep: NOOP, shutdownComplete: NOOP,
      claudeComplete: NOOP, taskComplete: NOOP,
      onStepsDone: NOOP_STEPS, resetStepCounter: NOOP,
      preview,
    };
  }

  return {
    bootStart: isEventOn('boot_start') ? bootStart : NOOP,
    stepComplete: isEventOn('boot_step') ? stepComplete : NOOP,
    bootComplete: isEventOn('boot_complete') ? bootComplete : NOOP,
    shutdownInit: isEventOn('shutdown_init') ? shutdownInit : NOOP,
    shutdownStart: isEventOn('shutdown_start') ? shutdownStart : NOOP,
    shutdownStep: isEventOn('shutdown_step') ? shutdownStep : NOOP,
    shutdownComplete: isEventOn('shutdown_complete') ? shutdownComplete : NOOP,
    claudeComplete: isEventOn('claude_complete') ? claudeComplete : NOOP,
    taskComplete: isEventOn('task_complete') ? taskComplete : NOOP,
    onStepsDone,
    resetStepCounter,
    preview,
  };
}
