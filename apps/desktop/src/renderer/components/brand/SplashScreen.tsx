/**
 * SplashScreen — Boot ceremony overlay
 * Wraps CeremonyOverlay with boot-specific props.
 *
 * @author Subash Karki
 */
import type { ReactNode } from 'react';
import { CeremonyOverlay } from './CeremonyOverlay';
import type { CeremonyStep } from './CeremonyOverlay';

export type BootStep = CeremonyStep;

interface SplashScreenProps {
  visible: boolean;
  status: string;
  steps?: BootStep[];
  footer?: ReactNode;
}

export const SplashScreen = ({ visible, status, steps, footer }: SplashScreenProps) => {
  const allDone = steps?.every((s) => s.status === 'done' || s.status === 'error');

  return (
    <CeremonyOverlay
      visible={visible}
      subtitle={allDone ? status : undefined}
      subtitleColor={allDone ? 'var(--phantom-status-success, #22c55e)' : undefined}
      steps={steps}
      showProgress={false}
      footer={footer}
    />
  );
};
