// PhantomOS v2 — Gamification reactive signals
// Author: Subash Karki

import { createSignal, createMemo } from 'solid-js';
import type {
  HunterProfile,
  HunterStats,
  Achievement,
  DailyQuest,
  HeatmapDay,
  LifetimeStats,
  HunterRank,
} from '../types';
import {
  getHunterProfile,
  getHunterStats,
  getAchievements,
  getDailyQuests,
  getHunterDashboard,
  getActivityHeatmap,
} from '../bindings';
import { onWailsEvent } from '../events';
import { getPref } from './preferences';
import { playSound } from '../audio/engine';

// ── Signals ─────────────────────────────────────────────────────────────────

const [hunterProfile, setHunterProfile] = createSignal<HunterProfile | null>(null);
const [hunterStats, setHunterStats] = createSignal<HunterStats | null>(null);
const [achievements, setAchievements] = createSignal<Achievement[]>([]);
const [dailyQuests, setDailyQuests] = createSignal<DailyQuest[]>([]);
const [heatmapData, setHeatmapData] = createSignal<HeatmapDay[]>([]);
const [lifetimeStats, setLifetimeStats] = createSignal<LifetimeStats | null>(null);

// Celebration state
const [xpGainEvent, setXpGainEvent] = createSignal<{ amount: number; source: string } | null>(null);
const [levelUpEvent, setLevelUpEvent] = createSignal<{ newLevel: number } | null>(null);
const [rankUpEvent, setRankUpEvent] = createSignal<{ newRank: HunterRank; newTitle: string } | null>(null);
const [achievementUnlockEvent, setAchievementUnlockEvent] = createSignal<Achievement | null>(null);

// ── Derived ─────────────────────────────────────────────────────────────────

const gamificationEnabled = createMemo(() => getPref('gamification_enabled') !== 'false');

const hunterLevel = createMemo(() => hunterProfile()?.level ?? 0);
const hunterRank = createMemo(() => hunterProfile()?.rank ?? 'E');

// ── Event payloads ──────────────────────────────────────────────────────────

interface XpGainedEvent {
  amount: number;
  source: string;
  newTotal: number;
}

interface LevelUpEvent {
  newLevel: number;
  newXp: number;
  newXpToNext: number;
}

interface RankUpEvent {
  newRank: HunterRank;
  newTitle: string;
}

interface AchievementUnlockedEvent {
  achievementId: string;
  name: string;
  description: string;
  icon: string;
  category: string | null;
  xpReward: number;
}

interface QuestCompletedEvent {
  questId: string;
  xpReward: number;
}

// ── Bootstrap ───────────────────────────────────────────────────────────────

export const bootstrapGamification = (): void => {
  // Initial fetch
  refreshHunterProfile();
  refreshAchievements();
  refreshDailyQuests();

  // Poll as fallback (every 60s)
  setInterval(() => {
    refreshHunterProfile();
  }, 60_000);

  // ── Wails events ──────────────────────────────────────────────────────

  onWailsEvent<XpGainedEvent>('gamification:xp_gained', (evt) => {
    setXpGainEvent({ amount: evt.amount, source: evt.source });
    // Update profile xp inline
    setHunterProfile((prev) =>
      prev ? { ...prev, xp: evt.newTotal } : prev,
    );
    // Auto-clear after animation
    setTimeout(() => setXpGainEvent(null), 2000);
  });

  onWailsEvent<LevelUpEvent>('gamification:level_up', (evt) => {
    setLevelUpEvent({ newLevel: evt.newLevel });
    setHunterProfile((prev) =>
      prev
        ? { ...prev, level: evt.newLevel, xp: evt.newXp, xp_to_next: evt.newXpToNext }
        : prev,
    );
    playSound('reveal');
    setTimeout(() => setLevelUpEvent(null), 3000);
  });

  onWailsEvent<RankUpEvent>('gamification:rank_up', (evt) => {
    setRankUpEvent({ newRank: evt.newRank, newTitle: evt.newTitle });
    setHunterProfile((prev) =>
      prev ? { ...prev, rank: evt.newRank, title: evt.newTitle } : prev,
    );
    playSound('ceremony');
    setTimeout(() => setRankUpEvent(null), 4000);
  });

  onWailsEvent<AchievementUnlockedEvent>('gamification:achievement_unlocked', (evt) => {
    const achievement: Achievement = {
      id: evt.achievementId,
      name: evt.name,
      description: evt.description,
      icon: evt.icon,
      category: (evt.category as Achievement['category']) ?? null,
      xp_reward: evt.xpReward,
      unlocked_at: Date.now(),
    };
    setAchievementUnlockEvent(achievement);
    // Update achievements list
    setAchievements((prev) =>
      prev.map((a) =>
        a.id === achievement.id ? { ...a, unlocked_at: achievement.unlocked_at } : a,
      ),
    );
    playSound('ok');
    setTimeout(() => setAchievementUnlockEvent(null), 5000);
  });

  onWailsEvent<QuestCompletedEvent>('gamification:quest_completed', (evt) => {
    setDailyQuests((prev) =>
      prev.map((q) =>
        q.id === evt.questId ? { ...q, completed: 1, progress: q.target } : q,
      ),
    );
    playSound('ok');
  });
};

// ── Refresh helpers ─────────────────────────────────────────────────────────

export const refreshHunterProfile = async (): Promise<void> => {
  const [profile, stats] = await Promise.all([getHunterProfile(), getHunterStats()]);
  if (profile) setHunterProfile(profile);
  if (stats) setHunterStats(stats);
};

export const refreshAchievements = async (): Promise<void> => {
  const data = await getAchievements();
  setAchievements(data);
};

export const refreshDailyQuests = async (): Promise<void> => {
  const data = await getDailyQuests();
  setDailyQuests(data);
};

export const refreshHeatmap = async (): Promise<void> => {
  const data = await getActivityHeatmap();
  setHeatmapData(data);
};

export const refreshDashboard = async (): Promise<void> => {
  const dashboard = await getHunterDashboard();
  if (dashboard) {
    setHunterProfile(dashboard.profile ?? null);
    setHunterStats(dashboard.stats ?? null);
    setLifetimeStats(dashboard.lifetime ?? null);
    setHeatmapData(dashboard.heatmap ?? []);
  }
};

// ── Exports ─────────────────────────────────────────────────────────────────

export {
  hunterProfile,
  hunterStats,
  achievements,
  dailyQuests,
  heatmapData,
  lifetimeStats,
  gamificationEnabled,
  hunterLevel,
  hunterRank,
  xpGainEvent,
  levelUpEvent,
  rankUpEvent,
  achievementUnlockEvent,
};
