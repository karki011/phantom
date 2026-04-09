/**
 * ChatPane — Built-in Claude chat interface with conversation sidebar
 * @author Subash Karki
 */
import {
  ActionIcon,
  Group,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from '@mantine/core';
import { useAtomValue } from 'jotai';
import { Bot, MessageSquare, Plus, Send, Trash2, User } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import { activeWorkspaceAtom } from '../../atoms/workspaces';
import { useChat, type ChatMessage, type ChatConversation } from '../../hooks/useChat';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MODEL_OPTIONS = [
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
  { value: 'haiku', label: 'Haiku' },
];

/* ------------------------------------------------------------------ */
/*  Inline keyframes (injected once)                                   */
/* ------------------------------------------------------------------ */

const CURSOR_KEYFRAMES = `
@keyframes blink-cursor {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}
`;

let keyframesInjected = false;
function injectKeyframes() {
  if (keyframesInjected) return;
  const style = document.createElement('style');
  style.textContent = CURSOR_KEYFRAMES;
  document.head.appendChild(style);
  keyframesInjected = true;
}

/* ------------------------------------------------------------------ */
/*  Markdown components                                                */
/* ------------------------------------------------------------------ */

const markdownComponents = {
  code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
    const isBlock = className?.includes('language-');
    return isBlock ? (
      <pre
        style={{
          backgroundColor: 'var(--phantom-surface-elevated)',
          padding: '12px',
          borderRadius: 6,
          overflow: 'auto',
          fontSize: '0.75rem',
          fontFamily: 'JetBrains Mono, monospace',
        }}
      >
        <code>{children}</code>
      </pre>
    ) : (
      <code
        style={{
          backgroundColor: 'var(--phantom-surface-elevated)',
          padding: '2px 6px',
          borderRadius: 4,
          fontSize: '0.8em',
          fontFamily: 'JetBrains Mono, monospace',
        }}
      >
        {children}
      </code>
    );
  },
};

/* ------------------------------------------------------------------ */
/*  MessageBubble                                                      */
/* ------------------------------------------------------------------ */

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <Group
      align="flex-start"
      justify={isUser ? 'flex-end' : 'flex-start'}
      gap="sm"
      wrap="nowrap"
      style={{ width: '100%' }}
    >
      {!isUser && (
        <Bot
          size={18}
          style={{ color: 'var(--phantom-accent-glow)', flexShrink: 0, marginTop: 4 }}
        />
      )}

      <Paper
        style={{
          maxWidth: '80%',
          padding: '10px 14px',
          borderRadius: 10,
          backgroundColor: isUser
            ? 'var(--phantom-surface-elevated)'
            : 'var(--phantom-surface-card)',
          borderLeft: isUser ? '3px solid var(--phantom-accent-glow)' : undefined,
          color: 'var(--phantom-text-primary)',
          fontSize: isUser ? '0.8rem' : '0.82rem',
          lineHeight: 1.5,
          wordBreak: 'break-word',
        }}
      >
        {isUser ? (
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {message.content}
          </Text>
        ) : (
          <>
            <Markdown components={markdownComponents}>{message.content}</Markdown>
            {message.streaming && (
              <span
                style={{
                  animation: 'blink-cursor 1s step-end infinite',
                  color: 'var(--phantom-accent-glow)',
                  fontWeight: 700,
                  marginLeft: 2,
                }}
              >
                ▌
              </span>
            )}
          </>
        )}
      </Paper>

      {isUser && (
        <User
          size={18}
          style={{ color: 'var(--phantom-text-muted)', flexShrink: 0, marginTop: 4 }}
        />
      )}
    </Group>
  );
}

/* ------------------------------------------------------------------ */
/*  ConversationItem                                                   */
/* ------------------------------------------------------------------ */

function ConversationItem({
  conv,
  active,
  onSelect,
  onDelete,
}: {
  conv: ChatConversation;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <Group
      px="xs"
      py={6}
      gap={4}
      wrap="nowrap"
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        cursor: 'pointer',
        backgroundColor: active
          ? 'var(--phantom-surface-elevated)'
          : hovered
            ? 'var(--phantom-surface-card)'
            : 'transparent',
        borderLeft: active
          ? '2px solid var(--phantom-accent-glow)'
          : '2px solid transparent',
        transition: 'background-color 0.1s ease',
      }}
    >
      <Text
        fz="0.75rem"
        c="var(--phantom-text-primary)"
        lineClamp={1}
        style={{ flex: 1, minWidth: 0 }}
      >
        {conv.title}
      </Text>
      {hovered && (
        <ActionIcon
          size="xs"
          variant="subtle"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={{ color: 'var(--phantom-text-muted)', flexShrink: 0 }}
        >
          <Trash2 size={10} />
        </ActionIcon>
      )}
    </Group>
  );
}

/* ------------------------------------------------------------------ */
/*  EmptyState                                                         */
/* ------------------------------------------------------------------ */

function EmptyState() {
  return (
    <Stack align="center" justify="center" gap="md" style={{ flex: 1, opacity: 0.5 }}>
      <Bot size={48} style={{ color: 'var(--phantom-accent-glow)' }} />
      <Text size="lg" style={{ color: 'var(--phantom-text-muted)' }}>
        Ask Claude anything...
      </Text>
    </Stack>
  );
}

/* ------------------------------------------------------------------ */
/*  ChatPane                                                           */
/* ------------------------------------------------------------------ */

interface ChatPaneProps {
  paneId: string;
  cwd?: string;
}

export const ChatPane = ({ paneId: _paneId, cwd }: ChatPaneProps) => {
  const workspace = useAtomValue(activeWorkspaceAtom);

  // Build project context string for the LLM prompt
  const projectContext = useMemo(() => {
    if (!workspace) return undefined;
    const parts = [`Workspace: ${workspace.name}`, `Branch: ${workspace.branch}`];
    if (workspace.worktreePath) parts.push(`Path: ${workspace.worktreePath}`);
    return parts.join(', ');
  }, [workspace]);

  const {
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
  } = useChat(cwd, workspace?.id ?? null, projectContext);

  // Find active conversation for title display
  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const [input, setInput] = useState('');
  const viewportRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Inject keyframes on mount
  useEffect(() => {
    injectKeyframes();
  }, []);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  const handleSend = useCallback(() => {
    if (!input.trim() || sending) return;
    const text = input;
    setInput('');
    send(text);
    inputRef.current?.focus();
  }, [input, sending, send]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* ---- Left: Conversation List ---- */}
      <div
        style={{
          width: 200,
          borderRight: '1px solid var(--phantom-border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--phantom-surface-bg)',
          flexShrink: 0,
        }}
      >
        {/* New Chat button */}
        <Group px="xs" py="xs" style={{ flexShrink: 0 }}>
          <ActionIcon
            variant="light"
            size="sm"
            onClick={newChat}
            style={{ color: 'var(--phantom-accent-glow)' }}
          >
            <Plus size={14} />
          </ActionIcon>
          <Text fz="0.7rem" fw={600} c="var(--phantom-text-muted)" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Conversations
          </Text>
        </Group>

        {/* Conversation list */}
        <ScrollArea style={{ flex: 1, minHeight: 0 }}>
          {conversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conv={conv}
              active={conv.id === activeConversationId}
              onSelect={() => selectConversation(conv.id)}
              onDelete={() => deleteConversation(conv.id)}
            />
          ))}
          {conversations.length === 0 && (
            <Text fz="0.7rem" c="var(--phantom-text-muted)" ta="center" py="lg" px="xs">
              No conversations yet
            </Text>
          )}
        </ScrollArea>
      </div>

      {/* ---- Right: Chat Area ---- */}
      <Stack
        gap={0}
        style={{
          flex: 1,
          height: '100%',
          backgroundColor: 'var(--phantom-surface-bg)',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        {/* ---- Header ---- */}
        <Group
          justify="space-between"
          px="md"
          py="xs"
          style={{
            borderBottom: '1px solid var(--phantom-border-subtle)',
            flexShrink: 0,
          }}
        >
          <Group gap="xs">
            <MessageSquare size={16} style={{ color: 'var(--phantom-accent-glow)' }} />
            <Text fw={600} size="sm" style={{ color: 'var(--phantom-text-primary)' }} lineClamp={1}>
              {activeConversation?.title ?? 'Chat'}
            </Text>
            {workspace && (
              <Text size="xs" style={{ color: 'var(--phantom-text-muted)' }}>
                — {workspace.name}
              </Text>
            )}
          </Group>

          <Group gap="xs">
            <Select
              size="xs"
              data={MODEL_OPTIONS}
              value={model}
              onChange={(v) => v && setModel(v)}
              styles={{
                input: {
                  backgroundColor: 'var(--phantom-surface-card)',
                  borderColor: 'var(--phantom-border-subtle)',
                  color: 'var(--phantom-text-primary)',
                  fontSize: '0.78rem',
                  minHeight: 28,
                  width: 100,
                },
              }}
              allowDeselect={false}
            />
            {activeConversationId && (
              <Tooltip label="Delete conversation" position="bottom">
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={() => deleteConversation(activeConversationId)}
                  style={{ color: 'var(--phantom-text-muted)' }}
                >
                  <Trash2 size={14} />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Group>

        {/* ---- Messages ---- */}
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          <ScrollArea
            viewportRef={viewportRef}
            style={{ flex: 1, minHeight: 0 }}
            px="md"
            py="sm"
          >
            <Stack gap="md">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
            </Stack>
          </ScrollArea>
        )}

        {/* ---- Input ---- */}
        <Group
          gap="xs"
          px="md"
          py="sm"
          align="flex-end"
          style={{
            borderTop: '1px solid var(--phantom-border-subtle)',
            flexShrink: 0,
            backgroundColor: 'var(--phantom-surface-bg)',
          }}
        >
          <Textarea
            ref={inputRef}
            placeholder="Ask Claude..."
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            disabled={sending}
            autosize
            minRows={1}
            maxRows={6}
            style={{ flex: 1 }}
            styles={{
              input: {
                backgroundColor: 'var(--phantom-surface-card)',
                borderColor: 'var(--phantom-border-subtle)',
                color: 'var(--phantom-text-primary)',
                fontSize: '0.88rem',
                fontFamily: 'inherit',
                '&::placeholder': {
                  color: 'var(--phantom-text-muted)',
                },
              },
            }}
          />
          <Tooltip label="Send message" position="top">
            <ActionIcon
              variant="filled"
              size="lg"
              onClick={handleSend}
              disabled={!input.trim() || sending}
              style={{
                backgroundColor: input.trim() && !sending
                  ? 'var(--phantom-accent-glow)'
                  : 'var(--phantom-surface-card)',
                color: input.trim() && !sending
                  ? 'var(--phantom-surface-bg)'
                  : 'var(--phantom-text-muted)',
                transition: 'all 0.15s ease',
              }}
            >
              <Send size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Stack>
    </div>
  );
};

export default ChatPane;
