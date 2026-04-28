// Author: Subash Karki

import { APP_NAME_SPACED } from '@/core/branding';
import type { SoundCue, LineStyle } from '../boot/boot-script';

export interface ShutdownLine {
  text: string;
  delay?: number;
  style?: LineStyle;
  sound?: SoundCue;
  charDelay?: number;
}

export interface ShutdownStats {
  sessionCount: number;
  totalTokens: number;
  totalCost: number;
  uptime: string;
}

export function buildShutdownScript(stats?: ShutdownStats): ShutdownLine[] {
  const lines: ShutdownLine[] = [
    { text: APP_NAME_SPACED, style: 'title', charDelay: 30 },
    { text: 'shutdown sequence initiated', style: 'subtitle', delay: 100, charDelay: 20 },
    { text: '', style: 'separator', delay: 150 },
    { text: 'Severing neural bridge ............. done', style: 'normal', delay: 60, charDelay: 10 },
    { text: 'Closing event stream ............... done', style: 'normal', delay: 40, charDelay: 10 },
    { text: 'Persisting session memory .......... done', style: 'normal', delay: 40, charDelay: 10 },
    { text: 'Releasing core services ............ done', style: 'normal', delay: 40, charDelay: 10 },
  ];

  if (stats && (stats.sessionCount > 0 || stats.totalTokens > 0)) {
    lines.push({ text: '', style: 'separator', delay: 200 });

    const statParts: string[] = [];
    if (stats.uptime) statParts.push(`uptime ${stats.uptime}`);
    if (stats.sessionCount > 0) statParts.push(`${stats.sessionCount} session${stats.sessionCount === 1 ? '' : 's'}`);
    if (stats.totalTokens > 0) {
      const tokenStr = stats.totalTokens >= 1_000_000
        ? `${(stats.totalTokens / 1_000_000).toFixed(1)}M`
        : stats.totalTokens >= 1_000
          ? `${Math.round(stats.totalTokens / 1_000)}K`
          : `${stats.totalTokens}`;
      statParts.push(`${tokenStr} tokens`);
    }
    if (stats.totalCost > 0) statParts.push(`$${stats.totalCost.toFixed(2)}`);

    lines.push({ text: statParts.join(' · '), style: 'dim', delay: 60, charDelay: 8 });
  }

  lines.push({ text: '', style: 'separator', delay: 100 });
  lines.push({ text: `${APP_NAME_SPACED}   O F F L I N E`, style: 'accent', delay: 150, charDelay: 25 });

  return lines;
}
