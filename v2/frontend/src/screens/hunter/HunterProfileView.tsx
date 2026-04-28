// PhantomOS v2 — Hunter Profile View (full page with tabs)
// Author: Subash Karki

import { createSignal, onMount, Show, For, type JSX } from 'solid-js';
import { User } from 'lucide-solid';
import {
  hunterProfile,
  hunterStats,
  heatmapData,
  lifetimeStats,
  refreshDashboard,
  refreshAchievements,
  refreshDailyQuests,
  refreshHeatmap,
  refreshHunterProfile,
} from '@/core/signals/gamification';
import { updateHunterName } from '@/core/bindings/gamification';
import { RankBadge, XPProgressBar, StatBar, ActivityHeatmap } from '@/shared/Gamification';
import { AchievementsGrid } from '@/shared/Gamification/AchievementsGrid';
import { DailyQuestsPanel } from '@/shared/Gamification/DailyQuestsPanel';
import { vars } from '@/styles/theme.css';
import * as styles from './HunterProfileView.css';
import * as gStyles from '@/styles/gamification.css';

// ── Stat config ─────────────────────────────────────────────────────────────

const STAT_CONFIG = [
  { key: 'strength' as const, abbreviation: 'STR', label: 'Strength' },
  { key: 'intelligence' as const, abbreviation: 'INT', label: 'Intelligence' },
  { key: 'agility' as const, abbreviation: 'AGI', label: 'Agility' },
  { key: 'vitality' as const, abbreviation: 'VIT', label: 'Vitality' },
  { key: 'perception' as const, abbreviation: 'PER', label: 'Perception' },
  { key: 'sense' as const, abbreviation: 'SEN', label: 'Sense' },
] as const;

// ── Helpers ─────────────────────────────────────────────────────────────────

const formatCompactNumber = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
};

const formatDuration = (minutes: number): string => {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
};

const formatHour = (hour: number): string => {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
};

const formatCost = (micros: number): string => {
  const dollars = micros / 1_000_000;
  if (dollars >= 1000) return `$${formatCompactNumber(Math.round(dollars))}`;
  if (dollars >= 1) return `$${dollars.toFixed(2)}`;
  return `$${dollars.toFixed(4)}`;
};

// ── Lifetime stat card definitions ──────────────────────────────────────────

interface StatCardDef {
  key: string;
  icon: string;
  label: string;
  getValue: (s: NonNullable<ReturnType<typeof lifetimeStats>>) => string;
  getSublabel?: (s: NonNullable<ReturnType<typeof lifetimeStats>>) => string;
}

const LIFETIME_CARDS: StatCardDef[] = [
  { key: 'sessions', icon: '📊', label: 'Total Sessions', getValue: (s) => s.total_sessions.toLocaleString() },
  { key: 'tokens', icon: '⚡', label: 'Total Tokens', getValue: (s) => formatCompactNumber(s.total_tokens) },
  { key: 'cost', icon: '💰', label: 'Total Cost', getValue: (s) => formatCost(s.total_cost) },
  { key: 'model', icon: '👑', label: 'Favorite Model', getValue: (s) => s.favorite_model || '--' },
  { key: 'longest', icon: '⏱', label: 'Longest Session', getValue: (s) => formatDuration(s.longest_session) },
  { key: 'streak', icon: '🔥', label: 'Current Streak', getValue: (s) => `${s.current_streak}d`, getSublabel: (s) => `best: ${s.best_streak}d` },
  { key: 'active', icon: '📅', label: 'Active Days', getValue: (s) => s.active_days.toLocaleString() },
  { key: 'peak', icon: '🕐', label: 'Peak Hour', getValue: (s) => formatHour(s.peak_hour) },
];

// ── Tabs ────────────────────────────────────────────────────────────────────

type TabKey = 'profile' | 'achievements' | 'quests' | 'stats';

// ── Component ───────────────────────────────────────────────────────────────

export function HunterProfileView(): JSX.Element {
  const [activeTab, setActiveTab] = createSignal<TabKey>('profile');
  const [editing, setEditing] = createSignal(false);
  const [editName, setEditName] = createSignal('');
  const [loading, setLoading] = createSignal(true);

  onMount(async () => {
    await Promise.all([
      refreshDashboard(),
      refreshAchievements(),
      refreshDailyQuests(),
      refreshHeatmap(),
    ]);
    setLoading(false);
  });

  const handleNameClick = () => {
    const profile = hunterProfile();
    if (profile) {
      setEditName(profile.name);
      setEditing(true);
    }
  };

  const handleNameSubmit = async () => {
    const trimmed = editName().trim();
    const profile = hunterProfile();
    if (trimmed && trimmed !== profile?.name) {
      try {
        await updateHunterName(trimmed);
        await refreshHunterProfile();
      } catch {
        // Name stays unchanged
      }
    }
    setEditing(false);
  };

  const handleNameKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') handleNameSubmit();
    if (e.key === 'Escape') setEditing(false);
  };

  return (
    <div class={gStyles.profileContainer}>
      {/* Header */}
      <div class={gStyles.profileHeader}>
        <User size={28} class={gStyles.profileHeaderIcon} />
        <span class={gStyles.profileHeaderTitle}>Hunter Profile</span>
      </div>

      {/* Tab navigation */}
      <div class={gStyles.tabList} role="tablist">
        {(['profile', 'achievements', 'quests', 'stats'] as TabKey[]).map((tab) => (
          <button
            type="button"
            class={`${gStyles.tabTrigger} ${activeTab() === tab ? gStyles.tabTriggerActive : ''}`}
            role="tab"
            aria-selected={activeTab() === tab}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div class={gStyles.tabContent}>
        {/* ── Profile Tab ──────────────────────────────────────────────── */}
        <Show when={activeTab() === 'profile'}>
          <Show
            when={!loading() && hunterProfile()}
            fallback={
              <div style={{ color: vars.color.textDisabled, 'text-align': 'center', padding: vars.space.xl }}>
                {loading() ? 'Loading...' : 'Unable to load hunter data.'}
              </div>
            }
          >
            {(profile) => (
              <>
                <div class={gStyles.profileGrid}>
                  {/* Left: Identity */}
                  <div class={gStyles.profilePanel}>
                    <div class={gStyles.profileAvatar} role="img" aria-label="Hunter avatar">
                      <User size={48} />
                    </div>

                    <Show
                      when={!editing()}
                      fallback={
                        <input
                          class={gStyles.profileNameInput}
                          value={editName()}
                          onInput={(e) => setEditName(e.currentTarget.value)}
                          onBlur={handleNameSubmit}
                          onKeyDown={handleNameKeyDown}
                          autofocus
                          aria-label="Edit hunter name"
                        />
                      }
                    >
                      <span
                        class={gStyles.profileName}
                        onClick={handleNameClick}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleNameClick(); }}
                        tabIndex={0}
                        role="button"
                        aria-label={`Hunter name: ${profile().name}. Click to edit.`}
                      >
                        {profile().name}
                      </span>
                    </Show>

                    <span class={gStyles.profileTitle}>{profile().title}</span>

                    <RankBadge rank={profile().rank} title={profile().title} size="md" />

                    <span class={gStyles.profileLevel} aria-label={`Level ${profile().level}`}>
                      Lv. {profile().level}
                    </span>

                    <div style={{ width: '100%' }}>
                      <XPProgressBar
                        current={profile().xp}
                        required={profile().xp_to_next}
                        level={profile().level}
                      />
                    </div>
                  </div>

                  {/* Right: Stats */}
                  <div class={gStyles.statsPanel}>
                    <span class={gStyles.statsSectionLabel}>Stats</span>
                    <div style={{ display: 'flex', 'flex-direction': 'column', gap: vars.space.xs }}>
                      <Show when={hunterStats()}>
                        {(stats) => (
                          <For each={STAT_CONFIG}>
                            {(cfg, idx) => (
                              <StatBar
                                label={cfg.label}
                                abbreviation={cfg.abbreviation}
                                value={stats()[cfg.key]}
                                delay={idx() * 100}
                              />
                            )}
                          </For>
                        )}
                      </Show>
                    </div>
                  </div>
                </div>

                {/* Activity Heatmap */}
                <Show when={(heatmapData() ?? []).length > 0}>
                  <ActivityHeatmap data={heatmapData()} />
                </Show>

                {/* Lifetime Stats */}
                <Show when={lifetimeStats()}>
                  {(stats) => (
                    <div>
                      <span class={gStyles.statsSectionLabel}>Lifetime Stats</span>
                      <div class={gStyles.lifetimeGrid} role="region" aria-label="Lifetime statistics">
                        <For each={LIFETIME_CARDS}>
                          {(card) => (
                            <div class={gStyles.lifetimeCard}>
                              <div class={gStyles.lifetimeIconRow}>
                                <span style={{ 'font-size': '1.25rem' }}>{card.icon}</span>
                                <span class={gStyles.lifetimeLabel}>{card.label}</span>
                              </div>
                              <span class={gStyles.lifetimeValue}>{card.getValue(stats())}</span>
                              <Show when={card.getSublabel}>
                                {(getSub) => (
                                  <span class={gStyles.lifetimeSublabel}>{getSub()(stats())}</span>
                                )}
                              </Show>
                            </div>
                          )}
                        </For>
                      </div>
                    </div>
                  )}
                </Show>
              </>
            )}
          </Show>
        </Show>

        {/* ── Achievements Tab ─────────────────────────────────────────── */}
        <Show when={activeTab() === 'achievements'}>
          <AchievementsGrid />
        </Show>

        {/* ── Quests Tab ───────────────────────────────────────────────── */}
        <Show when={activeTab() === 'quests'}>
          <DailyQuestsPanel />
        </Show>

        {/* ── Stats Tab (same as profile lifetime + heatmap) ───────────── */}
        <Show when={activeTab() === 'stats'}>
          <Show when={(heatmapData() ?? []).length > 0}>
            <ActivityHeatmap data={heatmapData()} />
          </Show>
          <Show when={lifetimeStats()}>
            {(stats) => (
              <div>
                <span class={gStyles.statsSectionLabel}>Lifetime Stats</span>
                <div class={gStyles.lifetimeGrid} role="region" aria-label="Lifetime statistics">
                  <For each={LIFETIME_CARDS}>
                    {(card) => (
                      <div class={gStyles.lifetimeCard}>
                        <div class={gStyles.lifetimeIconRow}>
                          <span style={{ 'font-size': '1.25rem' }}>{card.icon}</span>
                          <span class={gStyles.lifetimeLabel}>{card.label}</span>
                        </div>
                        <span class={gStyles.lifetimeValue}>{card.getValue(stats())}</span>
                        <Show when={card.getSublabel}>
                          {(getSub) => (
                            <span class={gStyles.lifetimeSublabel}>{getSub()(stats())}</span>
                          )}
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            )}
          </Show>
        </Show>
      </div>
    </div>
  );
}
