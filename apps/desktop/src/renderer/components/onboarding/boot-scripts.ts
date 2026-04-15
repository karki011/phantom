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
};

export const PRE_PHASE: BootLine[] = [
  { text: '[SYSTEM]  .', delay: 1000, typeSpeed: 0, sound: 'scan' },
  { text: '[SYSTEM]  .  .', delay: 500, typeSpeed: 0, sound: 'scan' },
  { text: '[SYSTEM]  .  .  .', delay: 500, typeSpeed: 0, sound: 'scan' },
  { text: '', delay: 800 },
  { text: '[SYSTEM]  A new operator has been detected.', delay: 0, typeSpeed: 30, sound: 'reveal' },
  { text: '', delay: 600 },
  { text: '[SYSTEM]  Initiating first boot sequence...', delay: 0, typeSpeed: 30 },
  { text: '', delay: 400 },
  { text: '', delay: 0, progress: 10 },
  { text: '', delay: 200, progress: 20 },
  { text: '', delay: 200, progress: 40 },
  { text: '', delay: 300, progress: 60 },
  { text: '', delay: 200, progress: 80 },
  { text: '', delay: 300, progress: 100 },
  { text: '[██████████]  CORE ONLINE', delay: 100, typeSpeed: 0, sound: 'ok', flash: true, glow: 'cyan' },
  { text: '', delay: 1000 },
  { text: '[SYSTEM]  All prerequisites satisfied.', delay: 0, typeSpeed: 30 },
  { text: '[SYSTEM]  Operator calibration required.', delay: 200, typeSpeed: 30 },
];

export const PHASE_INTROS: BootLine[][] = [
  // Phase 1 — Operator
  [
    { text: '──────────────────────────────────────────', delay: 600, typeSpeed: 0, sound: 'whoosh' },
    { text: '[PHASE 1 of 5]  OPERATOR IDENTIFICATION', delay: 200, typeSpeed: 0, glow: 'cyan' },
    { text: '[SYSTEM]  Scanning local identity...', delay: 400, typeSpeed: 30 },
    { text: '[SCAN ]  git config → identity found', delay: 600, typeSpeed: 25, sound: 'scan', glow: 'gold' },
  ],
  // Phase 2 — Display
  [
    { text: '──────────────────────────────────────────', delay: 600, typeSpeed: 0, sound: 'whoosh' },
    { text: '[PHASE 2 of 5]  DISPLAY CALIBRATION', delay: 200, typeSpeed: 0, glow: 'cyan' },
    { text: '[SYSTEM]  Scanning display subsystems...', delay: 400, typeSpeed: 30 },
    { text: '[SYSTEM]  4 display profiles available.', delay: 400, typeSpeed: 30 },
    { text: '[SYSTEM]  Select your visual identity.', delay: 300, typeSpeed: 30 },
  ],
  // Phase 3 — Audio
  [
    { text: '──────────────────────────────────────────', delay: 600, typeSpeed: 0, sound: 'whoosh' },
    { text: '[PHASE 3 of 5]  AUDIO SUBSYSTEM', delay: 200, typeSpeed: 0, glow: 'cyan' },
    { text: '[SYSTEM]  Audio subsystem check...', delay: 400, typeSpeed: 30 },
    { text: '[SYSTEM]  Sound engine ready.', delay: 400, typeSpeed: 30, sound: 'ok' },
  ],
  // Phase 4 — Neural Link
  [
    { text: '──────────────────────────────────────────', delay: 600, typeSpeed: 0, sound: 'whoosh' },
    { text: '[PHASE 4 of 5]  NEURAL LINK', delay: 200, typeSpeed: 0, glow: 'cyan' },
    { text: '[SYSTEM]  Scanning for AI runtimes...', delay: 400, typeSpeed: 30 },
    { text: '[SCAN ]  . . .', delay: 800, typeSpeed: 0, sound: 'scan' },
    { text: '[SCAN ]  Claude Code ── DETECTED', delay: 400, typeSpeed: 0, sound: 'reveal', glow: 'gold' },
    { text: '[SYSTEM]  Neural link available.', delay: 400, typeSpeed: 30 },
    { text: '[SYSTEM]  Authorization required.', delay: 300, typeSpeed: 30 },
  ],
];

export const PHASE_OUTROS: BootLine[][] = [
  // Phase 1
  [
    { text: '[SYSTEM]  Operator identity confirmed.', delay: 300, typeSpeed: 30 },
    { text: '[OK    ]  ■ OPERATOR MODULE — LOADED', delay: 300, typeSpeed: 0, sound: 'ok', glow: 'green' },
  ],
  // Phase 2
  [
    { text: '[SYSTEM]  Display profile applied.', delay: 300, typeSpeed: 30 },
    { text: '[OK    ]  ■ DISPLAY MODULE — LOADED', delay: 300, typeSpeed: 0, sound: 'ok', glow: 'green' },
  ],
  // Phase 3
  [
    { text: '[SYSTEM]  Audio subsystem configured.', delay: 300, typeSpeed: 30 },
    { text: '[OK    ]  ■ AUDIO MODULE — LOADED', delay: 300, typeSpeed: 0, sound: 'ok', glow: 'green' },
  ],
  // Phase 4
  [
    { text: '[SYSTEM]  Neural link authorization received.', delay: 300, typeSpeed: 30 },
    { text: '[OK    ]  ■ NEURAL LINK — ENABLED', delay: 300, typeSpeed: 0, sound: 'ok', glow: 'green' },
  ],
];

export const FINALE: BootLine[] = [
  { text: '──────────────────────────────────────────', delay: 600, typeSpeed: 0, sound: 'whoosh' },
  { text: '[SYSTEM]  Finalizing configuration...', delay: 400, typeSpeed: 30 },
  { text: '[WRITE]  Operator profile ·········· OK', delay: 200, typeSpeed: 0, sound: 'ok' },
  { text: '[WRITE]  Display calibration ······· OK', delay: 200, typeSpeed: 0, sound: 'ok' },
  { text: '[WRITE]  Audio subsystem ··········· OK', delay: 200, typeSpeed: 0, sound: 'ok' },
  { text: '[WRITE]  Neural link ··············· OK', delay: 200, typeSpeed: 0, sound: 'ok' },
  { text: '', delay: 400 },
  { text: '', delay: 0, progress: 100 },
  { text: '', delay: 1000 },
  { text: '[SYSTEM]  All systems nominal.', delay: 0, typeSpeed: 30, glow: 'cyan' },
  { text: '', delay: 1500 },
  { text: '  ╔══════════════════════════════════╗', delay: 0, typeSpeed: 0, sound: 'bass', flash: true },
  { text: '  ║                                  ║', delay: 50, typeSpeed: 0 },
  { text: '  ║    P H A N T O M   O S          ║', delay: 50, typeSpeed: 0, glow: 'cyan' },
  { text: '  ║                                  ║', delay: 50, typeSpeed: 0 },
  { text: '  ║    ── S Y S T E M  O N L I N E  ║', delay: 50, typeSpeed: 0, glow: 'gold' },
  { text: '  ║                                  ║', delay: 50, typeSpeed: 0 },
  { text: '  ╚══════════════════════════════════╝', delay: 50, typeSpeed: 0 },
];
