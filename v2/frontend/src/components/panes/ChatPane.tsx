// PhantomOS v2 — Built-in Claude Chat Pane
// Full conversation UI with sidebar, streaming, markdown, code blocks,
// thinking/tool-use display, and model selection.
// Author: Subash Karki

import {
  createSignal,
  createEffect,
  onMount,
  onCleanup,
  For,
  Show,
  batch,
  type JSX,
} from 'solid-js';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  MessageSquare,
  PanelLeftClose,
  PanelLeft,
  Plus,
  Send,
  Trash2,
  User,
  Brain,
  Wrench,
  Loader,
} from 'lucide-solid';
import { onWailsEvent } from '@/core/events';
import {
  getConversations,
  createConversation,
  deleteConversation,
  sendChatMessage,
  getChatHistory,
} from '@/core/bindings/chat';
import type { Conversation, ChatMessage, StreamEvent } from '@/core/types';
import * as styles from '@/styles/chat.css';

// ── Constants ───────────────────────────────────────────────────────────────

const MODELS = [
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
  { value: 'haiku', label: 'Haiku' },
];

const uid = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ── Markdown rendering (lightweight — no external lib needed) ───────────────

/** Parse a message string into JSX with code blocks, inline code, bold, links */
const renderMarkdown = (text: string): JSX.Element => {
  const blocks: JSX.Element[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push(<CodeBlock language={lang} code={codeLines.join('\n')} />);
      continue;
    }

    // Regular paragraph line
    blocks.push(<p style={{ margin: '0 0 4px 0' }}>{renderInline(line)}</p>);
    i++;
  }

  return <div class={styles.markdownProse}>{blocks}</div>;
};

/** Render inline markdown: **bold**, `code`, [links](url) */
const renderInline = (text: string): JSX.Element => {
  const parts: JSX.Element[] = [];
  // Match bold, inline code, and links
  const regex = /(\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<>{text.slice(lastIndex, match.index)}</>);
    }

    if (match[2]) {
      // Bold
      parts.push(<strong>{match[2]}</strong>);
    } else if (match[3]) {
      // Inline code
      parts.push(<code class={styles.inlineCode}>{match[3]}</code>);
    } else if (match[4] && match[5]) {
      // Link
      parts.push(
        <a
          href={match[5]}
          onClick={(e) => { e.preventDefault(); window.open(match![5], '_blank'); }}
          style={{ color: 'var(--accent, #56CCFF)', 'text-decoration': 'none' }}
        >
          {match[4]}
        </a>,
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(<>{text.slice(lastIndex)}</>);
  }

  return <>{parts}</>;
};

// ── Code Block Component ────────────────────────────────────────────────────

function CodeBlock(props: { language: string; code: string }) {
  const [copied, setCopied] = createSignal(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(props.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div class={styles.codeBlock}>
      <div class={styles.codeBlockHeader}>
        <span>{props.language || 'text'}</span>
        <button type="button" class={styles.copyButton} onClick={handleCopy}>
          <Show when={copied()} fallback={<><Copy size={10} /> Copy</>}>
            <Check size={10} /> Copied
          </Show>
        </button>
      </div>
      <pre class={styles.codeBlockContent}><code>{props.code}</code></pre>
    </div>
  );
}

// ── Thinking Block Component ────────────────────────────────────────────────

function ThinkingBlock(props: { content: string }) {
  const [expanded, setExpanded] = createSignal(false);

  return (
    <div class={styles.thinkingBlock} onClick={() => setExpanded(!expanded())}>
      <div class={styles.thinkingHeader}>
        <Brain size={12} />
        <Show when={expanded()} fallback={<ChevronRight size={12} />}>
          <ChevronDown size={12} />
        </Show>
        <span>Thinking</span>
      </div>
      <Show when={expanded()}>
        <div class={styles.thinkingContent}>{props.content}</div>
      </Show>
    </div>
  );
}

// ── Tool Use Block Component ────────────────────────────────────────────────

function ToolUseBlock(props: { name: string; input: string }) {
  const [expanded, setExpanded] = createSignal(false);

  return (
    <div class={styles.toolUseBlock} onClick={() => setExpanded(!expanded())}>
      <div class={styles.toolUseHeader}>
        <Wrench size={12} />
        <Show when={expanded()} fallback={<ChevronRight size={12} />}>
          <ChevronDown size={12} />
        </Show>
        <span>{props.name}</span>
      </div>
      <Show when={expanded()}>
        <div class={styles.toolUseContent}>{props.input}</div>
      </Show>
    </div>
  );
}

// ── Message Bubble ──────────────────────────────────────────────────────────

interface DisplayMessage extends ChatMessage {
  streaming?: boolean;
  thinking?: string;
  tool_uses?: Array<{ name: string; input: string }>;
}

function MessageBubble(props: { message: DisplayMessage }) {
  const isUser = () => props.message.role === 'user';

  return (
    <div class={styles.messageRow} data-role={props.message.role}>
      <div class={styles.messageAvatar} data-role={props.message.role}>
        <Show when={isUser()} fallback={<Bot size={14} />}>
          <User size={14} />
        </Show>
      </div>
      <div class={styles.messageBubble} data-role={props.message.role}>
        {/* Thinking blocks */}
        <Show when={props.message.thinking}>
          <ThinkingBlock content={props.message.thinking!} />
        </Show>

        {/* Tool use blocks */}
        <Show when={props.message.tool_uses && props.message.tool_uses.length > 0}>
          <For each={props.message.tool_uses}>
            {(tool) => <ToolUseBlock name={tool.name} input={tool.input} />}
          </For>
        </Show>

        {/* Message content */}
        <Show when={props.message.content}>
          {renderMarkdown(props.message.content)}
        </Show>

        {/* Streaming cursor */}
        <Show when={props.message.streaming}>
          <span class={styles.streamingCursor} />
        </Show>
      </div>
    </div>
  );
}

// ── Main ChatPane ───────────────────────────────────────────────────────────

interface ChatPaneProps {
  paneId?: string;
  workspaceId?: string;
}

export default function ChatPane(props: ChatPaneProps) {
  // ── State ───────────────────────────────────────────────────────────────
  const [conversations, setConversations] = createSignal<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = createSignal<string | null>(null);
  const [messages, setMessages] = createSignal<DisplayMessage[]>([]);
  const [input, setInput] = createSignal('');
  const [model, setModel] = createSignal('sonnet');
  const [sending, setSending] = createSignal(false);
  const [sidebarOpen, setSidebarOpen] = createSignal(true);
  const [loading, setLoading] = createSignal(false);

  let messagesEndRef: HTMLDivElement | undefined;
  let textareaRef: HTMLTextAreaElement | undefined;

  const workspaceId = () => props.workspaceId ?? '';

  // ── Auto-scroll ─────────────────────────────────────────────────────────

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      messagesEndRef?.scrollIntoView({ behavior: 'smooth' });
    });
  };

  // ── Load conversations on mount ─────────────────────────────────────────

  onMount(async () => {
    const convs = await getConversations(workspaceId());
    setConversations(convs);
    if (convs.length > 0) {
      setActiveConvId(convs[0].id);
    }
  });

  // ── Load messages when active conversation changes ──────────────────────

  createEffect(async () => {
    const convId = activeConvId();
    if (!convId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    const history = await getChatHistory(convId);
    setMessages(history.map((m) => ({ ...m, streaming: false })));
    setLoading(false);
    scrollToBottom();
  });

  // ── Stream events from Wails ────────────────────────────────────────────

  onWailsEvent<StreamEvent>('chat:stream', (event) => {
    const convId = activeConvId();
    if (!convId) return;

    if (event.type === 'delta') {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.streaming) {
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + (event.content ?? '') },
          ];
        }
        // New assistant message
        return [
          ...prev,
          {
            id: uid(),
            conversation_id: convId,
            role: 'assistant',
            content: event.content ?? '',
            model: model(),
            created_at: Date.now(),
            streaming: true,
          },
        ];
      });
      scrollToBottom();
    }

    if (event.type === 'thinking') {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.streaming) {
          return [
            ...prev.slice(0, -1),
            { ...last, thinking: (last.thinking ?? '') + (event.content ?? '') },
          ];
        }
        return [
          ...prev,
          {
            id: uid(),
            conversation_id: convId,
            role: 'assistant',
            content: '',
            model: model(),
            created_at: Date.now(),
            streaming: true,
            thinking: event.content ?? '',
          },
        ];
      });
    }

    if (event.type === 'tool_use') {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'assistant' && last.streaming) {
          const tools = last.tool_uses ?? [];
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              tool_uses: [...tools, { name: event.tool_name ?? 'tool', input: event.tool_input ?? '' }],
            },
          ];
        }
        return prev;
      });
    }

    if (event.type === 'done') {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.streaming) {
          return [...prev.slice(0, -1), { ...last, streaming: false }];
        }
        return prev;
      });
      setSending(false);
      scrollToBottom();
    }

    if (event.type === 'error') {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.streaming) {
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + `\n\n**Error:** ${event.content ?? 'Unknown error'}`, streaming: false },
          ];
        }
        return prev;
      });
      setSending(false);
    }
  });

  // ── Actions ─────────────────────────────────────────────────────────────

  const handleSend = async () => {
    const text = input().trim();
    const convId = activeConvId();
    if (!text || !convId || sending()) return;

    // Add user message immediately
    const userMsg: DisplayMessage = {
      id: uid(),
      conversation_id: convId,
      role: 'user',
      content: text,
      model: model(),
      created_at: Date.now(),
      streaming: false,
    };

    batch(() => {
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setSending(true);
    });

    scrollToBottom();

    // Auto-resize textarea back
    if (textareaRef) textareaRef.style.height = 'auto';

    // Send via binding — backend will emit stream events
    const ok = await sendChatMessage(convId, text, model());
    if (!ok) {
      setSending(false);
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          conversation_id: convId,
          role: 'assistant',
          content: '**Error:** Failed to send message. Check your provider settings.',
          model: model(),
          created_at: Date.now(),
          streaming: false,
        },
      ]);
    }
  };

  const handleNewConversation = async () => {
    const conv = await createConversation(workspaceId(), 'New Chat', model());
    if (conv) {
      batch(() => {
        setConversations((prev) => [conv, ...prev]);
        setActiveConvId(conv.id);
        setMessages([]);
      });
    }
  };

  const handleDeleteConversation = async (id: string) => {
    const ok = await deleteConversation(id);
    if (ok) {
      batch(() => {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (activeConvId() === id) {
          const remaining = conversations().filter((c) => c.id !== id);
          setActiveConvId(remaining.length > 0 ? remaining[0].id : null);
        }
      });
    }
  };

  const handleSelectConversation = (id: string) => {
    setActiveConvId(id);
  };

  // ── Keyboard ────────────────────────────────────────────────────────────

  const handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl+Enter or Cmd+Enter to send
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Auto-resize textarea ────────────────────────────────────────────────

  const handleInput = (e: InputEvent) => {
    const target = e.target as HTMLTextAreaElement;
    setInput(target.value);
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 160)}px`;
  };

  // ── Format timestamp ────────────────────────────────────────────────────

  const formatTime = (ms: number): string => {
    const d = new Date(ms);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase();
  };

  // ── Active conversation title ───────────────────────────────────────────

  const activeTitle = () => {
    const id = activeConvId();
    const conv = conversations().find((c) => c.id === id);
    return conv?.title ?? 'Chat';
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div class={styles.chatRoot}>
      {/* Sidebar */}
      <Show when={sidebarOpen()}>
        <div class={styles.sidebar}>
          <div class={styles.sidebarHeader}>
            <span class={styles.sidebarTitle}>Conversations</span>
            <button
              type="button"
              class={styles.newChatButton}
              onClick={handleNewConversation}
              title="New conversation"
            >
              <Plus size={14} />
            </button>
          </div>

          <div class={styles.conversationList}>
            <Show
              when={conversations().length > 0}
              fallback={
                <div class={styles.sidebarEmpty}>
                  No conversations yet.
                  <br />
                  Click + to start one.
                </div>
              }
            >
              <For each={conversations()}>
                {(conv) => (
                  <div
                    class={styles.conversationItem}
                    data-active={activeConvId() === conv.id}
                    onClick={() => handleSelectConversation(conv.id)}
                  >
                    <MessageSquare size={14} style={{ 'flex-shrink': '0', opacity: '0.5' }} />
                    <span class={styles.conversationItemText}>{conv.title}</span>
                    <button
                      type="button"
                      class={styles.deleteButton}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConversation(conv.id);
                      }}
                      title="Delete conversation"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </div>
      </Show>

      {/* Main Chat Area */}
      <div class={styles.mainArea}>
        {/* Header */}
        <div class={styles.mainHeader}>
          <button
            type="button"
            class={styles.toggleSidebarButton}
            onClick={() => setSidebarOpen(!sidebarOpen())}
            title={sidebarOpen() ? 'Hide sidebar' : 'Show sidebar'}
          >
            <Show when={sidebarOpen()} fallback={<PanelLeft size={16} />}>
              <PanelLeftClose size={16} />
            </Show>
          </button>

          <span class={styles.mainHeaderTitle}>{activeTitle()}</span>

          <select
            class={styles.modelSelector}
            value={model()}
            onChange={(e) => setModel(e.currentTarget.value)}
          >
            <For each={MODELS}>
              {(m) => <option value={m.value}>{m.label}</option>}
            </For>
          </select>
        </div>

        {/* Messages */}
        <Show
          when={activeConvId()}
          fallback={
            <div class={styles.emptyState}>
              <MessageSquare size={48} class={styles.emptyIcon} />
              <span class={styles.emptyTitle}>Phantom Chat</span>
              <span class={styles.emptySubtitle}>
                Start a conversation with Claude. Ask questions, get code help,
                or brainstorm ideas tied to your workspace context.
              </span>
              <button
                type="button"
                class={styles.sendButton}
                style={{ width: 'auto', padding: '8px 20px', 'border-radius': '8px' }}
                onClick={handleNewConversation}
              >
                <Plus size={14} /> New Chat
              </button>
            </div>
          }
        >
          <Show
            when={!loading()}
            fallback={
              <div class={styles.emptyState}>
                <Loader size={20} style={{ animation: 'journal-spin 1s linear infinite' }} />
              </div>
            }
          >
            <div class={styles.messagesContainer}>
              <Show when={messages().length === 0}>
                <div class={styles.emptyState}>
                  <Bot size={32} class={styles.emptyIcon} />
                  <span class={styles.emptySubtitle}>
                    Send a message to start the conversation.
                  </span>
                </div>
              </Show>

              <For each={messages()}>
                {(msg) => <MessageBubble message={msg} />}
              </For>

              <div ref={messagesEndRef} />
            </div>
          </Show>

          {/* Input */}
          <div class={styles.inputHint}>
            <Show when={sending()}>
              <span style={{ color: 'var(--accent, inherit)' }}>Claude is responding...</span>
            </Show>
            <Show when={!sending()}>
              Ctrl+Enter to send
            </Show>
          </div>
          <div class={styles.inputArea}>
            <textarea
              ref={textareaRef}
              class={styles.inputTextarea}
              placeholder="Ask Claude anything..."
              value={input()}
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={sending()}
            />
            <button
              type="button"
              class={styles.sendButton}
              onClick={handleSend}
              disabled={!input().trim() || sending()}
              title="Send (Ctrl+Enter)"
            >
              <Send size={16} />
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
}
