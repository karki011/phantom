// Author: Subash Karki

import type { PhaseConfig, PhaseId, BootLine, Ability, BootScanData } from './types';

export const phaseOrder: PhaseId[] = [
  'awakening',
  'identity-bind',
  'domain-select',
  'domain-link',
  'ai-engine',
  'ability-awaken',
  'complete',
];

function buildAgentLines(scan?: BootScanData): BootLine[] {
  const installed = scan?.agents.filter((a) => a.installed) ?? [];
  if (installed.length === 0) {
    return [{
      text: 'Scanning for AI agents ............... none detected',
      delay: 400,
      prompt: '$',
      sound: 'scan',
      charDelay: 18,
    }];
  }

  const lines: BootLine[] = [{
    text: `Scanning for AI agents ............... ${installed.length} detected`,
    delay: 400,
    prompt: '$',
    sound: 'scan',
    speech: `${installed.length} AI agent${installed.length === 1 ? '' : 's'} detected.`,
    waitForSpeech: true,
    charDelay: 18,
  }];

  for (const agent of installed) {
    const ver = agent.version ? ` ${agent.version}` : '';
    const pad = '.'.repeat(Math.max(1, 40 - agent.name.length - ver.length));
    lines.push({
      text: `  ${agent.name}${ver} ${pad} online`,
      delay: 200,
      style: 'dim',
      sound: 'scan',
      charDelay: 12,
    });
  }

  return lines;
}

export function buildBootScript(sessionCount: number, scan?: BootScanData): BootLine[] {
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
      prompt: '$',
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
      prompt: '$',
      speech: 'Memory is stable.',
      waitForSpeech: true,
    },
    {
      text: 'Binding terminal interface ........... ready',
      delay: 500,
      prompt: '$',
      speech: 'Terminal interface bound.',
      waitForSpeech: true,
    },
    {
      text: 'Attuning defense wards ............... 3 wards armed',
      delay: 600,
      sound: 'scan',
      prompt: '$',
      speech: 'Defense protocols active.',
      waitForSpeech: true,
    },
    {
      text: 'Synchronizing event stream ........... tailing active',
      delay: 500,
      prompt: '$',
      speech: 'Observing all active processes.',
      waitForSpeech: true,
    },
    {
      text: scan?.gitInstalled
        ? `Verifying git ........................ ${scan.gitVersion ?? 'ready'}`
        : 'Verifying git ........................ NOT FOUND',
      delay: 400,
      prompt: '$',
      sound: 'scan',
      charDelay: 18,
    },
    ...buildAgentLines(scan),
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
      speech: 'Select your domain.',
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
      speech: 'A workspace is required for full synchronization.',
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
      speech: 'Configure your AI engine capabilities.',
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
