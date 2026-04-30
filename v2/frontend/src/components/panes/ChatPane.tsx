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
  FileText,
  Image,
  MessageSquare,
  PanelLeftClose,
  PanelLeft,
  Pencil,
  Paperclip,
  Plus,
  Send,
  Trash2,
  User,
  Brain,
  Wrench,
  Loader,
  X,
} from 'lucide-solid';
import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js/lib/core';
import DOMPurify from 'dompurify';
import { onWailsEvent } from '@/core/events';
import {
  getConversations,
  createConversation,
  deleteConversation,
  updateConversationTitle,
  sendChatMessage,
  getChatHistory,
} from '@/core/bindings/chat';
import { readFileContents } from '@/core/bindings/editor';
import type { Conversation, ChatMessage, StreamEvent } from '@/core/types';
import { Select } from '@kobalte/core/select';
import { Popover } from '@kobalte/core/popover';
import { showToast, showWarningToast } from '@/shared/Toast/Toast';
import * as styles from '@/styles/chat.css';
import * as paneStyles from './ChatPane.css';
import { ImageLightbox } from '@/shared/ImageLightbox';

// ── Highlight.js language registrations (selective to keep bundle lean) ────
import typescript from 'highlight.js/lib/languages/typescript';
import javascript from 'highlight.js/lib/languages/javascript';
import python from 'highlight.js/lib/languages/python';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import json from 'highlight.js/lib/languages/json';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import sql from 'highlight.js/lib/languages/sql';
import mdLang from 'highlight.js/lib/languages/markdown';

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('tsx', typescript);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('jsx', javascript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('json', json);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('zsh', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('markdown', mdLang);
hljs.registerLanguage('md', mdLang);

// ── Configure marked with GFM + syntax highlighting ──────────────────────
marked.use(markedHighlight({
  langPrefix: 'hljs language-',
  highlight(code: string, lang: string) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  },
}));

marked.use({ gfm: true, breaks: true });

// ── Constants ───────────────────────────────────────────────────────────────

const MODELS = [
  { value: 'sonnet', label: 'Sonnet' },
  { value: 'opus', label: 'Opus' },
  { value: 'haiku', label: 'Haiku' },
];

const uid = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ── Attachment types & helpers ──────────────────────────────────────────────

interface Attachment {
  name: string;
  path: string;
  type: 'image' | 'code' | 'file';
  content?: string;
  preview?: string;
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);
const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'json', 'md', 'py', 'go', 'rs', 'yaml', 'yml',
  'toml', 'txt', 'css', 'html', 'sh', 'bash', 'zsh', 'rb', 'java', 'kt',
  'swift', 'c', 'cpp', 'h', 'hpp', 'sql', 'graphql', 'proto', 'xml',
]);

const getFileExtension = (name: string): string =>
  name.split('.').pop()?.toLowerCase() ?? '';

const classifyFile = (name: string): 'image' | 'code' | 'file' => {
  const ext = getFileExtension(name);
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (CODE_EXTENSIONS.has(ext)) return 'code';
  return 'file';
};

const langFromExtension = (name: string): string => {
  const ext = getFileExtension(name);
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    json: 'json', md: 'markdown', py: 'python', go: 'go', rs: 'rust',
    yaml: 'yaml', yml: 'yaml', toml: 'toml', txt: 'text', css: 'css',
    html: 'html', sh: 'bash', bash: 'bash', zsh: 'zsh', rb: 'ruby',
    java: 'java', kt: 'kotlin', swift: 'swift', c: 'c', cpp: 'cpp',
    h: 'c', hpp: 'cpp', sql: 'sql', graphql: 'graphql', proto: 'protobuf',
    xml: 'xml',
  };
  return map[ext] ?? ext;
};

const formatAttachmentsForMessage = (attachments: Attachment[]): string => {
  const parts: string[] = [];
  for (const att of attachments) {
    if (att.type === 'image') {
      parts.push(`[Image: ${att.name} — ${att.path}]`);
    } else if (att.type === 'code' && att.content) {
      parts.push(`File: ${att.name} (${att.path})\n\`\`\`${langFromExtension(att.name)}\n${att.content}\n\`\`\``);
    } else {
      parts.push(`[File: ${att.name} — ${att.path}]`);
    }
  }
  return parts.join('\n\n');
};

// ── Markdown Content Component (marked + DOMPurify + highlight.js) ──────────

interface MarkdownContentProps {
  text: string;
  onImageClick?: (src: string, alt: string) => void;
}

const MarkdownContent = (props: MarkdownContentProps) => {
  let ref: HTMLDivElement | undefined;

  const html = () => DOMPurify.sanitize(marked.parse(props.text) as string);

  // Add copy buttons to code blocks after render
  const addCopyButtons = () => {
    if (!ref) return;
    ref.querySelectorAll('pre').forEach((pre) => {
      if (pre.querySelector('.copy-btn')) return;
      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.textContent = 'Copy';
      pre.style.position = 'relative';
      pre.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
      pre.addEventListener('mouseleave', () => { btn.style.opacity = '0'; });
      btn.addEventListener('click', () => {
        const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
        navigator.clipboard.writeText(code);
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      });
      pre.appendChild(btn);
    });
  };

  // DOMPurify strips inline onclick attrs — wire image clicks via addEventListener
  // after each re-render. Marker attribute prevents double-binding.
  const wireImageClickHandlers = () => {
    if (!ref) return;
    const handler = props.onImageClick;
    if (!handler) return;
    ref.querySelectorAll('img').forEach((img) => {
      const el = img as HTMLImageElement;
      if (el.dataset.lightboxTrigger === 'true') return;
      el.dataset.lightboxTrigger = 'true';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handler(el.currentSrc || el.src, el.alt || '');
      });
    });
  };

  createEffect(() => {
    html(); // track reactivity
    requestAnimationFrame(() => {
      addCopyButtons();
      wireImageClickHandlers();
    });
  });

  return <div class={styles.markdownProse} ref={ref} innerHTML={html()} />;
};

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

function MessageBubble(props: {
  message: DisplayMessage;
  onImageClick?: (src: string, alt: string) => void;
}) {
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
          <MarkdownContent text={props.message.content} onImageClick={props.onImageClick} />
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
  const [attachments, setAttachments] = createSignal<Attachment[]>([]);
  const [dragOver, setDragOver] = createSignal(false);
  const [editingTitle, setEditingTitle] = createSignal(false);
  const [titleDraft, setTitleDraft] = createSignal('');

  // Image lightbox state — opened by clicks on rendered <img> in MarkdownContent.
  const [lightbox, setLightbox] = createSignal<{ src: string; alt: string } | null>(null);
  const lightboxOpen = () => lightbox() !== null;
  const lightboxSrc = () => lightbox()?.src ?? '';
  const lightboxAlt = () => lightbox()?.alt ?? '';
  const openLightbox = (src: string, alt: string) => setLightbox({ src, alt });
  const handleLightboxOpenChange = (open: boolean) => {
    if (!open) setLightbox(null);
  };

  let messagesEndRef: HTMLDivElement | undefined;
  let textareaRef: HTMLTextAreaElement | undefined;
  let titleInputRef: HTMLInputElement | undefined;

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

  /** Auto-generate a conversation title from the first user message. */
  const maybeAutoTitle = async (convId: string, messageText: string) => {
    const conv = conversations().find((c) => c.id === convId);
    if (!conv || conv.title !== 'New Chat') return;

    const newTitle = messageText.length > 40
      ? `${messageText.slice(0, 40)}...`
      : messageText;

    const ok = await updateConversationTitle(convId, newTitle);
    if (ok) {
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, title: newTitle } : c)),
      );
    }
  };

  const handleSend = async () => {
    const text = input().trim();
    const convId = activeConvId();
    const hasAttachments = attachments().length > 0;
    if ((!text && !hasAttachments) || !convId || sending()) return;

    // Build full message content with attachments prepended
    const currentAttachments = attachments();
    let fullContent = text;
    if (currentAttachments.length > 0) {
      const attachmentText = formatAttachmentsForMessage(currentAttachments);
      fullContent = text ? `${attachmentText}\n\n${text}` : attachmentText;
    }

    // Add user message immediately
    const userMsg: DisplayMessage = {
      id: uid(),
      conversation_id: convId,
      role: 'user',
      content: fullContent,
      model: model(),
      created_at: Date.now(),
      streaming: false,
    };

    batch(() => {
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setAttachments([]);
      setSending(true);
    });

    scrollToBottom();

    // Auto-resize textarea back
    if (textareaRef) textareaRef.style.height = 'auto';

    // Auto-title from first user message or attachment names
    const titleSource = text || currentAttachments.map((a) => a.name).join(', ');
    void maybeAutoTitle(convId, titleSource);

    // Send via binding — backend will emit stream events
    const ok = await sendChatMessage(convId, fullContent, model());
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

  // ── Drag & Drop ────────────────────────────────────────────────────────

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    // Internal phantom sidebar drag
    const phantomPath = e.dataTransfer?.getData('text/phantom-path');
    if (phantomPath) {
      const name = phantomPath.split('/').pop() ?? phantomPath;
      const fileType = classifyFile(name);
      const att: Attachment = { name, path: phantomPath, type: fileType };

      if (fileType === 'code') {
        const content = await readFileContents(workspaceId(), phantomPath);
        if (content) att.content = content;
      }

      setAttachments((prev) => [...prev, att]);
      return;
    }

    // External file drop from Finder
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const newAttachments: Attachment[] = [];

      for (const file of Array.from(files)) {
        const filePath = (file as any).path ?? file.name;
        const fileType = classifyFile(file.name);
        const att: Attachment = { name: file.name, path: filePath, type: fileType };

        if (fileType === 'image') {
          // Generate base64 preview for images
          const reader = new FileReader();
          const preview = await new Promise<string>((resolve) => {
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
          att.preview = preview;
        } else if (fileType === 'code') {
          // Read text content via FileReader
          const content = await file.text();
          if (content) att.content = content;
        }

        newAttachments.push(att);
      }

      setAttachments((prev) => [...prev, ...newAttachments]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Inline Title Editing ───────────────────────────────────────────────

  const startEditingTitle = () => {
    const convId = activeConvId();
    if (!convId) return;
    setTitleDraft(activeTitle());
    setEditingTitle(true);
    // Focus the input after render
    requestAnimationFrame(() => {
      titleInputRef?.focus();
      titleInputRef?.select();
    });
  };

  const commitTitleEdit = async () => {
    const convId = activeConvId();
    const newTitle = titleDraft().trim();
    setEditingTitle(false);

    if (!convId || !newTitle || newTitle === activeTitle()) return;

    const ok = await updateConversationTitle(convId, newTitle);
    if (ok) {
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, title: newTitle } : c)),
      );
    }
  };

  const cancelTitleEdit = () => {
    setEditingTitle(false);
  };

  const handleTitleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commitTitleEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelTitleEdit();
    }
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

          <Show
            when={editingTitle()}
            fallback={
              <div
                class={`${styles.mainHeaderTitle} ${styles.editableTitleWrapper}`}
                onClick={startEditingTitle}
                title="Click to rename"
              >
                <span style={{ overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
                  {activeTitle()}
                </span>
                <Pencil size={12} class={styles.editableTitleIcon} />
              </div>
            }
          >
            <input
              ref={titleInputRef}
              class={styles.editableTitleInput}
              value={titleDraft()}
              onInput={(e) => setTitleDraft(e.currentTarget.value)}
              onBlur={() => void commitTitleEdit()}
              onKeyDown={handleTitleKeyDown}
            />
          </Show>

          <Select<string>
            value={model()}
            onChange={(val) => { if (val !== null) setModel(val); }}
            options={MODELS.map((m) => m.value)}
            itemComponent={(itemProps) => (
              <Select.Item item={itemProps.item} class={styles.modelSelectItem}>
                <Select.ItemLabel class={styles.modelSelectItemLabel}>
                  {MODELS.find((m) => m.value === itemProps.item.rawValue)?.label ?? itemProps.item.rawValue}
                </Select.ItemLabel>
              </Select.Item>
            )}
          >
            <Select.Trigger class={styles.modelSelectTrigger}>
              <Select.Value<string> class={styles.modelSelectValue}>
                {(state) => MODELS.find((m) => m.value === state.selectedOption())?.label ?? state.selectedOption()}
              </Select.Value>
              <Select.Icon class={styles.modelSelectIcon}>
                <ChevronDown size={12} />
              </Select.Icon>
            </Select.Trigger>
            <Select.Portal>
              <Select.Content class={styles.modelSelectContent}>
                <Select.Listbox class={styles.modelSelectListbox} />
              </Select.Content>
            </Select.Portal>
          </Select>
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
                {(msg) => <MessageBubble message={msg} onImageClick={openLightbox} />}
              </For>

              <Show when={sending() && !messages().some((m) => m.role === 'assistant' && m.streaming)}>
                <div class={styles.messageRow} data-role="assistant">
                  <div class={styles.messageAvatar} data-role="assistant">
                    <Bot size={14} />
                  </div>
                  <div class={styles.messageBubble} data-role="assistant">
                    <div class={styles.typingIndicator}>
                      <span class={styles.typingDot} />
                      <span class={styles.typingDot} />
                      <span class={styles.typingDot} />
                    </div>
                  </div>
                </div>
              </Show>

              <div ref={messagesEndRef} />
            </div>
          </Show>

          {/* Attachments */}
          <Show when={attachments().length > 0}>
            <div class={styles.attachmentBar}>
              <For each={attachments()}>
                {(att, index) => (
                  <div class={styles.attachmentChip}>
                    <Show when={att.type === 'image' && att.preview}>
                      <img src={att.preview} alt={att.name} class={styles.attachmentChipImage} />
                    </Show>
                    <Show when={att.type === 'image' && !att.preview}>
                      <Image size={12} />
                    </Show>
                    <Show when={att.type === 'code'}>
                      <FileText size={12} />
                    </Show>
                    <Show when={att.type === 'file'}>
                      <Paperclip size={12} />
                    </Show>
                    <span style={{ overflow: 'hidden', 'text-overflow': 'ellipsis' }}>{att.name}</span>
                    <button
                      type="button"
                      class={styles.attachmentRemoveButton}
                      onClick={() => removeAttachment(index())}
                      title="Remove attachment"
                    >
                      <X size={10} />
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* Input */}
          <div
            class={`${styles.inputArea} ${dragOver() ? styles.inputAreaDragOver : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <textarea
              ref={textareaRef}
              class={styles.inputTextarea}
              placeholder={dragOver() ? 'Drop files here...' : 'Ask Claude anything...'}
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
              disabled={(!input().trim() && attachments().length === 0) || sending()}
              title="Send (Ctrl+Enter)"
            >
              <Send size={16} />
            </button>
          </div>
        </Show>
      </div>

      {/* Full-screen image viewer — wired via MarkdownContent onImageClick */}
      <ImageLightbox
        open={lightboxOpen}
        onOpenChange={handleLightboxOpenChange}
        src={lightboxSrc}
        alt={lightboxAlt}
      />
    </div>
  );
}
