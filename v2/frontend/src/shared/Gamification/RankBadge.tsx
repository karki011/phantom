// PhantomOS v2 — Rank Badge component
// Author: Subash Karki

import type { HunterRank } from '@/core/types';
import { RANK_COLORS, rankBadge, rankCircle, rankCircleSm, rankCircleMd, rankCircleLg, rankLetter, rankTitle, glowPulse, sssGlowPulse } from '@/styles/gamification.css';
import { vars } from '@/styles/theme.css';

interface RankBadgeProps {
  rank: HunterRank;
  title?: string;
  size?: 'sm' | 'md' | 'lg';
}

const getRankColors = (rank?: string) =>
  RANK_COLORS[(rank ?? 'E').toUpperCase()] ?? RANK_COLORS.E;

const sizeClass: Record<string, string> = {
  sm: rankCircleSm,
  md: rankCircleMd,
  lg: rankCircleLg,
};

const fontSizeMap: Record<string, Record<string, string>> = {
  sm: { single: '0.625rem', multi: '0.5rem' },
  md: { single: '1.25rem', multi: '0.875rem' },
  lg: { single: '2rem', multi: '1.25rem' },
};

export const RankBadge = (props: RankBadgeProps) => {
  const size = () => props.size ?? 'md';
  const rank = () => props.rank ?? 'F';
  const colors = () => getRankColors(rank());
  const hasGlow = () => !!colors().glow;
  const isSSS = () => rank() === 'SSS';
  const isMultiChar = () => rank().length > 1;

  const fontSize = () => {
    const s = size();
    return isMultiChar()
      ? fontSizeMap[s].multi
      : fontSizeMap[s].single;
  };

  const glowStyle = () => {
    const c = colors();
    if (!c.glow) return {};
    return {
      animation: isSSS()
        ? `${sssGlowPulse} 2s ease-in-out infinite`
        : `${glowPulse} 3s ease-in-out infinite`,
    };
  };

  return (
    <div class={rankBadge}>
      <div
        class={`${rankCircle} ${sizeClass[size()]}`}
        style={{
          'border-color': colors().border,
          'background-color': colors().bg,
          'box-shadow': hasGlow()
            ? `0 0 12px ${colors().glow}40, 0 0 24px ${colors().glow}20`
            : 'none',
          ...glowStyle(),
        }}
        role="img"
        aria-label={`Rank ${rank()}`}
      >
        <span
          class={rankLetter}
          style={{
            color: colors().text,
            'font-size': fontSize(),
          }}
        >
          {rank().toUpperCase()}
        </span>
      </div>
      {props.title && (
        <span class={rankTitle}>{props.title}</span>
      )}
    </div>
  );
};
