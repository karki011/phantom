// Phantom — AI Digest drawer bindings
// Author: Subash Karki

import { normalize } from './_normalize';

const App = () => (window as any).go?.['app']?.App;

export interface DigestSummary {
  date: string;
  sessionCount: number;
  totalTokens: number;
  estimatedCost: number;
  strategiesUsed: string[];
  filesTouched: string[];
  topStrategy: string;
  summary: string;
}

const emptyDigest = (date: string): DigestSummary => ({
  date,
  sessionCount: 0,
  totalTokens: 0,
  estimatedCost: 0,
  strategiesUsed: [],
  filesTouched: [],
  topStrategy: '',
  summary: '',
});

export async function getDigestSummary(date: string): Promise<DigestSummary> {
  try {
    const raw = await App()?.GetDigestSummary(date);
    return raw ? normalize<DigestSummary>(raw) : emptyDigest(date);
  } catch {
    return emptyDigest(date);
  }
}
