/**
 * useSessionMessages Hook
 * Polls session JSONL messages for live viewing with incremental updates
 * @author Subash Karki
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchApi } from '../lib/api';

export interface SessionMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolUse?: { name: string; summary?: string }[];
}

interface UseSessionMessagesReturn {
  messages: SessionMessage[];
  loading: boolean;
  error: boolean;
}

export const useSessionMessages = (
  sessionId: string | null,
  isActive: boolean,
): UseSessionMessagesReturn => {
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const lastTimestamp = useRef<string>('');

  const fetchMessages = useCallback(async (signal?: AbortSignal) => {
    if (!sessionId) return;

    try {
      const after = lastTimestamp.current;
      const url = after
        ? `/api/sessions/${sessionId}/messages?after=${encodeURIComponent(after)}`
        : `/api/sessions/${sessionId}/messages?limit=200`;

      const data = await fetchApi<{ messages: SessionMessage[] }>(url, { signal });

      if (data.messages.length > 0) {
        if (after) {
          // Incremental: append new messages
          setMessages((prev) => [...prev, ...data.messages]);
        } else {
          // Initial load
          setMessages(data.messages);
        }
        // Track last timestamp for next poll
        const last = data.messages[data.messages.length - 1];
        if (last?.timestamp) lastTimestamp.current = last.timestamp;
      }

      setError(false);
    } catch (err) {
      if (signal?.aborted) return;
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Initial fetch
  useEffect(() => {
    const controller = new AbortController();
    setMessages([]);
    setLoading(true);
    lastTimestamp.current = '';
    fetchMessages(controller.signal);
    return () => controller.abort();
  }, [sessionId, fetchMessages]);

  // Poll every 3s while session is active
  useEffect(() => {
    if (!isActive || !sessionId) return;
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [isActive, sessionId, fetchMessages]);

  return { messages, loading, error };
};
