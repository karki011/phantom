// Author: Subash Karki

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
    { text: 'P H A N T O M   O S', style: 'title', charDelay: 40, sound: 'bass' },
    { text: 'shutdown sequence initiated', style: 'subtitle', delay: 200, charDelay: 30 },
    { text: '', style: 'separator', delay: 300 },
    { text: 'Severing neural bridge ............. done', style: 'normal', delay: 100, sound: 'scan', charDelay: 15 },
    { text: 'Closing event stream ............... done', style: 'normal', delay: 80, sound: 'scan', charDelay: 15 },
    { text: 'Standing down defense wards ........ done', style: 'normal', delay: 80, sound: 'scan', charDelay: 15 },
    { text: 'Persisting session memory .......... done', style: 'normal', delay: 80, sound: 'scan', charDelay: 15 },
    { text: 'Releasing core services ............ done', style: 'normal', delay: 80, sound: 'scan', charDelay: 15 },
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

    lines.push({ text: statParts.join(' · '), style: 'dim', delay: 100, charDelay: 12 });
  }

  lines.push({ text: '', style: 'separator', delay: 200 });
  lines.push({ text: 'S Y S T E M   O F F L I N E', style: 'accent', delay: 300, sound: 'ok', charDelay: 35 });

  return lines;
}
