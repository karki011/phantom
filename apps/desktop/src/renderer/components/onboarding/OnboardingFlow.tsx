// apps/desktop/src/renderer/components/onboarding/OnboardingFlow.tsx
// Author: Subash Karki

import { useCallback, useEffect, useRef, useState } from 'react';

import { BootTerminal } from './BootTerminal';
import { useBootAudio } from './useBootAudio';
import { PRE_PHASE, PHASE_INTROS, PHASE_OUTROS, FINALE } from './boot-scripts';
import type { SoundCue } from './boot-scripts';
import { OperatorPhase } from './phases/OperatorPhase';
import type { OperatorResult } from './phases/OperatorPhase';
import { DisplayPhase } from './phases/DisplayPhase';
import type { DisplayResult } from './phases/DisplayPhase';
import { AudioPhase } from './phases/AudioPhase';
import type { AudioResult } from './phases/AudioPhase';
import { NeuralLinkPhase } from './phases/NeuralLinkPhase';
import type { NeuralLinkResult } from './phases/NeuralLinkPhase';
import { usePreferences } from '../../hooks/usePreferences';
import { applyClaudeIntegration } from '../../lib/api';

/* ────────────────────────── types ────────────────────────── */

type Stage =
  | { type: 'pre-phase' }
  | { type: 'phase-intro'; phase: number }
  | { type: 'phase-ui'; phase: number }
  | { type: 'phase-outro'; phase: number }
  | { type: 'finale' }
  | { type: 'done' };

interface OnboardingConfig {
  operatorName: string;
  gitName: string;
  gitEmail: string;
  theme: string;
  fontFamily: string;
  sounds: boolean;
  soundsStyle: string;
  claudeMcpEnabled: boolean;
  claudeInstructionsEnabled: boolean;
  claudeHooksEnabled: boolean;
}

interface Props {
  onComplete: () => void;
}

/* ────────────────────────── constants ────────────────────────── */

const TOTAL_PHASES = 4; // phases 0–3

const INITIAL_CONFIG: OnboardingConfig = {
  operatorName: '',
  gitName: '',
  gitEmail: '',
  theme: 'cz-dark',
  fontFamily: 'jetbrains-mono',
  sounds: true,
  soundsStyle: 'electronic',
  claudeMcpEnabled: false,
  claudeInstructionsEnabled: false,
  claudeHooksEnabled: false,
};

/* ────────────────────────── CSS animation ────────────────────── */

const PANEL_SLIDE_KEYFRAMES = `
@keyframes onboarding-panel-slide-in {
  from {
    opacity: 0;
    transform: translateY(40px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
`;

/* ────────────────────────── component ────────────────────────── */

export function OnboardingFlow({ onComplete }: Props) {
  const [stage, setStage] = useState<Stage>({ type: 'pre-phase' });
  const [terminalLines, setTerminalLines] = useState(PRE_PHASE);
  const [config, setConfig] = useState<OnboardingConfig>(INITIAL_CONFIG);
  const [claudeDetected] = useState(true); // default true — refine later

  const configRef = useRef(config);
  configRef.current = config;

  const { setPref } = usePreferences();
  const audio = useBootAudio();

  /* ── inject keyframes once ── */
  const styleInjectedRef = useRef(false);
  useEffect(() => {
    if (styleInjectedRef.current) return;
    styleInjectedRef.current = true;
    const style = document.createElement('style');
    style.textContent = PANEL_SLIDE_KEYFRAMES;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  /* ── batch write preferences ── */
  const batchWritePrefs = useCallback(async (cfg: OnboardingConfig) => {
    const prefs: Record<string, string> = {
      onboarding_completed: new Date().toISOString(),
      operator_name: cfg.operatorName,
      operator_git_name: cfg.gitName,
      operator_git_email: cfg.gitEmail,
      theme: cfg.theme,
      font_family: cfg.fontFamily,
      sounds: String(cfg.sounds),
      sounds_style: cfg.soundsStyle,
      claude_mcp_enabled: String(cfg.claudeMcpEnabled),
      claude_instructions_enabled: String(cfg.claudeInstructionsEnabled),
      claude_hooks_enabled: String(cfg.claudeHooksEnabled),
    };
    await Promise.all(
      Object.entries(prefs).map(([key, value]) => setPref(key, value)),
    );

    if (cfg.claudeMcpEnabled || cfg.claudeInstructionsEnabled || cfg.claudeHooksEnabled) {
      try {
        await applyClaudeIntegration({
          mcp: cfg.claudeMcpEnabled,
          instructions: cfg.claudeInstructionsEnabled,
          hooks: cfg.claudeHooksEnabled,
          projectPath: '',
        });
      } catch {
        /* non-fatal */
      }
    }
  }, [setPref]);

  /* ── terminal complete handler ── */
  const handleTerminalComplete = useCallback(() => {
    setStage((prev: Stage): Stage => {
      switch (prev.type) {
        case 'pre-phase':
          return { type: 'phase-intro', phase: 0 };

        case 'phase-intro':
          return { type: 'phase-ui', phase: prev.phase };

        case 'phase-outro': {
          const nextPhase = prev.phase + 1;
          if (nextPhase < TOTAL_PHASES) {
            return { type: 'phase-intro', phase: nextPhase };
          }
          return { type: 'finale' };
        }

        case 'finale':
          return { type: 'done' };

        default:
          return prev;
      }
    });
  }, []);

  /* ── update terminal lines when stage changes ── */
  useEffect(() => {
    switch (stage.type) {
      case 'pre-phase':
        setTerminalLines(PRE_PHASE);
        // start ambient hum
        audio.play('hum_start');
        break;

      case 'phase-intro':
        setTerminalLines(PHASE_INTROS[stage.phase]);
        break;

      case 'phase-outro':
        setTerminalLines(PHASE_OUTROS[stage.phase]);
        break;

      case 'finale':
        // stop ambient hum
        audio.play('hum_stop');
        setTerminalLines(FINALE);
        // batch write all preferences
        batchWritePrefs(configRef.current);
        break;

      case 'done': {
        const timer = setTimeout(() => onComplete(), 800);
        return () => clearTimeout(timer);
      }

      // phase-ui: don't change terminal lines — panel overlays
      default:
        break;
    }
  }, [stage, audio, batchWritePrefs, onComplete]);

  /* ── sound pass-through ── */
  const handleSound = useCallback(
    (cue: SoundCue) => {
      audio.play(cue);
    },
    [audio],
  );

  /* ── phase panel complete handlers ── */
  const handleOperatorComplete = useCallback((result: OperatorResult) => {
    setConfig((prev: OnboardingConfig) => ({
      ...prev,
      operatorName: result.operatorName,
      gitName: result.gitName,
      gitEmail: result.gitEmail,
    }));
    setStage({ type: 'phase-outro', phase: 0 });
  }, []);

  const handleDisplayComplete = useCallback((result: DisplayResult) => {
    setConfig((prev: OnboardingConfig) => ({
      ...prev,
      theme: result.theme,
      fontFamily: result.fontFamily,
    }));
    setStage({ type: 'phase-outro', phase: 1 });
  }, []);

  const handleAudioComplete = useCallback((result: AudioResult) => {
    setConfig((prev: OnboardingConfig) => ({
      ...prev,
      sounds: result.sounds,
      soundsStyle: result.soundsStyle,
    }));
    setStage({ type: 'phase-outro', phase: 2 });
  }, []);

  const handleNeuralLinkComplete = useCallback((result: NeuralLinkResult) => {
    setConfig((prev: OnboardingConfig) => ({
      ...prev,
      claudeMcpEnabled: result.claudeMcpEnabled,
      claudeInstructionsEnabled: result.claudeInstructionsEnabled,
      claudeHooksEnabled: result.claudeHooksEnabled,
    }));
    setStage({ type: 'phase-outro', phase: 3 });
  }, []);

  /* ── render phase panel ── */
  const renderPhasePanel = () => {
    if (stage.type !== 'phase-ui') return null;

    let panel: React.ReactNode;
    switch (stage.phase) {
      case 0:
        panel = <OperatorPhase onComplete={handleOperatorComplete} />;
        break;
      case 1:
        panel = <DisplayPhase onComplete={handleDisplayComplete} />;
        break;
      case 2:
        panel = <AudioPhase onComplete={handleAudioComplete} />;
        break;
      case 3:
        panel = (
          <NeuralLinkPhase
            claudeDetected={claudeDetected}
            onComplete={handleNeuralLinkComplete}
          />
        );
        break;
      default:
        return null;
    }

    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      >
        <div
          style={{
            width: '100%',
            maxHeight: '75%',
            overflowY: 'auto',
            padding: '2rem 2rem 3rem',
            background: 'linear-gradient(to top, rgba(0,0,0,0.95) 80%, transparent)',
            pointerEvents: 'auto',
            animation: 'onboarding-panel-slide-in 300ms ease-out both',
          }}
        >
          {panel}
        </div>
      </div>
    );
  };

  /* ── terminal paused during phase-ui ── */
  const terminalPaused = stage.type === 'phase-ui';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        zIndex: 9999,
      }}
    >
      {/* BootTerminal — always visible as background */}
      <BootTerminal
        lines={terminalLines}
        onComplete={handleTerminalComplete}
        onSound={handleSound}
        paused={terminalPaused}
        style={{ position: 'absolute', inset: 0 }}
      />

      {/* Phase panel overlay */}
      {renderPhasePanel()}
    </div>
  );
}

export default OnboardingFlow;
