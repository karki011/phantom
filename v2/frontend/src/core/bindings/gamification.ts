// PhantomOS v2 — Gamification bindings (Wails Go backend)
// Author: Subash Karki

import type {
  HunterProfile,
  HunterStats,
  Achievement,
  DailyQuest,
  HunterDashboard,
  HeatmapDay,
} from '../types';
import { normalize } from './_normalize';

const App = () => (window as any).go?.['app']?.App;

export const getHunterProfile = async (): Promise<HunterProfile | null> => {
  try {
    const raw = await App()?.GetHunterProfile();
    return raw ? normalize<HunterProfile>(raw) : null;
  } catch {
    return null;
  }
};

export const getHunterStats = async (): Promise<HunterStats | null> => {
  try {
    const raw = await App()?.GetHunterStats();
    return raw ? normalize<HunterStats>(raw) : null;
  } catch {
    return null;
  }
};

export const updateHunterName = async (name: string): Promise<void> => {
  await App()?.UpdateHunterName(name);
};

export const getAchievements = async (): Promise<Achievement[]> => {
  try {
    const raw = (await App()?.GetAchievements()) ?? [];
    return normalize<Achievement[]>(raw);
  } catch {
    return [];
  }
};

export const getDailyQuests = async (): Promise<DailyQuest[]> => {
  try {
    const raw = (await App()?.GetDailyQuests()) ?? [];
    return normalize<DailyQuest[]>(raw);
  } catch {
    return [];
  }
};

export const getHunterDashboard = async (): Promise<HunterDashboard | null> => {
  try {
    const raw = await App()?.GetHunterDashboard();
    return raw ? normalize<HunterDashboard>(raw) : null;
  } catch {
    return null;
  }
};

export const getActivityHeatmap = async (): Promise<HeatmapDay[]> => {
  try {
    const raw = (await App()?.GetActivityHeatmap()) ?? [];
    return normalize<HeatmapDay[]>(raw);
  } catch {
    return [];
  }
};
