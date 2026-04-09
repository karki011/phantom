/**
 * useChat Hook — manages conversation state with Claude via /api/chat
 * Persists chat history to the DB and ties conversations to workspaces.
 * Supports multiple conversations with list, create, switch, and delete.
 * @author Subash Karki
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  model?: string;
  streaming?: boolean;
}

export interface ChatConversation {
  id: string;
  workspaceId: string | null;
  title: string;
  model: string | null;
  createdAt: number;
  updatedAt: number;
}

interface UseChatReturn {
  messages: ChatMessage[];
  conversations: ChatConversation[];
  activeConversationId: string | null;
  sending: boolean;
  send: (text: string) => Promise<void>;
  clear: () => void;
  newChat: () => Promise<void>;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => Promise<void>;
  model: string;
  setModel: (m: string) => void;
}

const uid = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const useChat = (cwd?: string, workspaceId?: string | null, projectContext?: string): UseChatReturn => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [model, setModel] = useState('sonnet');
  const abortRef = useRef<AbortController | null>(null);

  // Load conversations list on mount / workspace change
  useEffect(() => {
    if (workspaceId === undefined) return; // Wait for workspace info

    const url = workspaceId
      ? `/api/chat/conversations?workspaceId=${workspaceId}`
      : '/api/chat/conversations';

    fetch(url)
      .then((r) => r.json())
      .then((convs: ChatConversation[]) => {
        setConversations(convs);
        if (convs.length > 0) {
          setActiveConversationId(convs[0].id); // Most recent
        } else {
          setActiveConversationId(null);
          setMessages([]);
        }
      })
      .catch(() => {});
  }, [workspaceId]);

  // Load messages when activeConversationId changes
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    fetch(`/api/chat/history?conversationId=${activeConversationId}&limit=100`)
      .then((r) => r.json())
      .then((rows: { id: string; role: string; content: string; model?: string; createdAt: number }[]) => {
        setMessages(rows.map((r) => ({
          id: r.id,
          role: r.role as 'user' | 'assistant',
          content: r.content,
          timestamp: r.createdAt,
          model: r.model ?? undefined,
        })));
      })
      .catch(() => {});
  }, [activeConversationId]);

  /** Create a new conversation and switch to it */
  const newChat = useCallback(async () => {
    try {
      const resp = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, model }),
      });
      const conv = await resp.json() as ChatConversation;
      setConversations((prev) => [conv, ...prev]);
      setActiveConversationId(conv.id);
      setMessages([]);
    } catch { /* ignore */ }
  }, [workspaceId, model]);

  /** Select an existing conversation */
  const selectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
  }, []);

  /** Helper: ensure an active conversation exists, create one if needed */
  const ensureConversation = useCallback(async (): Promise<string> => {
    if (activeConversationId) return activeConversationId;

    const resp = await fetch('/api/chat/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId, model }),
    });
    const conv = await resp.json() as ChatConversation;
    setConversations((prev) => [conv, ...prev]);
    setActiveConversationId(conv.id);
    return conv.id;
  }, [activeConversationId, workspaceId, model]);

  const send = useCallback(async (text: string) => {
    if (!text.trim() || sending) return;

    // Ensure we have a conversation to attach messages to
    const convId = await ensureConversation();

    const userMsg: ChatMessage = {
      id: uid(),
      role: 'user',
      content: text.trim(),
      timestamp: Date.now(),
    };

    const assistantMsg: ChatMessage = {
      id: uid(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      model,
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setSending(true);

    // Build context from previous messages (last 20 for token efficiency)
    const context = [...messages, userMsg]
      .filter((m) => m.content.trim())
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      abortRef.current = new AbortController();

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text.trim(),
          model,
          context: context.slice(0, -1),
          cwd,
          projectContext,
        }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error((err as { error?: string }).error ?? `Chat failed: ${response.status}`);
      }

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let ndjsonBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        ndjsonBuffer += decoder.decode(value, { stream: true });
        const lines = ndjsonBuffer.split('\n');
        ndjsonBuffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === 'delta') {
              accumulated += event.content;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: accumulated, streaming: true }
                    : m,
                ),
              );
            } else if (event.type === 'done') {
              // Use the full content from done event if we missed deltas
              const finalContent = accumulated || event.content || '';
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: finalContent, streaming: false }
                    : m,
                ),
              );
              accumulated = finalContent;
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          } catch (parseErr) {
            if ((parseErr as Error).message && !(parseErr as Error).message.includes('JSON')) {
              throw parseErr; // Re-throw non-parse errors
            }
          }
        }
      }

      // Ensure streaming is cleared
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id ? { ...m, streaming: false } : m,
        ),
      );

      // Persist both messages to DB (with conversationId)
      fetch('/api/chat/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { id: userMsg.id, conversationId: convId, workspaceId, role: 'user', content: text.trim(), createdAt: userMsg.timestamp },
            { id: assistantMsg.id, conversationId: convId, workspaceId, role: 'assistant', content: accumulated, model, createdAt: Date.now() },
          ],
        }),
      })
        .then(() => {
          // Update conversation title in local state from first user message
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id === convId && c.title === 'New Chat') {
                const autoTitle = text.trim().slice(0, 60) + (text.trim().length > 60 ? '...' : '');
                return { ...c, title: autoTitle, updatedAt: Date.now() };
              }
              if (c.id === convId) {
                return { ...c, updatedAt: Date.now() };
              }
              return c;
            }),
          );
        })
        .catch(() => {});
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: `Error: ${(err as Error).message}`, streaming: false }
              : m,
          ),
        );
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [messages, sending, model, cwd, workspaceId, projectContext, ensureConversation]);

  /** Delete a conversation and its messages */
  const deleteConversation = useCallback(async (id: string) => {
    await fetch(`/api/chat/conversations/${id}`, { method: 'DELETE' }).catch(() => {});
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversationId === id) {
      setActiveConversationId(null);
      setMessages([]);
    }
  }, [activeConversationId]);

  /** Legacy clear — clears all history for the workspace */
  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setSending(false);

    // Clear DB history
    const url = workspaceId
      ? `/api/chat/history?workspaceId=${workspaceId}`
      : '/api/chat/history';
    fetch(url, { method: 'DELETE' }).catch(() => {});
    setConversations([]);
    setActiveConversationId(null);
  }, [workspaceId]);

  return {
    messages,
    conversations,
    activeConversationId,
    sending,
    send,
    clear,
    newChat,
    selectConversation,
    deleteConversation,
    model,
    setModel,
  };
};
