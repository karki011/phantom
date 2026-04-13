/**
 * useSystemEvents Hook
 * Connects to SSE endpoint and dispatches updates to Jotai atoms
 *
 * @author Subash Karki
 */
import { useSetAtom, useStore } from 'jotai';
import { useEffect } from 'react';

import { aiCommitFamily, removeCommitGenAtom } from '../atoms/aiCommit';
import { removePrCreatingAtom } from '../atoms/activity';
import { refreshAchievementsAtom } from '../atoms/achievements';
import { refreshHunterAtom } from '../atoms/hunter';
import { pushFeedEventAtom } from '../atoms/liveFeed';
import {
  refreshActiveSessionsAtom,
  refreshRecentSessionsAtom,
} from '../atoms/sessions';
import { sseConnectionAtom, systemNotificationsAtom } from '../atoms/system';
import { showSystemNotification } from '../components/notifications/SystemToast';
import { appendJournalLog } from '../lib/api';

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
  const refreshHunter = useSetAtom(refreshHunterAtom);
  const refreshActiveSessions = useSetAtom(refreshActiveSessionsAtom);
  const refreshRecentSessions = useSetAtom(refreshRecentSessionsAtom);
  const refreshAchievements = useSetAtom(refreshAchievementsAtom);
  const dispatchNotification = useSetAtom(systemNotificationsAtom);
  const pushFeedEvent = useSetAtom(pushFeedEventAtom);
  const setSseConnection = useSetAtom(sseConnectionAtom);
  const removePrCreating = useSetAtom(removePrCreatingAtom);
  const removeCommitGen = useSetAtom(removeCommitGenAtom);
  const store = useStore();

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
          refreshActiveSessions();
          refreshRecentSessions();
          refreshHunter();

          const sessionData = parsed.data as Record<string, unknown> | undefined;
          if (eventType === 'session:new') {
            const sessionName = String(sessionData?.repo ?? sessionData?.name ?? 'unknown');
            logToJournal(`[${sessionName}] Session started`);
            pushFeedEvent({
              id: `feed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              type: eventType,
              category: 'session',
              message: `Session started: ${sessionName}`,
              timestamp: Date.now(),
            });
          } else if (eventType === 'session:end') {
            const sessionId = String(sessionData?.id ?? '').slice(0, 8);
            const tokens = Number(sessionData?.inputTokens ?? 0) + Number(sessionData?.outputTokens ?? 0);
            const costMicros = Number(sessionData?.estimatedCostMicros ?? 0);
            const costStr = costMicros > 0 ? `, $${(costMicros / 1_000_000).toFixed(2)}` : '';
            const tokenStr = tokens > 0 ? `, ${tokens > 1000 ? `${(tokens / 1000).toFixed(0)}K` : tokens} tokens` : '';
            logToJournal(`Session ended (${sessionId})${tokenStr}${costStr}`);
            pushFeedEvent({
              id: `feed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              type: eventType,
              category: 'session',
              message: `Session ended: ${sessionId}`,
              timestamp: Date.now(),
            });
          }
          return;
        }

        // Task events: task:new, task:update
        if (eventType.startsWith('task:')) {
          refreshActiveSessions();
          refreshRecentSessions();
          refreshHunter();

          const taskData = parsed.data as Record<string, unknown> | undefined;
          const taskSubject = String(taskData?.subject ?? 'untitled');
          if (eventType === 'task:new') {
            pushFeedEvent({
              id: `feed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              type: eventType,
              category: 'task',
              message: `Task created: ${taskSubject}`,
              timestamp: Date.now(),
            });
          } else if (eventType === 'task:update' && taskData?.status === 'completed') {
            pushFeedEvent({
              id: `feed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              type: eventType,
              category: 'task',
              message: `Task completed: ${taskSubject}`,
              timestamp: Date.now(),
            });
          }
          return;
        }

        // Achievement events
        if (eventType === 'achievement:unlock') {
          refreshAchievements();
          refreshHunter();
          const achievementData = parsed.data as Record<string, unknown> | undefined;
          const achievementName = String(achievementData?.name ?? 'A new achievement!');
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
            id: `feed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: eventType,
            category: 'achievement',
            message: `Achievement unlocked: ${achievementName}`,
            timestamp: Date.now(),
          });
          return;
        }

        // Activity events from JSONL poller
        if (eventType === 'activity') {
          const activityData = parsed.data as { events?: { id: string; sessionName: string; category: string; icon: string; message: string; detail?: string; timestamp: string }[] } | undefined;
          if (activityData?.events) {
            for (const evt of activityData.events) {
              const feedCategory = evt.category === 'user' ? 'user' : evt.category === 'response' ? 'response' : evt.category;
              const feedType = evt.category === 'git'
                ? `git:${evt.icon}`
                : evt.category === 'user'
                  ? 'user:message'
                  : evt.category === 'response'
                    ? 'response'
                    : `tool:${evt.icon}`;
              pushFeedEvent({
                id: evt.id,
                type: feedType,
                category: feedCategory,
                message: evt.sessionName !== '' ? `[${evt.sessionName}] ${evt.message}` : evt.message,
                detail: evt.detail,
                timestamp: new Date(evt.timestamp).getTime() || Date.now(),
              });
            }
          }
          return;
        }

        // Level-up events
        if (eventType === 'level-up') {
          refreshHunter();
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
        }

        // PR creation events (background Claude)
        if (eventType === 'pr:success') {
          const data = parsed.data as { worktreeId?: string; worktreeName?: string; output?: string } | undefined;
          if (data?.worktreeId) {
            removePrCreating(data.worktreeId);
          }
          // Try to extract PR URL from Claude's output (usually the last URL in output)
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
          if (data?.worktreeId) {
            removePrCreating(data.worktreeId);
          }
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
            removeCommitGen(data.worktreeId);
            store.set(aiCommitFamily(data.worktreeId), {
              phase: 'ready',
              message: data.message ?? '',
              error: null,
            });
          }
          return;
        }

        if (eventType === 'commit-msg:error') {
          const data = parsed.data as { worktreeId?: string; error?: string } | undefined;
          if (data?.worktreeId) {
            removeCommitGen(data.worktreeId);
            store.set(aiCommitFamily(data.worktreeId), {
              phase: 'error',
              message: null,
              error: data.error ?? 'Generation failed',
            });
          }
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
    refreshHunter,
    refreshActiveSessions,
    refreshRecentSessions,
    refreshAchievements,
    dispatchNotification,
    pushFeedEvent,
    setSseConnection,
    removePrCreating,
    removeCommitGen,
    store,
  ]);
};
