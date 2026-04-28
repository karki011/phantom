// Author: Subash Karki

import { APP_NAME_SPACED, APP_VERSION } from '@/core/branding';

export type SoundCue = 'typing' | 'scan' | 'ok' | 'reveal' | 'whoosh' | 'bass' | 'hum_start' | 'hum_stop';
export type LineStyle = 'normal' | 'title' | 'subtitle' | 'accent' | 'success' | 'dim' | 'separator';

export interface BootCeremonyLine {
  text: string;
  delay?: number;
  style?: LineStyle;
  sound?: SoundCue;
  charDelay?: number;
  /** Shell prompt prefix (e.g. '$') shown before command-style lines */
  prompt?: string;
}

export const bootScript: BootCeremonyLine[] = [
  { text: APP_NAME_SPACED, style: 'title', charDelay: 40, sound: 'bass' },
  { text: APP_VERSION, style: 'subtitle', delay: 200, charDelay: 30 },
  { text: '', style: 'separator', delay: 300 },
  { text: 'Binding core services .............. ready', style: 'normal', delay: 100, sound: 'scan', charDelay: 15, prompt: '$' },
  { text: 'Synchronizing session memory ....... active', style: 'normal', delay: 80, sound: 'scan', charDelay: 15, prompt: '$' },
  { text: 'Arming defense wards ............... online', style: 'normal', delay: 80, sound: 'scan', charDelay: 15, prompt: '$' },
  { text: 'Attuning event stream .............. tailing', style: 'normal', delay: 80, sound: 'scan', charDelay: 15, prompt: '$' },
  { text: 'Calibrating neural bridge .......... synced', style: 'normal', delay: 80, sound: 'scan', charDelay: 15, prompt: '$' },
  { text: '', style: 'separator', delay: 200 },
  { text: 'S Y S T E M   O N L I N E', style: 'success', delay: 300, sound: 'ok', charDelay: 35 },
];
