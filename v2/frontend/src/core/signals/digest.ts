// Phantom — AI Digest drawer signals
// Author: Subash Karki

import { createSignal } from 'solid-js';
import type { DigestSummary } from '../bindings/digest';
import { getDigestSummary } from '../bindings/digest';
import type { DailyCostReport } from '../bindings/cost';
import { getDailyCostReport } from '../bindings/cost';

// Drawer open/close state
const [digestOpen, setDigestOpen] = createSignal(false);

export const openDigest = () => setDigestOpen(true);
export const closeDigest = () => setDigestOpen(false);
export const toggleDigest = () => setDigestOpen((v) => !v);
export { digestOpen };

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
