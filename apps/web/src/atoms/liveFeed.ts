/**
 * Live Feed Jotai Atoms
 * Accumulates SSE events, provides grouping, filtering, and activity summary
 *
 * @author Subash Karki
 */
import { atom } from 'jotai';

const MAX_FEED_EVENTS = 80;

export interface FeedEvent {
  id: string;
  type: string;       // e.g. 'tool:pencil', 'session:new', 'task:new', 'git:commit', etc.
  category?: string;  // 'code', 'terminal', 'search', 'task', 'agent', 'git', 'user', 'response', 'session', 'achievement'
  message: string;
  detail?: string;    // Extra context (file path, command, etc.)
  timestamp: number;
}

export type FeedFilter = 'all' | 'code' | 'terminal' | 'search' | 'tasks' | 'git' | 'sessions';

export interface GroupedFeedEvent {
  id: string;
  type: string;
  category: string;
  message: string;
  detail?: string;
  timestamp: number;
  count: number;
  children: FeedEvent[];
}

export interface ActivitySummary {
  edits: number;
  reads: number;
  commands: number;
  searches: number;
  tasks: number;
  commits: number;
  agents: number;
  windowMs: number;
}

/**
 * Writable atom holding the live feed events, newest first, max 80 items
 */
export const liveFeedAtom = atom<FeedEvent[]>([]);

/**
 * Filter state atom
 */
export const feedFilterAtom = atom<FeedFilter>('all');

/**
 * Action atom that prepends an event and trims the list
 */
export const pushFeedEventAtom = atom(
  null,
  (get, set, event: FeedEvent) => {
    const current = get(liveFeedAtom);
    // Deduplicate by id
    if (current.some((e) => e.id === event.id)) return;
    const updated = [event, ...current].slice(0, MAX_FEED_EVENTS);
    set(liveFeedAtom, updated);
  },
);

/**
 * Derive the category from event type for filtering
 */
const deriveCategory = (event: FeedEvent): string => {
  if (event.category) return event.category;
  const t = event.type;
  if (t.startsWith('tool:pencil') || t.startsWith('tool:file')) return 'code';
  if (t.startsWith('tool:terminal')) return 'terminal';
  if (t.startsWith('tool:search') || t.startsWith('tool:folder-search') || t.startsWith('tool:globe') || t.startsWith('tool:download')) return 'search';
  if (t.startsWith('tool:bot') || t.startsWith('tool:wand')) return 'agent';
  if (t.startsWith('tool:list-plus') || t.startsWith('tool:check-square') || t.startsWith('task:')) return 'task';
  if (t.startsWith('git:') || t.startsWith('tool:git')) return 'git';
  if (t.startsWith('session:')) return 'session';
  if (t.startsWith('achievement:')) return 'achievement';
  if (t === 'user:message') return 'user';
  if (t === 'response') return 'response';
  return 'other';
};

const FILTER_CATEGORIES: Record<FeedFilter, string[]> = {
  all: [],
  code: ['code'],
  terminal: ['terminal'],
  search: ['search'],
  tasks: ['task'],
  git: ['git'],
  sessions: ['session'],
};

/**
 * Filtered events based on the active filter
 */
export const filteredFeedAtom = atom((get) => {
  const events = get(liveFeedAtom);
  const filter = get(feedFilterAtom);

  if (filter === 'all') return events;

  const allowedCategories = FILTER_CATEGORIES[filter];
  return events.filter((e) => allowedCategories.includes(deriveCategory(e)));
});

/**
 * Group consecutive events of the same category within a 30s window
 */
export const groupedFeedAtom = atom((get): GroupedFeedEvent[] => {
  const events = get(filteredFeedAtom);
  if (events.length === 0) return [];

  const groups: GroupedFeedEvent[] = [];
  let currentGroup: GroupedFeedEvent | null = null;

  for (const event of events) {
    const cat = deriveCategory(event);

    // Don't group special events — they always stand alone
    const isSpecial = ['session', 'achievement', 'task', 'user', 'agent'].includes(cat);

    if (
      !isSpecial &&
      currentGroup &&
      currentGroup.category === cat &&
      Math.abs(currentGroup.timestamp - event.timestamp) < 30_000 &&
      currentGroup.count < 8
    ) {
      // Merge into current group
      currentGroup.children.push(event);
      currentGroup.count++;
      // Update message to show count
      currentGroup.message = summarizeGroup(currentGroup.category, currentGroup.children);
    } else {
      // Start a new group
      if (currentGroup) groups.push(currentGroup);
      currentGroup = {
        id: event.id,
        type: event.type,
        category: cat,
        message: event.message,
        detail: event.detail,
        timestamp: event.timestamp,
        count: 1,
        children: [event],
      };
    }
  }
  if (currentGroup) groups.push(currentGroup);

  return groups;
});

const summarizeGroup = (category: string, events: FeedEvent[]): string => {
  const n = events.length;
  if (n <= 1) return events[0]?.message ?? '';

  switch (category) {
    case 'code': {
      const edits = events.filter((e) => e.type.includes('pencil')).length;
      const reads = events.filter((e) => e.type.includes('file-text')).length;
      const creates = events.filter((e) => e.type.includes('file-plus')).length;
      const parts: string[] = [];
      if (edits > 0) parts.push(`${edits} edit${edits > 1 ? 's' : ''}`);
      if (reads > 0) parts.push(`${reads} read${reads > 1 ? 's' : ''}`);
      if (creates > 0) parts.push(`${creates} create${creates > 1 ? 's' : ''}`);
      return parts.join(', ') || `${n} file operations`;
    }
    case 'terminal':
      return `${n} command${n > 1 ? 's' : ''} executed`;
    case 'search':
      return `${n} search${n > 1 ? 'es' : ''} performed`;
    case 'git':
      return `${n} git operation${n > 1 ? 's' : ''}`;
    default:
      return `${n} events`;
  }
};

/**
 * Activity summary for the last 5 minutes
 */
export const activitySummaryAtom = atom((get): ActivitySummary => {
  const events = get(liveFeedAtom);
  const windowMs = 5 * 60 * 1000;
  const cutoff = Date.now() - windowMs;
  const recent = events.filter((e) => e.timestamp >= cutoff);

  return {
    edits: recent.filter((e) => e.type.includes('pencil') || e.type.includes('file-plus')).length,
    reads: recent.filter((e) => e.type.includes('file-text')).length,
    commands: recent.filter((e) => e.type.includes('terminal')).length,
    searches: recent.filter((e) => e.type.includes('search') || e.type.includes('folder-search') || e.type.includes('globe')).length,
    tasks: recent.filter((e) => e.type.startsWith('task:')).length,
    commits: recent.filter((e) => e.type.includes('git-commit') || e.category === 'git').length,
    agents: recent.filter((e) => e.type.includes('bot') || e.type.includes('wand')).length,
    windowMs,
  };
});
