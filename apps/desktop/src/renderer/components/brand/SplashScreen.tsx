/**
 * SplashScreen — Boot ceremony overlay
 * Wraps CeremonyOverlay with boot-specific props.
 *
 * @author Subash Karki
 */
import { CeremonyOverlay } from './CeremonyOverlay';
import type { CeremonyStep } from './CeremonyOverlay';

export type BootStep = CeremonyStep;

interface SplashScreenProps {
  visible: boolean;
  status: string;
  steps?: BootStep[];
}

export const SplashScreen = ({ visible, status, steps }: SplashScreenProps) => {
  const allDone = steps?.every((s) => s.status === 'done' || s.status === 'error');

  return (
    <CeremonyOverlay
      visible={visible}
      subtitle={allDone ? status : undefined}
      subtitleColor={allDone ? 'var(--phantom-status-success, #22c55e)' : undefined}
      steps={steps}
      showProgress={false}
    />
  );
};
