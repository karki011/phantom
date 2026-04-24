// Author: Subash Karki

export type SoundCue = 'typing' | 'scan' | 'ok' | 'reveal' | 'whoosh' | 'bass' | 'hum_start' | 'hum_stop';
export type LineStyle = 'normal' | 'title' | 'subtitle' | 'accent' | 'success' | 'dim' | 'separator';

export interface BootCeremonyLine {
  text: string;
  delay?: number;
  style?: LineStyle;
  sound?: SoundCue;
  charDelay?: number;
}

export const bootScript: BootCeremonyLine[] = [
  { text: 'P H A N T O M   O S', style: 'title', charDelay: 40, sound: 'bass' },
  { text: 'v 2 . 0', style: 'subtitle', delay: 200, charDelay: 30 },
  { text: '', style: 'separator', delay: 300 },
  { text: 'Binding core services .............. ready', style: 'normal', delay: 100, sound: 'scan', charDelay: 15 },
  { text: 'Synchronizing session memory ....... active', style: 'normal', delay: 80, sound: 'scan', charDelay: 15 },
  { text: 'Arming defense wards ............... online', style: 'normal', delay: 80, sound: 'scan', charDelay: 15 },
  { text: 'Attuning event stream .............. tailing', style: 'normal', delay: 80, sound: 'scan', charDelay: 15 },
  { text: 'Calibrating neural bridge .......... synced', style: 'normal', delay: 80, sound: 'scan', charDelay: 15 },
  { text: '', style: 'separator', delay: 200 },
  { text: 'S Y S T E M   O N L I N E', style: 'success', delay: 300, sound: 'ok', charDelay: 35 },
];
