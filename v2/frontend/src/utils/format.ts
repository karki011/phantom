// Phantom — Shared formatting utilities
// Author: Subash Karki

/** Format token count: 48120 → "48.1K", 1200000 → "1.2M" */
export function formatTokens(n: number | null): string {
  if (n == null) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Format cost from USD amount: 0.82 → "$0.82", 0.005 → "$0.0050" */
export function formatCostUsd(usd: number | null): string {
  if (usd == null || usd === 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/** Format cost from microdollars: 820000 → "$0.82" */
export function formatCostMicros(micros: number | null): string {
  if (micros == null) return '$0.00';
  return formatCostUsd(micros / 1_000_000);
}

/** @deprecated Use formatCostMicros instead */
export const formatCost = formatCostMicros;

/** Format unix epoch (seconds or ms) → "HH:MM:SS" */
export function formatTime(epoch: number | null): string {
  if (epoch === null || epoch === undefined) return '--:--:--';
  const ts = epoch > 1e12 ? epoch : epoch * 1000;
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/** Relative time for display: epoch/ISO string → "2m ago" */
export function timeAgo(input: number | string | null): string {
  if (!input) return '';
  const ms = typeof input === 'string'
    ? new Date(input).getTime()
    : (input > 1e12 ? input : input * 1000);
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export const relativeTime = timeAgo;

/** Known model substring → short display name */
const MODEL_SHORT_NAMES: Record<string, string> = {
  opus: 'Opus',
  sonnet: 'Sonnet',
  haiku: 'Haiku',
  'gpt-4o': 'GPT-4o',
  'gpt-4.1': 'GPT-4.1',
  o3: 'o3',
  flash: 'Flash',
  pro: 'Pro',
  ultra: 'Ultra',
};

/** Short model name: "claude-3-opus-20240229" → "Opus", "gpt-4o-2024" → "GPT-4o" */
export function shortModel(model: string | null): string {
  if (!model) return '—';
  const lower = model.toLowerCase();
  for (const [key, label] of Object.entries(MODEL_SHORT_NAMES)) {
    if (lower.includes(key)) return label;
  }
  // Fallback: last segment of the model string
  const parts = model.split('-');
  return parts[parts.length - 1] ?? model;
}

/** Session display name: name → repo basename → id prefix */
export function sessionLabel(s: { name: string | null; repo: string | null; id: string }): string {
  if (s.name) return s.name;
  if (s.repo) return s.repo.split('/').pop() ?? s.repo;
  return s.id.slice(0, 8);
}

/** True if session is actively running */
export function isActiveSession(status: string | null): boolean {
  return status === 'active' || status === 'running';
}
