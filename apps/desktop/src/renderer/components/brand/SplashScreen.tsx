/**
 * SplashScreen — Bootstrap loading screen shown while server initializes
 * Full-screen overlay with pulsing PhantomIcon, progress bar, and status text.
 * Uses raw CSS values with fallbacks so it works before ThemeProvider loads.
 *
 * @author Subash Karki
 */
import { useEffect, useState } from 'react';
import { PhantomIcon } from './PhantomIcon';

interface SplashScreenProps {
  visible: boolean;
  status: string;
}

export const SplashScreen = ({ visible, status }: SplashScreenProps) => {
  const [mounted, setMounted] = useState(true);

  // Unmount after fade-out animation completes
  useEffect(() => {
    if (!visible) {
      const timer = setTimeout(() => setMounted(false), 500);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <>
      <style>{`
        @keyframes splash-breathe {
          0%, 100% {
            opacity: 0.7;
            filter: drop-shadow(0 0 8px var(--phantom-accent-cyan, #00d4ff));
          }
          50% {
            opacity: 1;
            filter: drop-shadow(0 0 20px var(--phantom-accent-cyan, #00d4ff));
          }
        }

        @keyframes splash-progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }

        @keyframes splash-fadeout {
          from { opacity: 1; }
          to { opacity: 0; }
        }
      `}</style>

      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0a0a0f',
          animation: !visible ? 'splash-fadeout 500ms forwards' : undefined,
        }}
      >
        {/* Icon with breathe animation */}
        <div style={{ animation: 'splash-breathe 2s ease-in-out infinite' }}>
          <PhantomIcon size={80} />
        </div>

        {/* Title */}
        <div
          style={{
            fontFamily: 'Orbitron, sans-serif',
            fontSize: '1.5rem',
            fontWeight: 900,
            color: 'var(--phantom-text-primary, #e5e5e5)',
            letterSpacing: '0.2em',
            marginTop: 24,
            textTransform: 'uppercase',
          }}
        >
          PHANTOM OS
        </div>

        {/* Progress bar */}
        <div
          style={{
            width: 200,
            height: 3,
            borderRadius: 2,
            backgroundColor: 'rgba(255,255,255,0.1)',
            overflow: 'hidden',
            marginTop: 24,
          }}
        >
          <div
            style={{
              width: '40%',
              height: '100%',
              borderRadius: 2,
              background:
                'linear-gradient(90deg, transparent, var(--phantom-accent-cyan, #00d4ff), transparent)',
              animation: 'splash-progress 1.5s ease-in-out infinite',
            }}
          />
        </div>

        {/* Status */}
        <div
          style={{
            fontSize: '0.75rem',
            color: 'var(--phantom-text-muted, #666)',
            marginTop: 12,
            letterSpacing: '0.05em',
          }}
        >
          {status}
        </div>
      </div>
    </>
  );
};
