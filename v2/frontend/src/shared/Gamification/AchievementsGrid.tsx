// Phantom — Achievements grid with category filter pills and progress bar
// Author: Subash Karki

import { createSignal, createMemo, For, Show } from 'solid-js';
import { achievements } from '@/core/signals/gamification';
import type { AchievementCategory } from '@/core/types';
import { AchievementCard } from './AchievementCard';
import {
  achievementsContainer,
  achievementsGrid,
  achievementsProgressSection,
  achievementsProgressBar,
  achievementsProgressFill,
  achievementsProgressText,
  filterPillList,
  filterPill,
  filterPillActive,
  questsEmpty,
} from '@/styles/gamification.css';

type CategoryFilter = 'All' | AchievementCategory;

const CATEGORIES: CategoryFilter[] = [
  'All',
  'Combat',
  'Mastery',
  'Exploration',
  'Dedication',
  'Streak',
  'Milestone',
  'Speed',
];

export const AchievementsGrid = () => {
  const [filter, setFilter] = createSignal<CategoryFilter>('All');

  const sorted = createMemo(() => {
    const all = achievements();
    // Unlocked first, then locked — within each group, sort by name
    return [...all].sort((a, b) => {
      if (a.unlocked_at && !b.unlocked_at) return -1;
      if (!a.unlocked_at && b.unlocked_at) return 1;
      return 0;
    });
  });

  const filtered = createMemo(() => {
    const f = filter();
    if (f === 'All') return sorted();
    return sorted().filter(
      (a) => a.category?.toLowerCase() === f.toLowerCase(),
    );
  });

  const unlockedCount = createMemo(() =>
    achievements().filter((a) => a.unlocked_at !== null).length,
  );

  const totalCount = createMemo(() => achievements().length);

  const progressPercent = createMemo(() => {
    const total = totalCount();
    if (total === 0) return 0;
    return Math.round((unlockedCount() / total) * 100);
  });

  return (
    <div class={achievementsContainer}>
      {/* Progress section */}
      <div class={achievementsProgressSection}>
        <span class={achievementsProgressText}>
          {unlockedCount()} of {totalCount()} Unlocked
        </span>
        <div class={achievementsProgressBar}>
          <div
            class={achievementsProgressFill}
            style={{ width: `${progressPercent()}%` }}
          />
        </div>
      </div>

      {/* Category filter pills */}
      <div class={filterPillList} role="tablist" aria-label="Filter achievements by category">
        <For each={CATEGORIES}>
          {(cat) => (
            <button
              type="button"
              class={`${filterPill} ${filter() === cat ? filterPillActive : ''}`}
              role="tab"
              aria-selected={filter() === cat}
              onClick={() => setFilter(cat)}
            >
              {cat}
            </button>
          )}
        </For>
      </div>

      {/* Grid */}
      <Show
        when={filtered().length > 0}
        fallback={
          <div class={questsEmpty}>
            No achievements in this category.
          </div>
        }
      >
        <div class={achievementsGrid}>
          <For each={filtered()}>
            {(achievement, index) => (
              <AchievementCard achievement={achievement} index={index()} />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};
