// Phantom — AI Digest drawer signals
// Author: Subash Karki

import { createSignal } from 'solid-js';
import type { DigestSummary } from '../bindings/digest';
import { getDigestSummary } from '../bindings/digest';
import type { DailyCostReport } from '../bindings/cost';
import { getDailyCostReport } from '../bindings/cost';

// Drawer open/close state
const [digestOpen, setDigestOpen] = createSignal(false);
const [digestDate, setDigestDate] = createSignal(new Date().toISOString().slice(0, 10));

export const openDigest = () => setDigestOpen(true);
export const closeDigest = () => setDigestOpen(false);
export const toggleDigest = () => setDigestOpen((v) => !v);
export { digestOpen, digestDate };

export function goToPrevDay(): void {
  const d = new Date(digestDate());
  d.setDate(d.getDate() - 1);
  const prev = d.toISOString().slice(0, 10);
  setDigestDate(prev);
  void loadDigest(prev);
}

export function goToNextDay(): void {
  const today = new Date().toISOString().slice(0, 10);
  const d = new Date(digestDate());
  d.setDate(d.getDate() + 1);
  const next = d.toISOString().slice(0, 10);
  if (next > today) return;
  setDigestDate(next);
  void loadDigest(next);
}

export function goToToday(): void {
  const today = new Date().toISOString().slice(0, 10);
  setDigestDate(today);
  void loadDigest(today);
}

export function isToday(): boolean {
  return digestDate() === new Date().toISOString().slice(0, 10);
}

// Loaded digest data
const [digestData, setDigestData] = createSignal<DigestSummary | null>(null);
const [digestLoading, setDigestLoading] = createSignal(false);

// Loaded cost report (parallel to digest, same date window)
const [costReport, setCostReport] = createSignal<DailyCostReport | null>(null);

export { digestData, digestLoading, costReport };

// Fetch digest + cost report for a specific date (default: today)
export async function loadDigest(date?: string): Promise<void> {
  const target = date ?? new Date().toISOString().slice(0, 10);
  setDigestLoading(true);
  try {
    const [data, cost] = await Promise.all([
      getDigestSummary(target),
      getDailyCostReport(target),
    ]);
    setDigestData(data);
    setCostReport(cost);
  } finally {
    setDigestLoading(false);
  }
}
