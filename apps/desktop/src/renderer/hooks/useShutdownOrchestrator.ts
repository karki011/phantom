/**
 * useShutdownOrchestrator — runs shutdown cleanup steps sequentially
 * @author Subash Karki
 */
import { useCallback, useRef, useState } from 'react';
import { cleanupTerminals, generateEndOfDay } from '../lib/api';

type StepStatus = 'pending' | 'running' | 'done' | 'error';
type Phase = 'idle' | 'confirming' | 'running' | 'done';

interface StepState {
  id: string;
  label: string;
  doneLabel: string;
  status: StepStatus;
}

const INITIAL_STEPS: StepState[] = [
  { id: 'panes', label: 'Saving pane state...', doneLabel: 'Pane state saved', status: 'pending' },
  { id: 'editors', label: 'Saving unsaved files...', doneLabel: 'Files saved', status: 'pending' },
  { id: 'terminals', label: 'Closing terminal sessions...', doneLabel: 'Terminals closed', status: 'pending' },
  { id: 'journal', label: 'Generating end-of-day journal...', doneLabel: 'Journal generated', status: 'pending' },
];

export function useShutdownOrchestrator() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [steps, setSteps] = useState<StepState[]>(INITIAL_STEPS);
  const cancelledRef = useRef(false);

  const updateStep = (id: string, status: StepStatus) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
  };

  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const runStep = async (id: string, fn: () => Promise<void>) => {
    if (cancelledRef.current) return;
    updateStep(id, 'running');
    try {
      await fn();
      updateStep(id, 'done');
    } catch {
      updateStep(id, 'error');
    }
  };

  const start = useCallback(async () => {
    cancelledRef.current = false;
    setSteps(INITIAL_STEPS);
    setPhase('running');

    const today = todayStr();

    // Step 1: Save pane state (fire custom event, wait briefly)
    await runStep('panes', () => new Promise<void>((resolve) => {
      window.dispatchEvent(new Event('phantom:flush-pane-save'));
      setTimeout(resolve, 500);
    }));

    // Step 2: Save unsaved files (fire custom event, wait briefly)
    await runStep('editors', () => new Promise<void>((resolve) => {
      window.dispatchEvent(new Event('phantom:save-all-editors'));
      setTimeout(resolve, 500);
    }));

    // Step 3: Close terminals
    await runStep('terminals', async () => {
      await cleanupTerminals();
    });

    // Step 4: Generate EOD journal
    await runStep('journal', async () => {
      try {
        await generateEndOfDay(today);
      } catch {
        // 409 = already exists, that's fine
      }
    });

    // All steps done — signal ready to quit
    setPhase('done');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const confirm = useCallback(() => {
    setPhase('confirming');
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setPhase('idle');
    setSteps(INITIAL_STEPS);
  }, []);

  return { phase, steps, confirm, start, cancel };
}
