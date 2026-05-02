// Phantom — Guided tour step definitions
// Author: Subash Karki

import type { TopTab } from '@/core/signals/app';

export interface TourStep {
  element?: string;
  requiredTab?: TopTab;
  title: string;
  description: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}

export const TOUR_STEPS: TourStep[] = [
  {
    element: '[data-tour="tab-system"]',
    requiredTab: 'system',
    title: '[SYSTEM] System View',
    description: 'Live metrics, analytics, resources, project dashboard. Click again to drill into Hunter Profile.',
    side: 'bottom',
    align: 'start',
  },
  {
    element: '[data-tour="tab-worktree"]',
    requiredTab: 'worktree',
    title: '[SYSTEM] Project View',
    description: 'Your coding workspace — terminals, editors, file explorer in split panes.',
    side: 'bottom',
    align: 'start',
  },
  {
    element: '[data-tour="sidebar-worktree"]',
    requiredTab: 'worktree',
    title: '[SYSTEM] Projects & Worktrees',
    description: 'Your repos and branches. Right-click to manage, click to open.',
    side: 'right',
    align: 'start',
  },
  {
    element: '[data-tour="sidebar-actions"]',
    requiredTab: 'worktree',
    title: '[SYSTEM] Add Projects',
    description: 'Add Project (folder picker), Scan (search a directory), Clone (URL). Get your codebase in here.',
    side: 'top',
    align: 'start',
  },
  {
    element: '[data-tour="stats-center"]',
    title: '[SYSTEM] Live Stats',
    description: 'Active sessions, CPU, RAM, battery, and current worktree — at a glance.',
    side: 'bottom',
    align: 'center',
  },
  {
    element: '[data-tour="action-server-log"]',
    title: '[SYSTEM] Server log',
    description: 'Recent server log lines — same output as the running process, in a side drawer. Pin to keep it open while you work.',
    side: 'bottom',
    align: 'end',
  },
  {
    element: '[data-tour="action-cmdpalette"]',
    title: '[SYSTEM] Command Palette',
    description: 'Quick fuzzy-search for everything. ⌘P to open.',
    side: 'bottom',
    align: 'end',
  },
  {
    element: '[data-tour="action-docs"]',
    title: '[SYSTEM] Docs',
    description: 'Inline documentation. Search any feature without leaving the app.',
    side: 'bottom',
    align: 'end',
  },
  {
    element: '[data-tour="action-digest"]',
    title: '[SYSTEM] Daily Digest',
    description: 'Your work journal — sessions, PRs, commits, and AI-generated summaries by date.',
    side: 'bottom',
    align: 'end',
  },
  {
    element: '[data-tour="action-ai"]',
    title: '[SYSTEM] AI Command Center',
    description: 'Strategy pipeline, decisions, evolution. The brain behind Phantom.',
    side: 'bottom',
    align: 'end',
  },
  {
    element: '[data-tour="action-settings"]',
    title: '[SYSTEM] Settings',
    description: 'Theme, sounds, font, zoom, AI integration. Replay this tour from here too.',
    side: 'bottom',
    align: 'end',
  },
  {
    element: '[data-tour="action-shutdown"]',
    title: '[SYSTEM] Shutdown',
    description: 'Clean shutdown — flushes journal, closes sessions, saves state.',
    side: 'bottom',
    align: 'end',
  },
  {
    element: '[data-tour="hunter-button"]',
    title: '[SYSTEM] Hunter Profile',
    description: 'Level, XP, daily quests, achievements. Click to dive into your profile and stats.',
    side: 'bottom',
    align: 'end',
  },
  {
    title: '[SYSTEM] You\'re All Set',
    description: '⌘P for command palette · ⌘T for new terminal · right-click anything for more options.\n\nWelcome to The System.',
  },
];
