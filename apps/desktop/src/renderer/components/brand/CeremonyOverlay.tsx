/**
 * CeremonyOverlay — Shared full-screen overlay for boot and shutdown sequences
 * Displays PhantomIcon, "PHANTOM OS" title, step checklist, and optional footer content.
 *
 * @author Subash Karki
 */
import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { PhantomIcon } from './PhantomIcon';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StepStatus = 'pending' | 'running' | 'done' | 'error';

export interface CeremonyStep {
  id: string;
  label: string;
  doneLabel: string;
  status: StepStatus;
}

interface CeremonyOverlayProps {
  /** Controls fade-in / fade-out animation */
  visible: boolean;
  /** Subtitle text below "PHANTOM OS" */
  subtitle?: string;
  /** Color override for subtitle (e.g. green for "Powering off...") */
  subtitleColor?: string;
  /** Steps to display with status icons */
  steps?: CeremonyStep[];
  /** Whether to show the animated progress bar */
  showProgress?: boolean;
  /** Optional content below the step list (buttons, messages) */
  footer?: ReactNode;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const KEYFRAMES_ID = '__phantom-ceremony-keyframes';

function ensureKeyframes(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAMES_ID)) return;

  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  style.textContent = `
    @keyframes ceremony-breathe {
      0%, 100% { opacity: 0.7; filter: drop-shadow(0 0 8px var(--phantom-accent-cyan, #00d4ff)); }
      50% { opacity: 1; filter: drop-shadow(0 0 20px var(--phantom-accent-cyan, #00d4ff)); }
    }
    @keyframes ceremony-progress {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(200%); }
    }
    @keyframes ceremony-fadein {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes ceremony-fadeout {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    @keyframes ceremony-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

const overlayBase: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(10, 10, 15, 0.98)',
  backdropFilter: 'blur(12px)',
};

const titleStyle: CSSProperties = {
  fontFamily: 'Orbitron, sans-serif',
  fontSize: '1.5rem',
  fontWeight: 900,
  color: 'var(--phantom-text-primary, #e5e5e5)',
  letterSpacing: '0.2em',
  marginTop: 24,
  textTransform: 'uppercase',
};

const stepIconStyle = (status: StepStatus): CSSProperties => ({
  width: 16,
  height: 16,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 13,
  flexShrink: 0,
  color:
    status === 'done' ? 'var(--phantom-status-success, #22c55e)'
    : status === 'error' ? 'var(--phantom-status-error, #ef4444)'
    : status === 'running' ? 'var(--phantom-accent-cyan, #00d4ff)'
    : 'rgba(255,255,255,0.2)',
  ...(status === 'running' ? { animation: 'ceremony-breathe 1s ease-in-out infinite' } : {}),
});

const stepLabelStyle = (status: StepStatus): CSSProperties => ({
  fontSize: '0.78rem',
  color:
    status === 'done' ? 'var(--phantom-text-primary, #e5e5e5)'
    : status === 'error' ? 'var(--phantom-status-error, #ef4444)'
    : 'var(--phantom-text-muted, #666)',
});

const STEP_ICONS: Record<StepStatus, string> = {
  pending: '○',
  running: '◉',
  done: '✓',
  error: '✗',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const CeremonyOverlay = ({
  visible,
  subtitle,
  subtitleColor,
  steps,
  showProgress,
  footer,
}: CeremonyOverlayProps) => {
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
    } else {
      const timer = setTimeout(() => setMounted(false), 500);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  useEffect(ensureKeyframes, []);

  if (!mounted) return null;

  return (
    <div
      style={{
        ...overlayBase,
        animation: visible ? 'ceremony-fadein 400ms ease-out' : 'ceremony-fadeout 500ms forwards',
      }}
    >
      {/* Icon */}
      <div style={{ animation: 'ceremony-breathe 2s ease-in-out infinite' }}>
        <PhantomIcon size={80} />
      </div>

      {/* Title */}
      <div style={titleStyle}>PHANTOM OS</div>

      {/* Subtitle */}
      {subtitle && (
        <div style={{
          fontSize: 14,
          color: subtitleColor ?? 'var(--phantom-text-muted, #666)',
          marginTop: 8,
          letterSpacing: '0.05em',
        }}>
          {subtitle}
        </div>
      )}

      {/* Progress bar */}
      {showProgress && (
        <div style={{
          width: 200, height: 3, borderRadius: 2,
          backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginTop: 24,
        }}>
          <div style={{
            width: '40%', height: '100%', borderRadius: 2,
            background: 'linear-gradient(90deg, transparent, var(--phantom-accent-cyan, #00d4ff), transparent)',
            animation: 'ceremony-progress 1.5s ease-in-out infinite',
          }} />
        </div>
      )}

      {/* Steps */}
      {steps && steps.length > 0 && (
        <div style={{ marginTop: 24, width: 300 }}>
          {steps.map((step) => (
            <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
              <span style={stepIconStyle(step.status)}>
                {STEP_ICONS[step.status]}
              </span>
              <span style={stepLabelStyle(step.status)}>
                {step.status === 'done' ? step.doneLabel : step.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Footer (buttons, messages, etc.) */}
      {footer && (
        <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {footer}
        </div>
      )}
    </div>
  );
};
