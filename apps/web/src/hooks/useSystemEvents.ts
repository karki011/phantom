/**
 * useSystemEvents Hook
 * Connects to SSE endpoint and dispatches updates to Jotai atoms
 *
 * @author Subash Karki
 */
import { useSetAtom } from 'jotai';
import { useEffect } from 'react';

import { refreshAchievementsAtom } from '../atoms/achievements';
import { refreshHunterAtom } from '../atoms/hunter';
import { pushFeedEventAtom } from '../atoms/liveFeed';
import {
  refreshActiveSessionsAtom,
  refreshRecentSessionsAtom,
} from '../atoms/sessions';
import { systemNotificationsAtom } from '../atoms/system';

const SSE_URL = '/events';

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

  useEffect(() => {
    const source = new EventSource(SSE_URL);

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
          pushFeedEvent({
            id: `feed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: eventType,
            category: 'session',
            message: `Session started: ${sessionName}`,
            timestamp: Date.now(),
          });
        } else if (eventType === 'session:end') {
          const sessionId = String(sessionData?.id ?? '').slice(0, 8);
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
    };

    source.onerror = () => {
      // EventSource auto-reconnects; no manual intervention needed
    };

    return () => {
      source.close();
    };
  }, [
    refreshHunter,
    refreshActiveSessions,
    refreshRecentSessions,
    refreshAchievements,
    dispatchNotification,
    pushFeedEvent,
  ]);
};
