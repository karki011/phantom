// Author: Subash Karki

export type SoundCue = 'typing' | 'scan' | 'ok' | 'reveal' | 'whoosh' | 'bass' | 'hum_start' | 'hum_stop';

export type PhaseId =
  | 'awakening'
  | 'identity-bind'
  | 'domain-select'
  | 'domain-link'
  | 'ability-awaken'
  | 'complete';

export type LineStyle =
  | 'normal' | 'title' | 'subtitle' | 'accent'
  | 'success' | 'dim' | 'dramatic' | 'separator';

export interface BootLine {
  text: string;
  delay?: number;
  style?: LineStyle;
  sound?: SoundCue;
  speech?: string;
  speechRate?: number;
  waitForSpeech?: boolean;
  charDelay?: number;
}

export interface PhaseAnnouncement {
  text: string;
  speech: string;
  sound?: SoundCue;
}

export interface AutoResolve {
  timeout: number;
  defaultKey: string;
  defaultValue: string;
  message: string;
}

export interface Ability {
  id: string;
  name: string;
  desc: string;
  icon: string;
  sound: SoundCue;
  speech: string;
  revealDelay: number;
}

export interface PhaseConfig {
  id: PhaseId;
  title: string;
  subtitle: string;
  announcement: PhaseAnnouncement;
  autoResolve?: AutoResolve;
  persistKeys: string[];
}

export interface PhaseContext {
  autoTimerPaused: () => boolean;
  pauseAutoTimer: () => void;
  config: PhaseConfig;
}

