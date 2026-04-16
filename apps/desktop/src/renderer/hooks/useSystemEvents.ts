/**
 * useSystemEvents Hook
 * Connects to SSE endpoint and dispatches updates to Jotai atoms
 *
 * @author Subash Karki
 */
import { useSetAtom, useStore } from 'jotai';
import { useEffect, startTransition } from 'react';

import { aiCommitFamily, removeCommitGenAtom } from '../atoms/aiCommit';
import { removePrCreatingAtom, bumpActivityRefreshAtom } from '../atoms/activity';
import { refreshAchievementsAtom } from '../atoms/achievements';
import { dispatchGraphEventAtom } from '../atoms/graph';
import { pushFeedEventAtom, pushFeedEventsAtom } from '../atoms/liveFeed';
import { sseConnectionAtom, systemNotificationsAtom } from '../atoms/system';
import { showSystemNotification } from '../components/notifications/SystemToast';
import { makeId } from '@phantom-os/shared';
import { appendJournalLog } from '../lib/api';
import { queryClient } from '../lib/queryClient';

/** Append a line to today's journal work log (fire-and-forget) */
const logToJournal = (line: string): void => {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  appendJournalLog(date, `${time} · ${line}`).catch(() => {});
};

const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3849' : '';
const SSE_URL = `${API_BASE}/events`;

interface SSEEvent {
  type: string;
  data?: Record<string, unknown>;
}

export const useSystemEvents = (): void => {
  const refreshAchievements = useSetAtom(refreshAchievementsAtom);
  const dispatchNotification = useSetAtom(systemNotificationsAtom);
  const pushFeedEvent = useSetAtom(pushFeedEventAtom);
  const pushFeedEvents = useSetAtom(pushFeedEventsAtom);
  const setSseConnection = useSetAtom(sseConnectionAtom);
  const removePrCreating = useSetAtom(removePrCreatingAtom);
  const bumpActivityRefresh = useSetAtom(bumpActivityRefreshAtom);
  const removeCommitGen = useSetAtom(removeCommitGenAtom);
  const store = useStore();

  /** Invalidate session + hunter queries via TanStack Query */
  const invalidateSessionsAndHunter = () => {
    queryClient.invalidateQueries({ queryKey: ['sessions'] });
    queryClient.invalidateQueries({ queryKey: ['hunter'] });
  };

  useEffect(() => {
    let source: EventSource | null = null;
    let retryCount = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;

    const connect = () => {
      if (unmounted) return;
      source = new EventSource(SSE_URL);
      setSseConnection('connecting');

      source.onopen = () => {
        retryCount = 0;
        setSseConnection('connected');
      };

      source.onmessage = (event) => {
        let parsed: SSEEvent;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }

        const eventType = parsed.type ?? '';

        // Session events: session:new, session:update, session:end, session:stale
        if (eventType.startsWith('session:')) {
          invalidateSessionsAndHunter();

          const sessionData = parsed.data as Record<string, unknown> | undefined;
          if (eventType === 'session:new') {
            const sessionName = String(sessionData?.repo ?? sessionData?.name ?? 'unknown');
            logToJournal(`[${sessionName}] Session started`);
            startTransition(() => {
              pushFeedEvent({
                id: makeId('feed'),
                type: eventType,
                category: 'session',
                message: `Session started: ${sessionName}`,
                timestamp: Date.now(),
              });
            });
          } else if (eventType === 'session:end') {
            const sessionId = String(sessionData?.id ?? '').slice(0, 8);
            const tokens = Number(sessionData?.inputTokens ?? 0) + Number(sessionData?.outputTokens ?? 0);
            const costMicros = Number(sessionData?.estimatedCostMicros ?? 0);
            const costStr = costMicros > 0 ? `, $${(costMicros / 1_000_000).toFixed(2)}` : '';
            const tokenStr = tokens > 0 ? `, ${tokens > 1000 ? `${(tokens / 1000).toFixed(0)}K` : tokens} tokens` : '';
            logToJournal(`Session ended (${sessionId})${tokenStr}${costStr}`);
            startTransition(() => {
              pushFeedEvent({
                id: makeId('feed'),
                type: eventType,
                category: 'session',
                message: `Session ended: ${sessionId}`,
                timestamp: Date.now(),
              });
            });

            // Dispatch sound event with project context (side effect — outside startTransition)
            const cwd = String(sessionData?.cwd ?? '');
            const repo = String(sessionData?.repo ?? '');
            const project = repo || cwd.split('/').pop() || 'unknown';
            window.dispatchEvent(new CustomEvent('phantom:sound', {
              detail: { event: 'claude_complete', project, repo, cwd },
            }));
          }
          return;
        }

        // Task events: task:new, task:update
        if (eventType.startsWith('task:')) {
          invalidateSessionsAndHunter();

          const taskData = parsed.data as Record<string, unknown> | undefined;
          const taskSubject = String(taskData?.subject ?? 'untitled');
          if (eventType === 'task:new') {
            startTransition(() => {
              pushFeedEvent({
                id: makeId('feed'),
                type: eventType,
                category: 'task',
                message: `Task created: ${taskSubject}`,
                timestamp: Date.now(),
              });
            });
          } else if (eventType === 'task:update' && taskData?.status === 'completed') {
            startTransition(() => {
              pushFeedEvent({
                id: makeId('feed'),
                type: eventType,
                category: 'task',
                message: `Task completed: ${taskSubject}`,
                timestamp: Date.now(),
              });
            });

            window.dispatchEvent(new CustomEvent('phantom:sound', {
              detail: { event: 'task_complete', task: taskSubject },
            }));
          }
          return;
        }

        // Achievement events
        if (eventType === 'achievement:unlock') {
          const achievementData = parsed.data as Record<string, unknown> | undefined;
          const achievementName = String(achievementData?.name ?? 'A new achievement!');
          refreshAchievements();
          queryClient.invalidateQueries({ queryKey: ['hunter'] });
          startTransition(() => {
            dispatchNotification({
              type: 'add',
              notification: {
                id: `achievement-${Date.now()}`,
                title: 'Achievement Unlocked',
                message: achievementName,
                type: 'success',
              },
            });
            pushFeedEvent({
              id: makeId('feed'),
              type: eventType,
              category: 'achievement',
              message: `Achievement unlocked: ${achievementName}`,
              timestamp: Date.now(),
            });
          });
          return;
        }

        // Activity events from JSONL poller — batched into a single state update
        if (eventType === 'activity') {
          const activityData = parsed.data as { events?: { id: string; sessionName: string; category: string; icon: string; message: string; detail?: string; timestamp: string }[] } | undefined;
          if (activityData?.events && activityData.events.length > 0) {
            const feedEvents = activityData.events.map((evt) => ({
              id: evt.id,
              type: evt.category === 'git'
                ? `git:${evt.icon}`
                : evt.category === 'user'
                  ? 'user:message'
                  : evt.category === 'response'
                    ? 'response'
                    : `tool:${evt.icon}`,
              category: evt.category === 'user' ? 'user' : evt.category === 'response' ? 'response' : evt.category,
              message: evt.sessionName !== '' ? `[${evt.sessionName}] ${evt.message}` : evt.message,
              detail: evt.detail,
              timestamp: new Date(evt.timestamp).getTime() || Date.now(),
            }));
            startTransition(() => {
              pushFeedEvents(feedEvents);
            });
          }
          return;
        }

        // Level-up events
        if (eventType === 'level-up') {
          queryClient.invalidateQueries({ queryKey: ['hunter'] });
          startTransition(() => {
            dispatchNotification({
              type: 'add',
              notification: {
                id: `level-up-${Date.now()}`,
                title: 'LEVEL UP',
                message: String(
                  (parsed.data as Record<string, unknown>)?.message ?? 'You have grown stronger.',
                ),
                type: 'success',
              },
            });
          });
        }

        // PR creation events (background Claude)
        if (eventType === 'pr:success') {
          const data = parsed.data as { worktreeId?: string; worktreeName?: string; output?: string } | undefined;
          startTransition(() => {
            if (data?.worktreeId) {
              removePrCreating(data.worktreeId);
            }
            // Immediately refetch PR status + CI checks
            bumpActivityRefresh();
          });
          // Side effects stay outside startTransition
          const output = data?.output ?? '';
          const urlMatch = output.match(/https:\/\/github\.com\/[^\s)]+\/pull\/\d+/);
          const prUrl = urlMatch ? urlMatch[0] : null;
          const name = data?.worktreeName ?? 'unknown';
          logToJournal(`[${name}] PR created${prUrl ? `: ${prUrl}` : ''}`);
          showSystemNotification(
            'PR Created',
            prUrl ? `${name}: ${prUrl}` : `${name}: PR created successfully`,
            'success',
          );
          return;
        }

        if (eventType === 'pr:error') {
          const data = parsed.data as { worktreeId?: string; worktreeName?: string; error?: string } | undefined;
          startTransition(() => {
            if (data?.worktreeId) {
              removePrCreating(data.worktreeId);
            }
          });
          const name = data?.worktreeName ?? 'unknown';
          const error = data?.error ?? 'Unknown error';
          showSystemNotification(
            'PR Failed',
            `${name}: ${error}`,
            'warning',
          );
          return;
        }

        // AI commit message generation events
        if (eventType === 'commit-msg:ready') {
          const data = parsed.data as { worktreeId?: string; message?: string } | undefined;
          if (data?.worktreeId) {
            startTransition(() => {
              removeCommitGen(data.worktreeId!);
              store.set(aiCommitFamily(data.worktreeId!), {
                phase: 'ready',
                message: data.message ?? '',
                error: null,
              });
            });
          }
          return;
        }

        if (eventType === 'commit-msg:error') {
          const data = parsed.data as { worktreeId?: string; error?: string } | undefined;
          if (data?.worktreeId) {
            startTransition(() => {
              removeCommitGen(data.worktreeId!);
              store.set(aiCommitFamily(data.worktreeId!), {
                phase: 'error',
                message: null,
                error: data.error ?? 'Generation failed',
              });
            });
          }
          return;
        }

        // Dispatch graph events directly through the write-only reducer atom
        if (eventType === 'graph' && parsed.data) {
          startTransition(() => {
            store.set(dispatchGraphEventAtom, parsed.data as Record<string, unknown>);
          });
          return;
        }

        // Forward server events — RunningServersCard subscribes via DOM listener
        if (eventType === 'server:start' || eventType === 'server:stop') {
          window.dispatchEvent(new CustomEvent('phantom:server-change', {
            detail: { type: eventType, data: parsed.data },
          }));
          return;
        }

        // Forward worktree setup events — WorktreeHome subscribes via DOM listener
        if (eventType === 'worktree:setup-start' || eventType === 'worktree:setup-done') {
          window.dispatchEvent(new CustomEvent('phantom:worktree-setup', {
            detail: { type: eventType, data: parsed.data },
          }));
          return;
        }
      };

      source.onerror = () => {
        source?.close();
        source = null;
        setSseConnection('disconnected');

        // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
        const delay = Math.min(1000 * Math.pow(2, retryCount), 30_000);
        retryCount++;
        retryTimer = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      unmounted = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, [
    refreshAchievements,
    dispatchNotification,
    pushFeedEvent,
    pushFeedEvents,
    setSseConnection,
    removePrCreating,
    bumpActivityRefresh,
    removeCommitGen,
    store,
  ]);
};
