// Author: Subash Karki

import { speak } from '../../../core/audio/engine';

export const SYSTEM_VOICE = {
  rate: 0.84,
  pitch: 0.72,
  volume: 1,
} as const;

export const VOICE_TIMING = {
  preSpeechDelay: 250,
  linePause: 550,
  payoffPause: 1050,
} as const;

export function speakSystem(text: string, rateOverride?: number): Promise<void> {
  return speak(text, rateOverride ?? SYSTEM_VOICE.rate, SYSTEM_VOICE.pitch);
}
