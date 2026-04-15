// apps/desktop/src/renderer/components/onboarding/boot-scripts.ts
// Author: Subash Karki

export type SoundCue = 'typing' | 'scan' | 'ok' | 'reveal' | 'whoosh' | 'bass';

export type BootLine = {
  text: string;
  delay: number;        // ms pause BEFORE this line
  typeSpeed?: number;    // ms per char (default 35)
  sound?: SoundCue;
  flash?: boolean;
  glow?: 'cyan' | 'gold' | 'green';
  progress?: number;     // if set, render as progress bar filling to this %
  speech?: string;       // if set, spoken aloud via Web Speech API when line starts
};

export const PRE_PHASE: BootLine[] = [
  { text: '[SYSTEM]  .', delay: 200, typeSpeed: 0, sound: 'scan' },
  { text: '[SYSTEM]  .  .', delay: 300, typeSpeed: 0, sound: 'scan' },
  { text: '[SYSTEM]  .  .  .', delay: 300, typeSpeed: 0, sound: 'scan' },
  { text: '', delay: 300 },
  { text: '[SYSTEM]  A new operator has been detected.', delay: 0, typeSpeed: 30, sound: 'reveal', speech: 'A new operator has been detected.' },
  { text: '', delay: 400 },
  { text: '[SYSTEM]  Initiating first boot sequence...', delay: 0, typeSpeed: 30, speech: 'Initiating first boot sequence.' },
  { text: '', delay: 200 },
  { text: '', delay: 0, progress: 10 },
  { text: '', delay: 100, progress: 20 },
  { text: '', delay: 100, progress: 40 },
  { text: '', delay: 150, progress: 60 },
  { text: '', delay: 100, progress: 80 },
  { text: '', delay: 150, progress: 100 },
  { text: '[██████████]  CORE ONLINE', delay: 100, typeSpeed: 0, sound: 'ok', flash: true, glow: 'cyan', speech: 'Core online.' },
  { text: '', delay: 500 },
  { text: '[SYSTEM]  All prerequisites satisfied.', delay: 0, typeSpeed: 30, speech: 'All prerequisites satisfied.' },
  { text: '[SYSTEM]  Operator calibration required.', delay: 200, typeSpeed: 30, speech: 'Operator calibration required.' },
];

export const PHASE_INTROS: BootLine[][] = [
  // Phase 1 — Operator
  [
    { text: '──────────────────────────────────────────', delay: 600, typeSpeed: 0, sound: 'whoosh' },
    { text: '[PHASE 1 of 5]  OPERATOR IDENTIFICATION', delay: 200, typeSpeed: 0, glow: 'cyan', speech: 'Phase 1. Operator identification.' },
    { text: '[SYSTEM]  Scanning local identity...', delay: 400, typeSpeed: 30, speech: 'Scanning local identity.' },
    { text: '[SCAN ]  git config → identity found', delay: 600, typeSpeed: 25, sound: 'scan', glow: 'gold', speech: 'Identity found.' },
  ],
  // Phase 2 — Display
  [
    { text: '──────────────────────────────────────────', delay: 600, typeSpeed: 0, sound: 'whoosh' },
    { text: '[PHASE 2 of 5]  DISPLAY CALIBRATION', delay: 200, typeSpeed: 0, glow: 'cyan', speech: 'Phase 2. Display calibration.' },
    { text: '[SYSTEM]  Scanning display subsystems...', delay: 400, typeSpeed: 30 },
    { text: '[SYSTEM]  4 display profiles available.', delay: 400, typeSpeed: 30 },
    { text: '[SYSTEM]  Select your visual identity.', delay: 300, typeSpeed: 30, speech: 'Select your visual identity.' },
  ],
  // Phase 3 — Audio
  [
    { text: '──────────────────────────────────────────', delay: 600, typeSpeed: 0, sound: 'whoosh' },
    { text: '[PHASE 3 of 5]  AUDIO SUBSYSTEM', delay: 200, typeSpeed: 0, glow: 'cyan', speech: 'Phase 3. Audio subsystem.' },
    { text: '[SYSTEM]  Audio subsystem check...', delay: 400, typeSpeed: 30 },
    { text: '[SYSTEM]  Sound engine ready.', delay: 400, typeSpeed: 30, sound: 'ok', speech: 'Sound engine ready.' },
  ],
  // Phase 4 — Neural Link
  [
    { text: '──────────────────────────────────────────', delay: 600, typeSpeed: 0, sound: 'whoosh' },
    { text: '[PHASE 4 of 5]  NEURAL LINK', delay: 200, typeSpeed: 0, glow: 'cyan', speech: 'Phase 4. Neural link.' },
    { text: '[SYSTEM]  Scanning for AI runtimes...', delay: 400, typeSpeed: 30, speech: 'Scanning for AI runtimes.' },
    { text: '[SCAN ]  . . .', delay: 800, typeSpeed: 0, sound: 'scan' },
    { text: '[SCAN ]  Claude Code ── DETECTED', delay: 400, typeSpeed: 0, sound: 'reveal', glow: 'gold', speech: 'Claude Code detected.' },
    { text: '[SYSTEM]  Neural link available.', delay: 400, typeSpeed: 30 },
    { text: '[SYSTEM]  Authorization required.', delay: 300, typeSpeed: 30, speech: 'Authorization required.' },
  ],
];

export const PHASE_OUTROS: BootLine[][] = [
  // Phase 1
  [
    { text: '[SYSTEM]  Operator identity confirmed.', delay: 300, typeSpeed: 30, speech: 'Operator identity confirmed.' },
    { text: '[OK    ]  ■ OPERATOR MODULE — LOADED', delay: 300, typeSpeed: 0, sound: 'ok', glow: 'green' },
  ],
  // Phase 2
  [
    { text: '[SYSTEM]  Display profile applied.', delay: 300, typeSpeed: 30, speech: 'Display profile applied.' },
    { text: '[OK    ]  ■ DISPLAY MODULE — LOADED', delay: 300, typeSpeed: 0, sound: 'ok', glow: 'green' },
  ],
  // Phase 3
  [
    { text: '[SYSTEM]  Audio subsystem configured.', delay: 300, typeSpeed: 30, speech: 'Audio subsystem configured.' },
    { text: '[OK    ]  ■ AUDIO MODULE — LOADED', delay: 300, typeSpeed: 0, sound: 'ok', glow: 'green' },
  ],
  // Phase 4
  [
    { text: '[SYSTEM]  Neural link authorization received.', delay: 300, typeSpeed: 30, speech: 'Neural link authorization received.' },
    { text: '[OK    ]  ■ NEURAL LINK — ENABLED', delay: 300, typeSpeed: 0, sound: 'ok', glow: 'green' },
  ],
];

export const FINALE: BootLine[] = [
  { text: '──────────────────────────────────────────', delay: 600, typeSpeed: 0, sound: 'whoosh' },
  { text: '[SYSTEM]  Finalizing configuration...', delay: 400, typeSpeed: 30, speech: 'Finalizing configuration.' },
  { text: '[WRITE]  Operator profile ·········· OK', delay: 200, typeSpeed: 0, sound: 'ok' },
  { text: '[WRITE]  Display calibration ······· OK', delay: 200, typeSpeed: 0, sound: 'ok' },
  { text: '[WRITE]  Audio subsystem ··········· OK', delay: 200, typeSpeed: 0, sound: 'ok' },
  { text: '[WRITE]  Neural link ··············· OK', delay: 200, typeSpeed: 0, sound: 'ok' },
  { text: '', delay: 400 },
  { text: '', delay: 0, progress: 100 },
  { text: '', delay: 1000 },
  { text: '[SYSTEM]  All systems nominal.', delay: 0, typeSpeed: 30, glow: 'cyan', speech: 'All systems nominal.' },
  { text: '', delay: 1500 },
  { text: '  ╔══════════════════════════════════╗', delay: 0, typeSpeed: 0, sound: 'bass', flash: true },
  { text: '  ║                                  ║', delay: 50, typeSpeed: 0 },
  { text: '  ║    P H A N T O M   O S          ║', delay: 50, typeSpeed: 0, glow: 'cyan', speech: 'Phantom OS. System online.' },
  { text: '  ║                                  ║', delay: 50, typeSpeed: 0 },
  { text: '  ║    ── S Y S T E M  O N L I N E  ║', delay: 50, typeSpeed: 0, glow: 'gold' },
  { text: '  ║                                  ║', delay: 50, typeSpeed: 0 },
  { text: '  ╚══════════════════════════════════╝', delay: 50, typeSpeed: 0 },
];
