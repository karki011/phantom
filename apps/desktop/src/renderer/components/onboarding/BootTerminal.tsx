// apps/desktop/src/renderer/components/onboarding/BootTerminal.tsx
// Author: Subash Karki

import { ScrollArea } from '@mantine/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { BootLine, SoundCue } from './boot-scripts';

/* ────────────────────────── types ────────────────────────── */

interface BootTerminalProps {
  lines: BootLine[];
  onComplete?: () => void;
  onSound?: (cue: SoundCue) => void;
  paused?: boolean;
  style?: React.CSSProperties;
}

interface RenderedLine {
  text: string;
  partial: boolean; // true while still typing
  glow?: 'cyan' | 'gold' | 'green';
  progress?: number;
}

/* ────────────────────── constants ─────────────────────── */

const DEFAULT_TYPE_SPEED = 35;
const FLASH_DURATION = 100;
const PROGRESS_BAR_WIDTH = 30;
const FILLED = '\u2588'; // █
const EMPTY = '\u2591'; // ░

/* ────────────────────── helpers ──────────────────────── */

const GLOW_COLORS: Record<string, string> = {
  cyan: 'var(--phantom-accent-cyan, #00d4ff)',
  gold: 'var(--phantom-accent-gold, #f59e0b)',
  green: 'var(--phantom-status-success, #22c55e)',
};

function buildProgressText(pct: number): string {
  const filled = Math.round((pct / 100) * PROGRESS_BAR_WIDTH);
  const empty = PROGRESS_BAR_WIDTH - filled;
  return `[${FILLED.repeat(filled)}${EMPTY.repeat(empty)}] ${pct}%`;
}

/* ────────────────────── component ───────────────────── */

export function BootTerminal({
  lines,
  onComplete,
  onSound,
  paused = false,
  style,
}: BootTerminalProps) {
  const [rendered, setRendered] = useState<RenderedLine[]>([]);
  const [lineIdx, setLineIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [waiting, setWaiting] = useState(true);
  const [flash, setFlash] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* reset state when lines prop changes (new boot script) */
  const prevLinesRef = useRef(lines);
  useEffect(() => {
    if (prevLinesRef.current !== lines) {
      prevLinesRef.current = lines;
      setRendered([]);
      setLineIdx(0);
      setCharIdx(0);
      setWaiting(true);
      completedRef.current = false;
    }
  }, [lines]);

  /* auto-scroll to bottom whenever rendered changes */
  useEffect(() => {
    const vp = viewportRef.current;
    if (vp) {
      vp.scrollTop = vp.scrollHeight;
    }
  }, [rendered]);

  /* flash effect */
  const triggerFlash = useCallback(() => {
    setFlash(true);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlash(false), FLASH_DURATION);
  }, []);

  /* clean up on unmount */
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  /* ── main state machine ── */
  useEffect(() => {
    // clear any pending timer from previous tick
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    // paused — do nothing
    if (paused) return;

    // all lines done — fire completion
    if (lineIdx >= lines.length) {
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete?.();
      }
      return;
    }

    const line = lines[lineIdx];
    const speed = line.typeSpeed ?? DEFAULT_TYPE_SPEED;

    /* ── waiting phase: delay before line starts ── */
    if (waiting) {
      const delay = line.delay || 0;
      timerRef.current = setTimeout(() => {
        // fire sound cue when the line starts
        if (line.sound) onSound?.(line.sound);
        // flash
        if (line.flash) triggerFlash();
        setWaiting(false);
      }, delay);
      return;
    }

    /* ── progress bar line ── */
    if (line.progress != null) {
      setRendered((prev) => {
        // if the previous rendered line was also a progress bar, update it in place
        const last = prev[prev.length - 1];
        if (last && last.progress != null) {
          const updated = [...prev];
          updated[updated.length - 1] = {
            text: buildProgressText(line.progress!),
            partial: false,
            glow: 'cyan',
            progress: line.progress,
          };
          return updated;
        }
        // otherwise add a new progress line
        return [
          ...prev,
          {
            text: buildProgressText(line.progress!),
            partial: false,
            glow: 'cyan',
            progress: line.progress,
          },
        ];
      });
      // advance to next line
      setLineIdx((i) => i + 1);
      setCharIdx(0);
      setWaiting(true);
      return;
    }

    /* ── instant render (typeSpeed === 0) ── */
    if (speed === 0) {
      setRendered((prev) => [
        ...prev,
        {
          text: line.text,
          partial: false,
          glow: line.glow,
        },
      ]);
      setLineIdx((i) => i + 1);
      setCharIdx(0);
      setWaiting(true);
      return;
    }

    /* ── typewriter mode ── */
    if (charIdx < line.text.length) {
      // add or update the current partial line
      const partialText = line.text.slice(0, charIdx + 1);
      setRendered((prev) => {
        // if last entry is partial for this line, update it
        const last = prev[prev.length - 1];
        if (last && last.partial) {
          const updated = [...prev];
          updated[updated.length - 1] = {
            text: partialText,
            partial: true,
            glow: line.glow,
          };
          return updated;
        }
        // first char — add new entry
        return [
          ...prev,
          {
            text: partialText,
            partial: true,
            glow: line.glow,
          },
        ];
      });

      // fire typing sound per character
      onSound?.('typing');

      timerRef.current = setTimeout(() => {
        setCharIdx((c) => c + 1);
      }, speed);
      return;
    }

    /* ── line complete ── */
    setRendered((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last) {
        updated[updated.length - 1] = {
          ...last,
          text: line.text,
          partial: false,
        };
      }
      return updated;
    });
    setLineIdx((i) => i + 1);
    setCharIdx(0);
    setWaiting(true);
  }, [
    lineIdx,
    charIdx,
    waiting,
    paused,
    lines,
    onComplete,
    onSound,
    triggerFlash,
  ]);

  /* ── render ── */
  return (
    <ScrollArea
      viewportRef={viewportRef}
      style={{
        width: '100%',
        height: '100%',
        background: flash ? 'rgba(0,212,255,0.15)' : 'transparent',
        transition: flash ? 'none' : 'background 0.1s ease',
        ...style,
      }}
    >
      <div
        style={{
          padding: '2rem',
          fontFamily: 'var(--phantom-font-mono, "JetBrains Mono", monospace)',
          fontSize: 14,
          lineHeight: 1.8,
          color: 'var(--phantom-text-primary, #e0e0e0)',
        }}
      >
        {rendered.map((entry, idx) => {
          const glowColor = entry.glow ? GLOW_COLORS[entry.glow] : undefined;

          return (
            <div
              key={idx}
              style={{
                minHeight: '1.8em',
                color: glowColor ?? undefined,
                textShadow: glowColor ? `0 0 8px ${glowColor}` : undefined,
                whiteSpace: 'pre',
              }}
            >
              {entry.text}
              {entry.partial && (
                <span style={{ opacity: 0.7 }}>▌</span>
              )}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

export default BootTerminal;
