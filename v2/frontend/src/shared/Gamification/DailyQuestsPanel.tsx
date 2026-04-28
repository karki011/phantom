// PhantomOS v2 — Daily Quests panel (compact, for WorktreeHome)
// Author: Subash Karki

import { createMemo, Show, For } from 'solid-js';
import { dailyQuests, refreshDailyQuests, gamificationEnabled } from '@/core/signals/gamification';
import { QuestCard } from './QuestCard';
import { vars } from '@/styles/theme.css';
import {
  questsContainer,
  questsHeader,
  questsSectionLabel,
  questsCompletionText,
  questsEmpty,
} from '@/styles/gamification.css';

export const DailyQuestsPanel = () => {
  const quests = () => dailyQuests();
  const completedCount = createMemo(() =>
    quests().filter((q) => q.completed > 0).length,
  );
  const allComplete = createMemo(() =>
    completedCount() === quests().length && quests().length > 0,
  );

  return (
    <Show when={gamificationEnabled()}>
      <div class={questsContainer}>
        <div class={questsHeader}>
          <span class={questsSectionLabel}>Daily Quests</span>
          <span
            class={questsCompletionText}
            style={{
              color: allComplete()
                ? vars.color.success
                : vars.color.textSecondary,
            }}
          >
            {completedCount()} / {quests().length} completed
          </span>
        </div>

        <Show
          when={quests().length > 0}
          fallback={
            <div class={questsEmpty}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style={{ color: vars.color.textDisabled }}>
                <circle cx="12" cy="12" r="10" />
                <line x1="22" y1="2" x2="2" y2="22" />
              </svg>
              No quests available today
            </div>
          }
        >
          <For each={quests()}>
            {(quest) => <QuestCard quest={quest} />}
          </For>
        </Show>
      </div>
    </Show>
  );
};
