// Author: Subash Karki

import type { PhaseConfig, PhaseId, BootLine, Ability, BootScanData } from './types';
import { APP_VERSION, APP_NAME_SPACED } from '../../../core/branding';

export const phaseOrder: PhaseId[] = [
  'awakening',
  'deps-check',
  'identity-bind',
  'domain-select',
  'domain-link',
  'ai-engine',
  'ability-awaken',
  'complete',
];

export function buildBootScript(sessionCount: number, _scan?: BootScanData): BootLine[] {
  const isReturning = sessionCount > 0;
  return [
    {
      text: APP_NAME_SPACED,
      delay: 1200,
      style: 'title',
      sound: 'bass',
      speech: isReturning ? 'Phantom reawakening.' : 'Phantom awakening.',
      speechRate: 0.82,
      waitForSpeech: true,
      charDelay: 100,
    },
    { text: APP_VERSION, delay: 500, style: 'subtitle', charDelay: 70 },
    { text: '', delay: 700, style: 'separator' },
    {
      text: 'Awakening from the depths of the abyss...',
      delay: 1100,
      style: 'dramatic',
      sound: 'reveal',
      charDelay: 38,
    },
    { text: '', delay: 700, style: 'separator' },
    {
      text: isReturning ? 'Good to see you again.' : 'Glad you made it.',
      delay: 800,
      style: 'accent',
      sound: 'scan',
      speech: isReturning ? 'Good to see you again.' : 'Glad you made it.',
      speechRate: 0.88,
      waitForSpeech: true,
      charDelay: 32,
    },
    { text: '', delay: 700, style: 'separator' },
    {
      text: 'Calibrating...',
      delay: 700,
      style: 'dim',
      sound: 'whoosh',
      charDelay: 30,
    },
  ];
}

export const phaseConfigs: Record<PhaseId, PhaseConfig> = {
  'awakening': {
    id: 'awakening',
    title: '',
    subtitle: '',
    announcement: { text: '' },
    persistKeys: [],
  },
  'deps-check': {
    id: 'deps-check',
    title: 'System Dependencies',
    subtitle: 'Verifying the tools Phantom needs to operate.',
    announcement: {
      text: 'Verifying system dependencies...',
      sound: 'scan',
    },
    persistKeys: [],
  },
  'identity-bind': {
    id: 'identity-bind',
    title: 'Identity Lock',
    subtitle: 'The System requires a name to establish a link.',
    announcement: {
      text: 'Locking operator identity...',
      sound: 'whoosh',
    },
    autoResolve: {
      timeout: 10000,
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
      sound: 'reveal',
    },
    autoResolve: {
      timeout: 10000,
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
      sound: 'scan',
    },
    autoResolve: {
      timeout: 10000,
      defaultKey: 'first_project_path',
      defaultValue: '',
      message: 'No domain linked. Proceeding without binding.',
    },
    persistKeys: ['first_project_path'],
  },
  'ai-engine': {
    id: 'ai-engine',
    title: 'AI Engine',
    subtitle: 'Select which capabilities the AI engine should activate.',
    announcement: {
      text: 'Calibrating AI engine...',
      sound: 'reveal',
    },
    autoResolve: {
      timeout: 10000,
      defaultKey: 'ai.autoContext',
      defaultValue: 'true',
      message: 'Using default configuration.',
    },
    persistKeys: ['ai.autoContext', 'ai.editGate', 'ai.outcomeCapture', 'ai.fileSync', 'ai.mcpTools'],
  },
  'ability-awaken': {
    id: 'ability-awaken',
    title: 'Ability Awakening',
    subtitle: 'Final calibration in progress.',
    announcement: {
      text: 'Manifesting abilities...',
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
    revealDelay: 0,
  },
  {
    id: 'session-tracking',
    name: 'Session Tracking',
    desc: 'Every session traced. Every token counted.',
    icon: '#',
    sound: 'scan',
    revealDelay: 800,
  },
  {
    id: 'event-stream',
    name: 'Event Stream',
    desc: 'Live system telemetry. See everything.',
    icon: '~',
    sound: 'ok',
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
