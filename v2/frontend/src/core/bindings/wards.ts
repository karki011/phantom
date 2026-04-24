// Author: Subash Karki

import { normalize } from './_normalize';

const App = () => (window as any).go?.['app']?.App;

export interface WardRule {
  id: string;
  name: string;
  level: string;
  description: string;
  tool: string;
  pattern: string;
  path_pattern: string;
  message: string;
  allow_bypass: boolean;
  enabled: boolean;
  audit: boolean;
  tags: string[];
  event_type: string;
  session_ids: string[];
}

export interface WardPreset {
  id: string;
  name: string;
  description: string;
  rule_count: number;
}

export async function getWards(): Promise<WardRule[]> {
  try {
    const raw = (await App()?.GetWards()) ?? [];
    return normalize<WardRule[]>(raw);
  } catch {
    return [];
  }
}

export async function saveWardRule(rule: WardRule): Promise<void> {
  await App()?.SaveWardRule(rule);
}

export async function deleteWardRule(ruleID: string): Promise<void> {
  await App()?.DeleteWardRule(ruleID);
}

export async function toggleWardRule(ruleID: string, enabled: boolean): Promise<void> {
  await App()?.ToggleWardRule(ruleID, enabled);
}

export async function getWardPresets(): Promise<WardPreset[]> {
  try {
    const raw = (await App()?.GetWardPresets()) ?? [];
    return normalize<WardPreset[]>(raw);
  } catch {
    return [];
  }
}

export async function applyWardPreset(presetID: string): Promise<void> {
  await App()?.ApplyWardPreset(presetID);
}
