// Author: Subash Karki

import type { PhaseConfig, PhaseId, BootLine, Ability } from './types';

export const phaseOrder: PhaseId[] = [
  'awakening',
  'identity-bind',
  'domain-select',
  'domain-link',
  'ability-awaken',
  'complete',
];

export function buildBootScript(sessionCount: number): BootLine[] {
  const isReturning = sessionCount > 0;
  return [
    {
      text: 'S Y S T E M',
      delay: 1200,
      style: 'title',
      sound: 'bass',
      speech: 'System reactivating.',
      speechRate: 0.84,
      waitForSpeech: true,
      charDelay: 100,
    },
    { text: 'v 2 . 0', delay: 600, style: 'subtitle', charDelay: 70 },
    { text: '', delay: 800, style: 'separator' },
    {
      text: isReturning
        ? 'An operator has returned.'
        : 'A new operator has entered the system.',
      delay: 1000,
      style: 'dramatic',
      sound: 'reveal',
      speech: isReturning
        ? 'An operator has returned.'
        : 'A new operator has entered the system.',
      speechRate: 0.84,
      waitForSpeech: true,
      charDelay: 40,
    },
    { text: '', delay: 600, style: 'separator' },
    {
      text: sessionCount === 0
        ? 'Tracing neural pathways .............. no prior echoes detected'
        : `Tracing neural pathways .............. ${sessionCount} session echoes recovered`,
      delay: 800,
      sound: 'scan',
      speech: sessionCount === 0
        ? 'No prior sessions detected. A fresh bind will be established.'
        : `Recovering ${sessionCount} session echoes. Nothing has been lost.`,
      waitForSpeech: true,
      charDelay: 18,
    },
    {
      text: 'Anchoring memory persistence ......... WAL mode active',
      delay: 600,
      sound: 'scan',
      speech: 'Memory is stable.',
      waitForSpeech: true,
    },
    {
      text: 'Binding terminal interface ........... ready',
      delay: 500,
      speech: 'Terminal interface bound.',
      waitForSpeech: true,
    },
    {
      text: 'Attuning defense wards ............... 3 wards armed',
      delay: 600,
      sound: 'scan',
      speech: 'Defense protocols active.',
      waitForSpeech: true,
    },
    {
      text: 'Synchronizing event stream ........... tailing active',
      delay: 500,
      speech: 'Observing all active processes.',
      waitForSpeech: true,
    },
    { text: '', delay: 600, style: 'separator' },
    {
      text: 'SYSTEM SYNCHRONIZATION COMPLETE',
      delay: 800,
      style: 'success',
      sound: 'ok',
      speech: 'Synchronization complete.',
      waitForSpeech: true,
    },
    { text: '', delay: 1000, style: 'separator' },
    {
      text: 'Initiating System Bind Protocol...',
      delay: 1200,
      style: 'accent',
      sound: 'whoosh',
      speech: 'Operator recognized. Beginning system bind.',
      speechRate: 0.82,
      waitForSpeech: true,
      charDelay: 45,
    },
  ];
}

export const phaseConfigs: Record<PhaseId, PhaseConfig> = {
  'awakening': {
    id: 'awakening',
    title: '',
    subtitle: '',
    announcement: { text: '', speech: '', sound: 'hum_start' },
    persistKeys: [],
  },
  'identity-bind': {
    id: 'identity-bind',
    title: 'Identity Lock',
    subtitle: 'The System requires a name to establish a link.',
    announcement: {
      text: 'Locking operator identity...',
      speech: 'Identity detected. Locking in.',
      sound: 'whoosh',
    },
    autoResolve: {
      timeout: 5000,
      defaultKey: 'operator_name',
      defaultValue: '',
      message: 'No override detected. Identity locked.',
    },
    persistKeys: ['operator_name'],
  },
  'domain-select': {
    id: 'domain-select',
    title: 'Domain Selection',
    subtitle: 'The System adapts to your will.',
    announcement: {
      text: 'Configuring visual interface...',
      speech: 'Select your domain.',
      sound: 'reveal',
    },
    autoResolve: {
      timeout: 2000,
      defaultKey: 'theme',
      defaultValue: 'shadow-monarch-dark',
      message: 'No preference detected. Default domain attuned.',
    },
    persistKeys: ['theme', 'font_style'],
  },
  'domain-link': {
    id: 'domain-link',
    title: 'Domain Link',
    subtitle: 'The System requires a workspace to bind to.',
    announcement: {
      text: 'Scanning for project domains...',
      speech: 'A workspace is required for full synchronization.',
      sound: 'scan',
    },
    autoResolve: {
      timeout: 8000,
      defaultKey: 'first_project_path',
      defaultValue: '',
      message: 'No domain linked. Proceeding without binding.',
    },
    persistKeys: ['first_project_path'],
  },
  'ability-awaken': {
    id: 'ability-awaken',
    title: 'Ability Awakening',
    subtitle: 'Final calibration in progress.',
    announcement: {
      text: 'Manifesting abilities...',
      speech: 'Your abilities are being prepared.',
      sound: 'bass',
    },
    persistKeys: [],
  },
  'complete': {
    id: 'complete',
    title: 'Awakening Complete',
    subtitle: '',
    announcement: {
      text: 'System bind successful.',
      speech: 'The System is now bound to you.',
      sound: 'bass',
    },
    persistKeys: ['onboarding_completed'],
  },
};

export const abilities: Ability[] = [
  {
    id: 'terminal',
    name: 'Terminal Interface',
    desc: 'Direct neural link to any AI agent.',
    icon: '>_',
    sound: 'scan',
    speech: 'Terminal Interface.',
    revealDelay: 0,
  },
  {
    id: 'session-tracking',
    name: 'Session Tracking',
    desc: 'Every session traced. Every token counted.',
    icon: '#',
    sound: 'scan',
    speech: 'Session Tracking.',
    revealDelay: 800,
  },
  {
    id: 'wards',
    name: 'Defense Wards',
    desc: 'Automated safety rules protecting your system.',
    icon: '!',
    sound: 'reveal',
    speech: 'Defense Wards.',
    revealDelay: 800,
  },
  {
    id: 'hunter-stats',
    name: 'Hunter Stats',
    desc: 'XP, achievements, daily quests. Your journey tracked.',
    icon: '*',
    sound: 'reveal',
    speech: 'Hunter Stats.',
    revealDelay: 800,
  },
  {
    id: 'event-stream',
    name: 'Event Stream',
    desc: 'Live system telemetry. See everything.',
    icon: '~',
    sound: 'ok',
    speech: 'Event Stream.',
    revealDelay: 800,
  },
];

export const themeDescriptions: Record<string, string> = {
  'system-core-dark': 'Primary command interface',
  'system-core-light': 'Clarity-focused interface',
  'shadow-monarch-dark': 'Dominion of control and depth',
  'shadow-monarch-light': 'Refined shadow interface',
  'hunter-rank-dark': 'Tactical execution mode',
  'hunter-rank-light': 'Operational clarity mode',
};

export const fontDescriptions: Record<string, string> = {
  system: 'Native clarity',
  mono: 'Precision control',
  gaming: 'Enhanced presence',
};
