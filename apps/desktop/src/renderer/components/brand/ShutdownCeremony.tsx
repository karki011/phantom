/**
 * ShutdownCeremony — Power-off overlay wrapping CeremonyOverlay
 * Confirms, runs cleanup steps, then auto-quits.
 *
 * @author Subash Karki
 */
import { useEffect } from 'react';
import { Power } from 'lucide-react';
import { CeremonyOverlay } from './CeremonyOverlay';
import { useShutdownOrchestrator } from '../../hooks/useShutdownOrchestrator';
import { useCeremonySounds } from '../../hooks/useCeremonySounds';
import { usePreferences } from '../../hooks/usePreferences';

interface ShutdownCeremonyProps {
  visible: boolean;
  onCancel: () => void;
  onQuit: () => void;
}

export const ShutdownCeremony = ({ visible, onCancel, onQuit }: ShutdownCeremonyProps) => {
  const orchestrator = useShutdownOrchestrator();

  const { isEnabled, prefs } = usePreferences();
  const soundEventPrefs = Object.fromEntries(
    Object.keys(prefs)
      .filter(k => k.startsWith('sounds_evt_'))
      .map(k => [k.replace('sounds_evt_', ''), prefs[k] !== 'false']),
  );
  const sounds = useCeremonySounds({
    enabled: isEnabled('sounds'),
    volume: prefs.sounds_volume ? Number(prefs.sounds_volume) : 0.5,
    style: (prefs.sounds_style as 'electronic' | 'minimal' | 'warm' | 'retro') ?? 'electronic',
    events: soundEventPrefs,
  });

  // Enter confirming phase when overlay becomes visible
  useEffect(() => {
    if (visible) orchestrator.confirm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Auto-quit when all steps are done
  useEffect(() => {
    if (orchestrator.phase === 'done') {
      const timer = setTimeout(onQuit, 800);
      return () => clearTimeout(timer);
    }
  }, [orchestrator.phase, onQuit]);

  // Play shutdownInit when confirming phase starts
  useEffect(() => {
    if (orchestrator.phase === 'confirming') {
      sounds.shutdownInit();
    }
  }, [orchestrator.phase, sounds]);

  // Play shutdownStart when running begins, shutdownComplete when done
  useEffect(() => {
    if (orchestrator.phase === 'running') {
      sounds.shutdownStart();
      sounds.resetStepCounter();
    }
    if (orchestrator.phase === 'done') {
      sounds.shutdownComplete();
    }
  }, [orchestrator.phase, sounds]);

  // Play shutdownStep on each step completion
  useEffect(() => {
    const doneCount = orchestrator.steps.filter(s => s.status === 'done').length;
    sounds.onStepsDone(doneCount, sounds.shutdownStep);
  }, [orchestrator.steps, sounds]);

  // Build footer based on phase
  let footer: React.ReactNode = null;

  if (orchestrator.phase === 'confirming') {
    footer = (
      <div style={{ display: 'flex', gap: 12 }}>
        <div
          onClick={onCancel}
          style={{
            padding: '8px 20px', borderRadius: 8, cursor: 'pointer',
            border: '1px solid var(--phantom-border-subtle, rgba(255,255,255,0.08))',
            color: 'var(--phantom-text-secondary, #999)', fontSize: 14,
          }}
        >
          Cancel
        </div>
        <div
          onClick={() => orchestrator.start()}
          style={{
            padding: '8px 20px', borderRadius: 8, cursor: 'pointer',
            background: 'var(--phantom-accent-cyan, #00d4ff)', color: '#000',
            fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <Power size={14} /> Begin Shutdown
        </div>
      </div>
    );
  }

  // Determine subtitle and steps based on phase
  const subtitle =
    orchestrator.phase === 'confirming' ? 'Power Off?'
    : orchestrator.phase === 'done' ? 'Powering off...'
    : orchestrator.phase === 'running' ? 'Shutting down...'
    : undefined;

  const subtitleColor = orchestrator.phase === 'done'
    ? 'var(--phantom-status-success, #22c55e)' : undefined;

  const steps = orchestrator.phase === 'running' || orchestrator.phase === 'done'
    ? orchestrator.steps : undefined;

  return (
    <CeremonyOverlay
      visible={visible}
      subtitle={subtitle}
      subtitleColor={subtitleColor}
      steps={steps}
      footer={footer}
    />
  );
};
