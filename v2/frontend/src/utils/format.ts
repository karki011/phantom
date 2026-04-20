// PhantomOS v2 — Shared formatting utilities
// Author: Subash Karki

/** Format token count: 48120 → "48.1K", 1200000 → "1.2M" */
export function formatTokens(n: number | null): string {
  if (n === null || n === undefined) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Format cost from microdollars: 820000 → "$0.82" */
export function formatCost(micros: number | null): string {
  if (micros === null || micros === undefined) return '$0.00';
  return `$${(micros / 1_000_000).toFixed(2)}`;
}

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

/** Relative time for display: epoch → "2m ago" */
export function relativeTime(epoch: number | null): string {
  if (!epoch) return '';
  const ts = epoch > 1e12 ? epoch : epoch * 1000;
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Short model name: "claude-3-opus-20240229" → "opus" */
export function shortModel(model: string | null): string {
  if (!model) return '—';
  const parts = model.split('-');
  const known = ['opus', 'sonnet', 'haiku'];
  for (const p of parts) {
    if (known.includes(p)) return p;
  }
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
