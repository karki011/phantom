// Phantom — AI cost intelligence bindings
// Author: Subash Karki

import { normalize } from './_normalize';
import { App } from './_app';

export interface DailyCostReport {
  date: string;
  totalCost: number;
  totalTokens: number;
  sessionCount: number;
  costByModel: Record<string, number>;
  costByStrategy: Record<string, number>;
  strategyWinRates: Record<string, number>;
  costModelVersion: string;
}

const emptyReport = (date: string): DailyCostReport => ({
  date,
  totalCost: 0,
  totalTokens: 0,
  sessionCount: 0,
  costByModel: {},
  costByStrategy: {},
  strategyWinRates: {},
  costModelVersion: '',
});

export async function getDailyCostReport(date: string): Promise<DailyCostReport> {
  try {
    const raw = await App()?.GetDailyCostReport(date);
    return raw ? normalize<DailyCostReport>(raw) : emptyReport(date);
  } catch {
    return emptyReport(date);
  }
}

export async function getCostModelVersion(): Promise<string> {
  try {
    return (await App()?.GetCostModelVersion()) ?? '';
  } catch {
    return '';
  }
}
