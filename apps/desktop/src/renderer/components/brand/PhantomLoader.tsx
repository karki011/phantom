/**
 * PhantomLoader — OS-themed loading indicator
 * Inspired by the onboarding boot terminal aesthetic.
 * Use as a drop-in replacement for plain "Loading..." text.
 *
 * @author Subash Karki
 */
import { useEffect, useState } from 'react';

interface PhantomLoaderProps {
  /** Label shown alongside the animation (default: "Loading") */
  label?: string;
  /** Compact mode — single line, no scan animation */
  compact?: boolean;
}

const MONO = 'var(--phantom-font-mono, "JetBrains Mono", monospace)';
const CYAN = 'var(--phantom-accent-cyan, #00d4ff)';
const MUTED = 'var(--phantom-text-muted, rgba(255,255,255,0.35))';

const SCAN_FRAMES = ['[.  ]', '[.. ]', '[...]', '[ ..]', '[  .]', '[   ]'];

export function PhantomLoader({ label = 'Loading', compact = false }: PhantomLoaderProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % SCAN_FRAMES.length), 180);
    return () => clearInterval(id);
  }, []);

  if (compact) {
    return (
      <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED, letterSpacing: '0.04em' }}>
        <span style={{ color: CYAN }}>{SCAN_FRAMES[frame]}</span>{' '}{label}
      </span>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 12,
        fontFamily: MONO,
      }}
    >
      {/* Scan animation */}
      <div style={{ fontSize: 14, color: CYAN, letterSpacing: '0.08em' }}>
        {SCAN_FRAMES[frame]}
      </div>

      {/* Label */}
      <div
        style={{
          fontSize: 11,
          color: MUTED,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}
      >
        [SYSTEM] {label}
      </div>
    </div>
  );
}
