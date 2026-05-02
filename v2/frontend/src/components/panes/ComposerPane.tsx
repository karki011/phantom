// Phantom — Composer pane (multi-step agentic edit pane backed by `claude` CLI)
// Author: Subash Karki

import { createSignal, createEffect, onMount, For, Show, batch } from 'solid-js';
import { createStore, produce, reconcile } from 'solid-js/store';
import { Paperclip, X, Wrench, Brain, ChevronRight, ChevronDown, ChevronLeft, History, Plus, Trash2, BookOpen, Zap, AlertTriangle, Terminal, Bot, Eye, Search, Pencil, FilePlus, FolderSearch, Globe, ListTodo, FileCode } from 'lucide-solid';
import { Select } from '@kobalte/core/select';
import { ContextMenu } from '@kobalte/core/context-menu';
import * as sidebarStyles from '@/styles/sidebar.css';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.use({ gfm: true, breaks: true });

// Tiny Markdown renderer for Composer assistant text. Light-weight (no
// highlight.js); promote to a shared component if a third consumer shows up.
//
// After every render, we walk the rendered tree and attach a "Copy" button
// to each <pre> code block (DOMPurify strips inline onclick attrs, so we
// wire via addEventListener after the fact). Marker class .copy-btn keeps
// the effect idempotent across re-renders.
function ComposerMarkdown(props: { text: string }) {
  let ref: HTMLDivElement | undefined;
  const html = () => DOMPurify.sanitize(marked.parse(props.text) as string);

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

  // Re-run after each text change, deferred to next paint so the freshly
  // rendered <pre> nodes exist before we query them.
  createEffect(() => {
    void props.text;
    requestAnimationFrame(addCopyButtons);
  });

  return <div ref={ref} class={styles.assistantText} innerHTML={html()} />;
}
import { onWailsEvent } from '@/core/events';
import {
  composerSend,
  composerCancel,
  composerIsRunning,
  composerNewConversation,
  composerDecideEdit,
  composerDeleteSession,
  composerListPending,
  composerHistory,
  composerListSessions,
  composerHistoryBySession,
  composerResumeSession,
  type ComposerEvent,
  type ComposerEditCard,
  type ComposerMention,
  type ComposerSessionSummary,
} from '@/core/bindings/composer';
import { addTabWithData, renameTabByPane } from '@/core/panes/signals';
import { showToast, showWarningToast } from '@/shared/Toast/Toast';
import { loadPref, setPref } from '@/core/signals/preferences';
import { Tip } from '@/shared/Tip/Tip';
import * as styles from './ComposerPane.css';
import * as metricsStyles from './ComposerMetrics.css';
import * as turnStyles from './ComposerTurnStyles.css';
import * as toolStatusStyles from './ComposerToolStatus.css';
import ComposerMemoryPanel from './ComposerMemoryPanel';
import ComposerSkillBrowser from './ComposerSkillBrowser';
import ComposerDiffCard from './ComposerDiffCard';
import * as strategyStyles from './ComposerStrategy.css';
import { extractToolSummary, groupToolCalls, type ToolGroup, type ToolUseEntry } from './ComposerToolSummary';

interface ComposerPaneProps {
  paneId?: string;
  cwd?: string;
  /**
   * Optional claude session_id to RESUME on mount. When set, the pane:
   *   1. binds itself to the session via composerResumeSession (so the
   *      next Send issues `--resume <id>` instead of allocating fresh),
   *   2. rehydrates history via composerHistoryBySession (so it sees
   *      every turn from any pane that touched this session — not just
   *      its own pane-id-keyed turns).
   * When unset, the pane uses the existing pane-id-keyed flow.
   */
  sessionId?: string;
}

// A single rendered turn — interleaves user prompt, assistant text/tool/thinking
// blocks, and edit cards, in stream order. Edit cards are tracked separately
// because they have their own lifecycle (accept/discard) independent of the
// streaming text.
interface TurnView {
  id: string;
  prompt: string;
  text: string;
  thinking: string;
  toolUses: { name: string; input: string; status: 'running' | 'done' | 'error'; result?: string; resultIsError?: boolean }[];
  editIds: string[];
  status: 'running' | 'done' | 'error' | 'cancelled';
  error?: string;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  startedAt: number;
  completedAt: number; // timestamp ms, 0 until done
  // Strategy metadata — populated once per turn when the orchestrator selects a strategy.
  strategyName: string;
  strategyConfidence: number;
  taskComplexity: string;
  taskRisk: string;
  blastRadius: number;
}

// Conflict info emitted by the Go backend via "composer:conflict".
interface ConflictSessionInfo {
  id: string;
  name: string;
  repo_cwd: string;
  source: string;
}

interface ConflictInfo {
  session_a: ConflictSessionInfo;
  session_b: ConflictSessionInfo;
  type: string; // "repo" or "file"
  file_path?: string;
  detected_at: string;
}

const MODELS = [
  { value: 'sonnet', label: 'Sonnet 4.6' },
  { value: 'opus', label: 'Opus' },
  { value: 'haiku', label: 'Haiku' },
];

const EFFORTS = [
  { value: 'auto', label: 'Auto' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' },
];

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  sonnet: 200_000,
  opus: 200_000,
  haiku: 200_000,
};

const formatTokenCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
};

export default function ComposerPane(props: ComposerPaneProps) {
  const paneId = () => props.paneId ?? '';
  const cwd = () => props.cwd ?? '';

  const [turns, setTurns] = createStore<TurnView[]>([]);
  const [edits, setEdits] = createStore<Record<string, ComposerEditCard>>({});
  const [input, setInput] = createSignal('');
  const [model, setModel] = createSignal<string>('opus');
  const [effort, setEffort] = createSignal<string>('auto');
  const [running, setRunning] = createSignal(false);
  const [activeTurnId, setActiveTurnId] = createSignal<string | null>(null);
  const [mentions, setMentions] = createSignal<ComposerMention[]>([]);
  const [mentionDraft, setMentionDraft] = createSignal('');
  // "No project context" — when true, the next send runs without any
  // CLAUDE.md / .claude/ / hooks / skills awareness. Persisted as a
  // per-user default so power users who always want clean answers don't
  // have to flip it every time.
  const [noContext, setNoContext] = createSignal(false);
  const [autoAccept, setAutoAccept] = createSignal(false);
  const [dragOver, setDragOver] = createSignal(false);
  const [showMemory, setShowMemory] = createSignal(false);
  const [showSkills, setShowSkills] = createSignal(false);

  // Past Sessions sidebar — list, collapsed-state, and the currently
  // active claude session_id. activeSessionId tracks the live session this
  // pane is bound to (starts as props.sessionId, updates on
  // handleNewConversation + as soon as a fresh send allocates one).
  const [sessions, setSessions] = createSignal<ComposerSessionSummary[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = createSignal(false);
  const [activeSessionId, setActiveSessionId] = createSignal<string>(props.sessionId ?? '');

  // Conflict detection — tracks repo/file overlaps with other Composer panes.
  const [conflicts, setConflicts] = createSignal<ConflictInfo[]>([]);
  const [conflictDismissed, setConflictDismissed] = createSignal(false);

  const getOtherSession = (c: ConflictInfo): ConflictSessionInfo => {
    return c.session_a.id === paneId() ? c.session_b : c.session_a;
  };

  const refreshSessions = async () => {
    const list = await composerListSessions();
    setSessions(list);
  };

  let feedRef: HTMLDivElement | undefined;
  let textareaRef: HTMLTextAreaElement | undefined;

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      if (feedRef) feedRef.scrollTop = feedRef.scrollHeight;
    });
  };

  // ── Rehydration helpers ──────────────────────────────────────────────
  // Shared between onMount and the in-place session swap so the two paths
  // can never drift. Caller is responsible for binding (composerResumeSession)
  // and for fetching the history list.
  //
  // `backendRunning` — when true, the backend still has an active run for
  // this pane. We preserve the last turn's "running" status and set the
  // component-level `running` signal so the thinking indicator and event
  // handlers stay alive after a remount (e.g. tab switch that caused
  // SolidJS to dispose/recreate the component).
  type HistoryRow = Awaited<ReturnType<typeof composerHistory>>[number];
  const applyHistory = (history: HistoryRow[], pending: ComposerEditCard[], backendRunning = false) => {
    const restored: TurnView[] = history.map((h, idx) => {
      const isLast = idx === history.length - 1;
      // If the backend is still running AND this is the last turn AND the
      // DB says "running", keep it as "running" so the UI stays live.
      // Otherwise, coerce stale "running" rows to "done" (old behaviour
      // for turns that crashed without a proper status write).
      let status: TurnView['status'];
      if (h.turn.status === 'running' && isLast && backendRunning) {
        status = 'running';
      } else if (h.turn.status === 'running') {
        status = 'done';
      } else {
        status = h.turn.status as TurnView['status'];
      }
      return {
        id: h.turn.id,
        // Persisted assistant text (migration 010+). Empty for older turns —
        // the prompt + edit cards still convey the gist of what happened.
        // Thinking blocks + tool_use timeline are intentionally NOT
        // rehydrated — text alone is the highest-signal slice.
        prompt: h.turn.prompt,
        text: h.turn.response_text ?? '',
        thinking: '',
        toolUses: [],
        editIds: (h.edits ?? []).map((e) => e.id),
        status,
        inputTokens: h.turn.input_tokens,
        outputTokens: h.turn.output_tokens,
        costUSD: h.turn.cost_usd,
        startedAt: h.turn.started_at * 1000,
        completedAt: h.turn.completed_at ? h.turn.completed_at * 1000 : h.turn.started_at * 1000,
        // Strategy metadata is not persisted — only available during live streaming.
        strategyName: '',
        strategyConfidence: 0,
        taskComplexity: '',
        taskRisk: '',
        blastRadius: 0,
      };
    });
    const editsById: Record<string, ComposerEditCard> = {};
    for (const h of history) for (const e of (h.edits ?? [])) editsById[e.id] = e;
    for (const e of pending) editsById[e.id] = e;
    batch(() => {
      setTurns(reconcile(restored));
      setEdits(reconcile(editsById));
      // Restore the running indicator and active turn when the backend
      // confirms a run is still in flight. Without this, remounted panes
      // would show an idle status bar even though the CLI is still
      // streaming — the user would see "Idle" and a missing thinking
      // indicator.
      if (backendRunning && restored.length > 0) {
        const last = restored[restored.length - 1];
        if (last.status === 'running') {
          setRunning(true);
          setActiveTurnId(last.id);
        }
      }
    });
    const lastSession = history[history.length - 1]?.turn.session_id;
    if (lastSession) setActiveSessionId(lastSession);
    requestAnimationFrame(() => scrollToBottom());
  };

  // Swap the pane in-place to a different past session — Claude.app style.
  // Binds the pane to the new session, cancels any in-flight run, then
  // rehydrates from session-keyed history. Pending edits are scoped to the
  // current pane (not the session), so we still pass them through so a
  // pane with un-decided cards doesn't lose them on swap.
  const loadSessionInPlace = async (sessionId: string) => {
    if (!sessionId) return;
    await composerCancel(paneId());
    await composerResumeSession(paneId(), sessionId);
    batch(() => {
      setTurns(reconcile([]));
      setEdits(reconcile({}));
      setRunning(false);
      setActiveTurnId(null);
      setMentions([]);
      setInput('');
      setActiveSessionId(sessionId);
      setConflicts([]);
      setConflictDismissed(false);
    });
    const [history, pending] = await Promise.all([
      composerHistoryBySession(sessionId),
      composerListPending(paneId()),
    ]);
    applyHistory(history, pending);
  };

  // ── Rehydrate full conversation on mount (turns + edits) ─────────────
  // Survives app restart, pane re-open, and tab switching. Also pulls in
  // any pending edits from previous sessions so cards reappear.
  onMount(async () => {
    // Per-user default for the "No project context" toggle. Loaded async,
    // doesn't block first render.
    void loadPref('composer_no_context_default').then((val) => {
      if (val === 'true') setNoContext(true);
    });

    // Sidebar collapsed-state. Defaults to expanded for first-time users.
    void loadPref('composer_sidebar_collapsed').then((val) => {
      if (val === 'true') setSidebarCollapsed(true);
    });

    // Auto-accept edits toggle — when on, edit cards are accepted as they arrive.
    void loadPref('composer_auto_accept_edits').then((val) => {
      if (val === 'true') setAutoAccept(true);
    });

    // Kick off the sessions list in parallel — doesn't block history load.
    void refreshSessions();

    // If this pane was opened with a sessionId from the sidebar, bind it
    // BEFORE the rehydration query so the next Send resumes correctly,
    // and pull history keyed by session_id (not pane_id) so the new pane
    // sees every turn from the original conversation.
    const resumingSessionId = props.sessionId ?? '';
    if (resumingSessionId) {
      await composerResumeSession(paneId(), resumingSessionId);
    }

    const [history, pending, backendRunning] = await Promise.all([
      resumingSessionId
        ? composerHistoryBySession(resumingSessionId)
        : composerHistory(paneId()),
      composerListPending(paneId()),
      // Ask the backend whether this pane has an active run. On first
      // mount this is always false. On remount (tab switch that caused
      // SolidJS to dispose/recreate this component) it can be true — in
      // which case applyHistory preserves the last turn's "running"
      // status so streaming events continue to land in the right turn
      // and the thinking indicator stays visible.
      composerIsRunning(paneId()),
    ]);

    applyHistory(history, pending, backendRunning);
  });

  // ── Stream events ────────────────────────────────────────────────────
  onWailsEvent<ComposerEvent>('composer:event', (ev) => {
    if (ev.pane_id !== paneId()) return;

    // Handle session_started before the turn-id gate — this event fires
    // before any turn exists and carries the session ID + Pokémon name so
    // the sidebar can show the session immediately on Send.
    if (ev.type === 'session_started') {
      if (ev.session_id) {
        setActiveSessionId(ev.session_id);
        void refreshSessions();
        const name = ev.session_name || ev.content || '';
        if (name) {
          renameTabByPane(paneId(), `Composer · ${name}`);
        }
      }
      return;
    }

    const turnId = ev.turn_id ?? activeTurnId();
    if (!turnId) return;

    const idx = turns.findIndex(t => t.id === turnId);
    if (idx < 0) return; // turn not found — nothing to update

    switch (ev.type) {
      case 'delta':
        setTurns(idx, 'text', prev => prev + (ev.content ?? ''));
        break;
      case 'thinking':
        setTurns(idx, 'thinking', prev => prev + (ev.content ?? ''));
        break;
      case 'tool_use':
        setTurns(idx, produce(turn => {
          // Mark all previously running tool uses as done.
          for (const tu of turn.toolUses) {
            if (tu.status === 'running') tu.status = 'done';
          }
          // Append the new tool use.
          turn.toolUses.push({
            name: ev.tool_name ?? 'tool',
            input: ev.tool_input ?? '',
            status: 'running',
          });
        }));
        break;
      case 'tool_result': {
        // Find the last running tool use entry.
        const tuIdx = turns[idx].toolUses.findLastIndex(u => u.status === 'running');
        if (tuIdx >= 0) {
          setTurns(idx, 'toolUses', tuIdx, produce(tu => {
            tu.result = ev.content ?? '';
            tu.resultIsError = ev.is_error ?? false;
            tu.status = ev.is_error ? 'error' : 'done';
          }));
        }
        break;
      }
      case 'result':
        setTurns(idx, produce(turn => {
          if (ev.input_tokens != null) turn.inputTokens = ev.input_tokens;
          if (ev.output_tokens != null) turn.outputTokens = ev.output_tokens;
          if (ev.cost_usd != null) turn.costUSD = ev.cost_usd;
        }));
        break;
      case 'done':
        setTurns(idx, produce(turn => {
          turn.status = 'done';
          if (ev.input_tokens != null) turn.inputTokens = ev.input_tokens;
          if (ev.output_tokens != null) turn.outputTokens = ev.output_tokens;
          if (ev.cost_usd != null) turn.costUSD = ev.cost_usd;
          turn.completedAt = Date.now();
          for (const tu of turn.toolUses) {
            if (tu.status === 'running') tu.status = 'done';
          }
        }));
        break;
      case 'error':
        setTurns(idx, produce(turn => {
          turn.status = 'error';
          turn.error = ev.content ?? 'Unknown error';
          for (const tu of turn.toolUses) {
            if (tu.status === 'running') tu.status = 'error';
          }
        }));
        break;
      case 'strategy':
        setTurns(idx, produce(turn => {
          if (ev.strategy_name != null) turn.strategyName = ev.strategy_name;
          if (ev.strategy_confidence != null) turn.strategyConfidence = ev.strategy_confidence;
          if (ev.task_complexity != null) turn.taskComplexity = ev.task_complexity;
          if (ev.task_risk != null) turn.taskRisk = ev.task_risk;
          if (ev.blast_radius != null) turn.blastRadius = ev.blast_radius;
        }));
        break;
    }

    if (ev.type === 'done' || ev.type === 'error') {
      setRunning(false);
      setActiveTurnId(null);
      // Refresh the Past Sessions sidebar so the just-finished turn moves
      // its session to the top and the cost/turn-count update reflect.
      void refreshSessions();
    }
    scrollToBottom();
  });

  onWailsEvent<ComposerEditCard>('composer:edit-pending', (card) => {
    if (card.pane_id !== paneId()) return;
    batch(() => {
      setEdits(card.id, card);
      const tidx = turns.findIndex(t => t.id === card.turn_id);
      if (tidx >= 0) {
        setTurns(tidx, 'editIds', prev => [...prev, card.id]);
      }
    });
    scrollToBottom();
    if (autoAccept()) {
      void composerDecideEdit(card.id, true);
    }
  });

  onWailsEvent<{ id: string; status: 'accepted' | 'discarded' }>('composer:edit-decided', (msg) => {
    if (edits[msg.id]) {
      setEdits(msg.id, 'status', msg.status);
    }
  });

  // Conflict detection — listen for repo/file overlap events from the backend.
  onWailsEvent<{ pane_id: string; conflict: ConflictInfo }>('composer:conflict', (data) => {
    if (data.pane_id !== paneId()) return;
    setConflicts((prev) => {
      // Deduplicate by session pair + type.
      const exists = prev.some(
        (c) =>
          c.session_a.id === data.conflict.session_a.id &&
          c.session_b.id === data.conflict.session_b.id &&
          c.type === data.conflict.type &&
          c.file_path === data.conflict.file_path,
      );
      if (exists) return prev;
      return [...prev, data.conflict];
    });
    setConflictDismissed(false);

    // File-level conflicts surface as a toast rather than a persistent banner.
    if (data.conflict.type === 'file' && data.conflict.file_path) {
      const other = data.conflict.session_a.id === paneId() ? data.conflict.session_b : data.conflict.session_a;
      showWarningToast(
        'File conflict',
        `"${basename(data.conflict.file_path)}" is being edited by ${other.name || 'another session'}`,
      );
    }
  });

  // ── Actions ──────────────────────────────────────────────────────────
  const handleSend = async () => {
    const prompt = input().trim();
    if (!prompt && mentions().length === 0) return;
    if (running()) return;

    const turnId = `turn-${Date.now()}`;
    const turn: TurnView = {
      id: turnId,
      prompt,
      text: '',
      thinking: '',
      toolUses: [],
      editIds: [],
      status: 'running',
      inputTokens: 0,
      outputTokens: 0,
      costUSD: 0,
      startedAt: Date.now(),
      completedAt: 0,
      strategyName: '',
      strategyConfidence: 0,
      taskComplexity: '',
      taskRisk: '',
      blastRadius: 0,
    };
    setTurns(turns.length, turn);
    setRunning(true);
    setInput('');
    scrollToBottom();

    const result = await composerSend(paneId(), prompt, cwd(), model(), mentions(), noContext(), effort());
    if (!result.id) {
      const errMsg = result.error ?? 'Failed to start. Make sure the Claude CLI is installed and accessible.';
      const errIdx = turns.findIndex(t => t.id === turnId);
      if (errIdx >= 0) {
        setTurns(errIdx, produce(t => { t.status = 'error'; t.error = errMsg; }));
      }
      setRunning(false);
      return;
    }
    // Re-key the turn to the server-assigned ID so stream events route correctly.
    const rekeyIdx = turns.findIndex(t => t.id === turnId);
    if (rekeyIdx >= 0) setTurns(rekeyIdx, 'id', result.id);
    setActiveTurnId(result.id);
    setMentions([]);
  };

  const handleCancel = async () => {
    await composerCancel(paneId());
    setRunning(false);
  };

  const handleNewConversation = async () => {
    if (running() || turns.length > 0) {
      addTabWithData('composer', `Composer · ${cwd() ? cwd().split('/').pop() : 'new'}`, { cwd: cwd() });
      return;
    }
    await composerNewConversation(paneId());
    batch(() => {
      setTurns(reconcile([]));
      setEdits(reconcile({}));
      setActiveTurnId(null);
      setMentions([]);
      setRunning(false);
      setActiveSessionId('');
      setConflicts([]);
      setConflictDismissed(false);
    });
  };

  const toggleSidebar = () => {
    const next = !sidebarCollapsed();
    setSidebarCollapsed(next);
    void setPref('composer_sidebar_collapsed', next ? 'true' : 'false');
  };

  // Click on a Recents row.
  //   plain click  → swap the SAME pane to that session (Claude.app style).
  //   cmd/ctrl+click → escape hatch: open the session in a NEW top-level tab
  //                    so users can compare two conversations side-by-side.
  const handleSessionRowClick = (s: ComposerSessionSummary, e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      addTabWithData('composer', `Composer · ${s.name || basename(s.cwd) || 'session'}`, {
        cwd: s.cwd,
        sessionId: s.session_id,
      });
      return;
    }
    void loadSessionInPlace(s.session_id);
  };

  // Delete a past session. Hard-delete (no undo). Triggered from the row's
  // right-click context menu. If the deleted session is currently bound to
  // this pane, reset to a clean slate so the user isn't staring at orphaned
  // turns. window.confirm() was previously used but is silently suppressed
  // by Wails WKWebView in some configurations — context menu is more
  // discoverable and matches the pattern used elsewhere (WorktreeItem etc).
  const handleDeleteSession = async (s: ComposerSessionSummary) => {
    const ok = await composerDeleteSession(s.session_id);
    if (!ok) {
      showWarningToast('Delete failed', 'Could not delete session — see console.');
      return;
    }
    const wasActive = activeSessionId() === s.session_id;
    setSessions((prev) => prev.filter((row) => row.session_id !== s.session_id));
    if (wasActive) {
      await composerNewConversation(paneId());
      batch(() => {
        setTurns(reconcile([]));
        setEdits(reconcile({}));
        setActiveTurnId(null);
        setMentions([]);
        setRunning(false);
        setActiveSessionId('');
        setInput('');
        setConflicts([]);
        setConflictDismissed(false);
      });
    }
    showToast('Deleted', 'Session removed.');
  };

  /** Open a hidden file input so user can pick a file → adds as @mention. */
  const handleAttachClick = () => {
    const fi = document.createElement('input');
    fi.type = 'file';
    fi.multiple = true;
    fi.style.display = 'none';
    fi.onchange = () => {
      const files = Array.from(fi.files ?? []);
      for (const f of files) {
        // macOS WebKit exposes .path on dropped/picked files via Wails.
        const path = (f as any).path as string | undefined;
        if (path) {
          setMentionDraft(path);
          addMention();
        }
      }
      fi.remove();
    };
    document.body.appendChild(fi);
    fi.click();
  };

  /** Handle clipboard paste — if image data is present, write to a temp file
   *  and add as @mention. Plain text falls through to the default behaviour. */
  const handleTextareaPaste = (e: ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageItem = items.find((it) => it.type.startsWith('image/'));
    if (!imageItem) return;
    e.preventDefault();
    const blob = imageItem.getAsFile();
    if (!blob) return;
    blob.arrayBuffer().then(async (buf) => {
      const ext = (imageItem.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
      const name = `phantom-paste-${Date.now()}.${ext}`;
      const path = `/tmp/${name}`;
      try {
        // Wails exposes WriteFileBase64 via the App; if not, this is a no-op.
        const App = (window as any).go?.app?.App;
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        if (typeof App?.WriteTempFileBase64 === 'function') {
          await App.WriteTempFileBase64(path, b64);
        } else {
          // Fall back to leaving a marker so user knows paste worked but write failed.
          showWarningToast('Paste', 'Image paste needs WriteTempFileBase64 binding (todo)');
          return;
        }
        setMentionDraft(path);
        addMention();
      } catch (err) {
        showWarningToast('Paste', `Image save failed: ${(err as Error).message}`);
      }
    });
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  };

  const addMention = () => {
    const path = mentionDraft().trim();
    if (!path) return;
    setMentions((prev) => [...prev, { path }]);
    setMentionDraft('');
  };

  const removeMention = (idx: number) => {
    setMentions((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Drag & drop ──────────────────────────────────────────────────────
  // Adds dropped files (Finder, sidebar) as @mentions on the textarea.
  // macOS Wails exposes `.path` on the File object so we can pass an
  // absolute path straight to the agent — no temp-file dance needed.
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

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    // Internal phantom sidebar drag carries an absolute path mime payload.
    const phantomPath = e.dataTransfer?.getData('text/phantom-path');
    if (phantomPath) {
      setMentions((prev) => [...prev, { path: phantomPath }]);
      return;
    }

    // External file drops (Finder etc.). macOS WebKit + Wails attaches
    // .path to each File entry.
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length === 0) return;

    const newMentions: ComposerMention[] = [];
    for (const file of files) {
      const path = (file as unknown as { path?: string }).path;
      if (path) newMentions.push({ path });
    }
    if (newMentions.length > 0) {
      setMentions((prev) => [...prev, ...newMentions]);
    }
  };

  const toggleNoContext = () => {
    const next = !noContext();
    setNoContext(next);
    void setPref('composer_no_context_default', next ? 'true' : 'false');
  };

  const toggleAutoAccept = () => {
    const next = !autoAccept();
    setAutoAccept(next);
    void setPref('composer_auto_accept_edits', next ? 'true' : 'false');
  };

  const handleSkillInvoke = (skillName: string) => {
    setInput(skillName + ' ');
    setShowSkills(false);
    textareaRef?.focus();
  };

  const handleAcceptEdit = async (id: string) => {
    await composerDecideEdit(id, true);
  };

  const handleDiscardEdit = async (id: string) => {
    await composerDecideEdit(id, false);
  };

  const openDiff = (card: ComposerEditCard) => {
    addTabWithData('diff', `Diff · ${basename(card.path)}`, {
      originalContent: card.old_content ?? '',
      modifiedContent: card.new_content ?? '',
      originalLabel: 'Before',
      modifiedLabel: 'After',
      language: guessLanguage(card.path),
      readOnly: true,
    });
  };

  const acceptAll = async () => {
    const pending = pendingEditCards();
    for (const c of pending) {
      await composerDecideEdit(c.id, true);
    }
  };

  const discardAll = async () => {
    const pending = pendingEditCards();
    if (pending.length === 0) return;
    for (const c of pending) {
      await composerDecideEdit(c.id, false);
    }
    showWarningToast('Discarded changes', `${pending.length} file(s) reverted`);
  };

  const pendingEditCards = (): ComposerEditCard[] =>
    Object.values(edits).filter((e) => e.status === 'pending');

  // ── Status strip values ─────────────────────────────────────────────
  const totalTokensThisTurn = () => {
    const last = turns[turns.length - 1];
    return last ? `${last.inputTokens} in / ${last.outputTokens} out` : '';
  };

  const totalCostThisTurn = () => {
    const last = turns[turns.length - 1];
    return last && last.costUSD > 0 ? `$${last.costUSD.toFixed(4)}` : '';
  };

  // ── Session-level computed metrics ─────────────────────────────────────
  const sessionTotalCost = () => turns.reduce((sum, t) => sum + t.costUSD, 0);
  const sessionTotalTokens = () => turns.reduce((sum, t) => sum + t.inputTokens + t.outputTokens, 0);
  const sessionTurnCount = () => turns.length;

  // ── Context window gauge ───────────────────────────────────────────────
  const contextUsed = () => {
    if (turns.length === 0) return 0;
    return turns[turns.length - 1].inputTokens;
  };
  const contextMax = () => MODEL_CONTEXT_LIMITS[model()] ?? 200_000;
  const contextPercent = () => Math.min(100, (contextUsed() / contextMax()) * 100);
  const contextColor = () => {
    const pct = contextPercent();
    if (pct >= 80) return 'danger';
    if (pct >= 60) return 'warning';
    return 'accent';
  };

  // Format a "Xm/Xh/Xd" relative timestamp for sidebar rows.
  const relTime = (unixSec: number): string => {
    if (!unixSec) return '';
    const diffSec = Math.max(0, Math.floor(Date.now() / 1000) - unixSec);
    if (diffSec < 60) return `${diffSec}s`;
    const m = Math.floor(diffSec / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
  };

  return (
    <div class={`${styles.root} ${styles.rootWithSidebar}`}>
      {/* Past Sessions sidebar — collapsible, per-pane state. */}
      <aside class={`${styles.sidebar} ${sidebarCollapsed() ? styles.sidebarCollapsed : ''}`}>
        <div class={styles.sidebarHeader}>
          <button
            class={styles.sidebarNewBtn}
            type="button"
            onClick={handleNewConversation}
            title="Start a new conversation in this pane"
          >
            <Plus size={12} />
            <span>New chat</span>
          </button>
        </div>
        <div class={styles.sidebarSectionLabel}>
          <History size={10} style={{ 'vertical-align': 'middle', 'margin-right': '4px' }} />
          Recents
        </div>
        <div class={styles.sidebarList}>
          <Show
            when={sessions().length > 0}
            fallback={<div class={styles.sidebarEmpty}>No past sessions yet</div>}
          >
            <For each={sessions()}>
              {(s) => {
                const isActive = () => s.session_id === activeSessionId();
                const displayName = () => s.name || s.first_prompt.trim() || 'Untitled';
                const subtitle = () => s.name && s.first_prompt.trim() ? s.first_prompt.trim() : '';
                const hasName = () => !!s.name;
                return (
                  <ContextMenu>
                    <ContextMenu.Trigger
                      as="div"
                      class={`${styles.sidebarRow} ${isActive() ? styles.sidebarRowActive : ''}`}
                      onClick={(e) => handleSessionRowClick(s, e)}
                      title={`${s.name ? s.name + '\n' : ''}${s.first_prompt || s.session_id}\n\nClick to open · Cmd+Click for new tab · Right-click for actions`}
                    >
                      <span class={styles.sidebarRowPrompt}>
                        {displayName()}
                      </span>
                      <Show when={subtitle()}>
                        <span class={styles.sidebarRowPromptEmpty} style={{ 'font-size': '10px', 'margin-left': '4px', 'flex-shrink': '1', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
                          {subtitle()}
                        </span>
                      </Show>
                      <span class={styles.sidebarRowTime}>{relTime(s.last_activity)}</span>
                    </ContextMenu.Trigger>
                    <ContextMenu.Portal>
                      <ContextMenu.Content class={sidebarStyles.contextMenuContent}>
                        <ContextMenu.Item
                          class={sidebarStyles.contextMenuItem}
                          onSelect={() => addTabWithData('composer', `Composer · ${s.name || basename(s.cwd) || 'session'}`, { cwd: s.cwd, sessionId: s.session_id })}
                        >
                          <Plus size={13} />
                          Open in new tab
                        </ContextMenu.Item>
                        <div class={sidebarStyles.contextMenuSeparator} />
                        <ContextMenu.Item
                          class={`${sidebarStyles.contextMenuItem} ${sidebarStyles.contextMenuItemDanger}`}
                          onSelect={() => void handleDeleteSession(s)}
                        >
                          <Trash2 size={13} />
                          Delete session
                        </ContextMenu.Item>
                      </ContextMenu.Content>
                    </ContextMenu.Portal>
                  </ContextMenu>
                );
              }}
            </For>
          </Show>
        </div>
        <div class={styles.sidebarFooter}>
          <button
            class={styles.sidebarToggle}
            type="button"
            onClick={toggleSidebar}
            title="Hide sidebar"
          >
            <ChevronLeft size={12} />
            <span>Collapse</span>
          </button>
        </div>
      </aside>

      {/* Floating expand button when sidebar is collapsed. */}
      <Show when={sidebarCollapsed()}>
        <button
          class={styles.sidebarExpandFloating}
          type="button"
          onClick={toggleSidebar}
          title="Show past sessions"
          aria-label="Show past sessions"
        >
          <ChevronRight size={12} />
        </button>
      </Show>

      {/* Main column — status strip + feed + composer textarea. */}
      <div class={styles.main}>
      {/* Sticky status strip */}
      <div class={styles.statusStrip}>
        <span class={`${styles.statusDot} ${!running() ? styles.statusDotIdle : ''}`} />
        <Show when={running()} fallback={<span>Idle · {model()}</span>}>
          <span>Running · {pendingEditCards().length} edit(s) pending</span>
        </Show>
        <button
          class={`${styles.contextPill} ${noContext() ? styles.contextPillActive : ''}`}
          type="button"
          onClick={toggleNoContext}
          disabled={running()}
          title={
            noContext()
              ? 'Agent has zero project context (no CLAUDE.md, .claude/, hooks, settings).'
              : 'Agent uses your project context (CLAUDE.md, .claude/, hooks, etc.).'
          }
        >
          {noContext() ? '🌐 No project context' : '📁 Project context on'}
        </button>
        <button
          class={`${styles.contextPill} ${autoAccept() ? styles.contextPillActive : ''}`}
          type="button"
          onClick={toggleAutoAccept}
          disabled={running()}
          title={
            autoAccept()
              ? 'Edits are auto-accepted as they arrive (files already written to disk).'
              : 'Edit cards require manual accept/discard.'
          }
        >
          {autoAccept() ? '⚡ Auto-accept on' : '✋ Manual review'}
        </button>
        <span class={styles.statusGrow} />
        <Show when={turns.length > 0}>
          <span class={metricsStyles.metricsSeparator}>|</span>
          <span class={metricsStyles.metricsGroup}>
            <span>Turn {sessionTurnCount()}</span>
            <span class={metricsStyles.metricsDot}>&middot;</span>
            <span>{totalTokensThisTurn()}</span>
            <Show when={totalCostThisTurn()}>
              <span class={metricsStyles.metricsDot}>&middot;</span>
              <span>{totalCostThisTurn()}</span>
            </Show>
          </span>
          <span class={metricsStyles.metricsSeparator}>|</span>
          <span class={metricsStyles.sessionTotal}>
            Session: ${sessionTotalCost().toFixed(4)}
            <span class={metricsStyles.metricsDot}>&middot;</span>
            {formatTokenCount(sessionTotalTokens())} tok
          </span>
        </Show>
        <Show when={running()}>
          <button class={styles.cancelBtn} type="button" onClick={handleCancel}>
            Cancel
          </button>
        </Show>
        {/* "New" is always available once there's at least one turn —
            even mid-stream, so the user can abort + start fresh in one click.
            handleNewConversation cancels any active run before resetting. */}
        <Show when={turns.length > 0}>
          <button
            class={styles.cancelBtn}
            type="button"
            onClick={handleNewConversation}
            title="Start a new conversation (cancels active run, clears history)"
          >
            New
          </button>
        </Show>
      </div>

      {/* Context window gauge */}
      <Show when={contextUsed() > 0}>
        <div class={metricsStyles.contextGauge} title={`Context: ${formatTokenCount(contextUsed())} / ${formatTokenCount(contextMax())} tokens (${contextPercent().toFixed(0)}%)`}>
          <div
            class={metricsStyles.contextGaugeFill}
            style={{
              width: `${contextPercent()}%`,
              background: `var(--gauge-color-${contextColor()})`,
            }}
          />
          <span class={metricsStyles.contextGaugeLabel}>
            {formatTokenCount(contextUsed())} / {formatTokenCount(contextMax())} ({contextPercent().toFixed(0)}%)
          </span>
        </div>
      </Show>

      {/* Conflict banner — shown when another Composer pane targets the same repo. */}
      <Show when={conflicts().length > 0 && !conflictDismissed()}>
        <div class={styles.conflictBanner}>
          <AlertTriangle size={14} />
          <span class={styles.conflictBannerText}>
            {conflicts().length === 1
              ? `Another session is editing this repo: "${getOtherSession(conflicts()[0]).name || 'Unknown'}"`
              : `${conflicts().length} other sessions are editing this repo`}
          </span>
          <button
            class={styles.conflictAction}
            type="button"
            onClick={() => {
              const other = getOtherSession(conflicts()[0]);
              if (other?.id) void loadSessionInPlace(other.id);
            }}
          >
            Switch
          </button>
          <button
            class={styles.conflictDismiss}
            type="button"
            onClick={() => setConflictDismissed(true)}
          >
            Dismiss
          </button>
        </div>
      </Show>

      {/* Conversation feed */}
      <div class={styles.feed} ref={feedRef}>
        <Show when={turns.length === 0}>
          <div class={styles.emptyState}>
            Ask Composer to make changes across files. Try{' '}
            <em>"Add a logger to the user service"</em>.
          </div>
        </Show>

        <For each={turns}>
          {(turn) => (
            <div class={turnStyles.turnGroup}>
              <Show when={turn.prompt}>
                <div class={styles.userTurn}>{turn.prompt}</div>
              </Show>

              <Show when={turn.strategyName}>
                <StrategyChip
                  name={turn.strategyName}
                  confidence={turn.strategyConfidence}
                  complexity={turn.taskComplexity}
                  risk={turn.taskRisk}
                  blastRadius={turn.blastRadius}
                />
              </Show>
              {/* Pre-stream "thinking" pulse — shows the moment user sends,
                  hides as soon as ANY content arrives (thinking/tool/text/edit)
                  or the turn settles (done/error). */}
              <Show
                when={
                  turn.status === 'running' &&
                  !turn.thinking &&
                  turn.toolUses.length === 0 &&
                  turn.editIds.length === 0 &&
                  !turn.text
                }
              >
                <div class={styles.pendingPulse} aria-live="polite">
                  <span class={styles.pendingDot} />
                  <span class={styles.pendingDot} />
                  <span class={styles.pendingDot} />
                  <span>thinking...</span>
                </div>
              </Show>

              <Show when={turn.thinking}>
                <ThinkingChip content={turn.thinking} />
              </Show>

              <ToolCallsSection toolUses={turn.toolUses} />

              <For each={turn.editIds}>
                {(id) => {
                  const card = () => edits[id];
                  return (
                    <Show when={card()}>
                      {(c) => (
                        <ComposerDiffCard
                          card={c()}
                          autoAccept={autoAccept()}
                          onAccept={() => handleAcceptEdit(c().id)}
                          onDiscard={() => handleDiscardEdit(c().id)}
                          onOpenDiff={() => openDiff(c())}
                        />
                      )}
                    </Show>
                  );
                }}
              </For>

              <Show when={turn.text}>
                <div>
                  <span class={turnStyles.assistantBadge}>ASSISTANT</span>
                  <ComposerMarkdown text={turn.text} />
                </div>
              </Show>

              <Show when={turn.status === 'error' && turn.error}>
                <div class={styles.assistantText} style={{ color: 'var(--danger, #ff627e)' }}>
                  Error: {turn.error}
                </div>
              </Show>

              <Show when={turn.status === 'done' || turn.status === 'error'}>
                <TurnMetrics turn={turn} turnIndex={turns.indexOf(turn)} edits={edits} />
              </Show>

              <Show when={turn.status === 'done' && turn.editIds.length > 0 && !autoAccept() && pendingEditCards().length > 0}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button class={`${styles.editBtn} ${styles.editAccept}`} type="button" onClick={acceptAll}>
                    Accept all ({pendingEditCards().length})
                  </button>
                  <button
                    class={`${styles.editBtn} ${styles.editDiscard}`}
                    type="button"
                    onClick={discardAll}
                  >
                    Discard all
                  </button>
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>

      {/* Composer / textarea / model picker / send hint.
          Drag-drop accepts both Finder files (DataTransfer.files[].path)
          and internal sidebar drags (text/phantom-path mime). Each dropped
          item lands as a fresh @mention chip. */}
      <div
        class={`${styles.composerArea} ${dragOver() ? styles.composerAreaDragOver : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <Show when={mentions().length > 0}>
          <div class={styles.mentionRow}>
            <For each={mentions()}>
              {(m, i) => (
                <span class={styles.mentionChip}>
                  @{m.path}
                  <button class={styles.mentionRemove} type="button" onClick={() => removeMention(i())}>
                    <X size={10} />
                  </button>
                </span>
              )}
            </For>
          </div>
        </Show>

        <textarea
          ref={textareaRef}
          class={styles.textarea}
          placeholder="What should Composer do… (paste an image to attach it)"
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          onPaste={handleTextareaPaste}
          rows={3}
        />

        <div class={styles.composerToolbar}>
          <Tip label="Attach file or paste image" placement="top">
            <button
              class={styles.editBtn}
              type="button"
              onClick={handleAttachClick}
            >
              <Paperclip size={12} />
            </button>
          </Tip>

          <Tip label="Memory context" placement="top">
            <button
              class={styles.editBtn}
              type="button"
              onClick={() => setShowMemory(!showMemory())}
            >
              <BookOpen size={12} />
            </button>
          </Tip>

          <Tip label="Skills browser" placement="top">
            <button
              class={styles.editBtn}
              type="button"
              onClick={() => setShowSkills(!showSkills())}
            >
              <Zap size={12} />
            </button>
          </Tip>

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
            <Select.Trigger class={styles.modelSelectTrigger} title="Select Claude model">
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

          <Select<string>
            value={effort()}
            onChange={(val) => { if (val !== null) setEffort(val); }}
            options={EFFORTS.map((e) => e.value)}
            itemComponent={(itemProps) => (
              <Select.Item item={itemProps.item} class={styles.modelSelectItem}>
                <Select.ItemLabel class={styles.modelSelectItemLabel}>
                  {EFFORTS.find((e) => e.value === itemProps.item.rawValue)?.label ?? itemProps.item.rawValue}
                </Select.ItemLabel>
              </Select.Item>
            )}
          >
            <Select.Trigger class={styles.modelSelectTrigger} title="Reasoning effort level">
              <Select.Value<string> class={styles.modelSelectValue}>
                {(state) => {
                  const label = EFFORTS.find((e) => e.value === state.selectedOption())?.label ?? state.selectedOption();
                  return `Effort: ${label}`;
                }}
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

          <span class={styles.grow} />
          <span class={styles.sendHint}>Cmd+↵ to send</span>
        </div>
      </div>
      </div>{/* /main */}

      {/* Memory context right rail — toggled from composer toolbar. */}
      <Show when={showMemory()}>
        <ComposerMemoryPanel cwd={cwd()} onClose={() => setShowMemory(false)} />
      </Show>

      {/* Skill browser right rail — toggled from composer toolbar. */}
      <Show when={showSkills()}>
        <ComposerSkillBrowser
          cwd={cwd()}
          onInvoke={handleSkillInvoke}
          onClose={() => setShowSkills(false)}
        />
      </Show>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────

function StrategyChip(props: { name: string; confidence: number; complexity: string; risk: string; blastRadius: number }) {
  const [open, setOpen] = createSignal(false);
  return (
    <div class={strategyStyles.strategyBlock} onClick={() => setOpen(!open())}>
      <div class={strategyStyles.strategyHeader}>
        <Brain size={11} />
        <Show when={open()} fallback={<ChevronRight size={11} />}>
          <ChevronDown size={11} />
        </Show>
        <span>Strategy: </span>
        <span class={strategyStyles.strategyName}>{props.name}</span>
        <span class={strategyStyles.strategyConfidence}>({(props.confidence * 100).toFixed(0)}%)</span>
      </div>
      <Show when={open()}>
        <div class={strategyStyles.strategyDetails}>
          <span class={strategyStyles.strategyTag}>Complexity: {props.complexity}</span>
          <span class={strategyStyles.strategyTag}>Risk: {props.risk}</span>
          <span class={strategyStyles.strategyTag}>Blast radius: {props.blastRadius} files</span>
        </div>
      </Show>
    </div>
  );
}

function ThinkingChip(props: { content: string }) {
  const [open, setOpen] = createSignal(false);
  const preview = () => {
    const text = props.content.trim();
    if (!text) return 'Reasoning...';
    const firstLine = text.split('\n')[0];
    return firstLine.length > 80 ? firstLine.slice(0, 80) + '…' : firstLine;
  };
  const lineCount = () => props.content.split('\n').filter(l => l.trim()).length;
  return (
    <div
      class={open() ? toolStatusStyles.thinkingExpanded : toolStatusStyles.thinkingCollapsed}
      onClick={() => setOpen(!open())}
      style={{ cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', 'align-items': 'center', gap: '4px', 'min-width': '0' }}>
        <Brain size={11} style={{ 'flex-shrink': '0' }} />
        <Show when={open()} fallback={<ChevronRight size={11} style={{ 'flex-shrink': '0' }} />}>
          <ChevronDown size={11} style={{ 'flex-shrink': '0' }} />
        </Show>
        <span style={{ 'font-weight': '500' }}>Thinking</span>
        <Show when={!open() && props.content}>
          <span style={{
            color: 'var(--text-muted, #888)',
            'font-size': '0.85em',
            overflow: 'hidden',
            'text-overflow': 'ellipsis',
            'white-space': 'nowrap',
            'min-width': '0',
          }}>
            — {preview()}
          </span>
        </Show>
        <Show when={lineCount() > 1}>
          <span style={{
            color: 'var(--text-muted, #666)',
            'font-size': '0.75em',
            'flex-shrink': '0',
          }}>
            ({lineCount()} lines)
          </span>
        </Show>
      </div>
      <Show when={open()}>
        <pre style={{
          'margin-top': '6px',
          'white-space': 'pre-wrap',
          'word-break': 'break-word',
          'width': '100%',
          'padding': '8px 10px',
          'border-radius': '6px',
          'background': 'rgba(255, 255, 255, 0.03)',
          'border': '1px solid rgba(255, 255, 255, 0.06)',
          'font-size': '11px',
          'line-height': '1.5',
          'max-height': '300px',
          'overflow-y': 'auto',
        }}>
          {props.content}
        </pre>
      </Show>
    </div>
  );
}

/** Section wrapper for tool calls with expand-all / collapse-all toggle + grouping. */
function ToolCallsSection(props: {
  toolUses: { name: string; input: string; status: 'running' | 'done' | 'error'; result?: string; resultIsError?: boolean }[];
}) {
  const [expandMode, setExpandMode] = createSignal<'all' | 'none' | 'individual'>('individual');

  const groups = () => groupToolCalls(props.toolUses as ToolUseEntry[]);

  const toggleExpandAll = () => {
    setExpandMode((prev) => (prev === 'all' ? 'none' : 'all'));
  };

  return (
    <>
      <Show when={props.toolUses.length > 1}>
        <div class={toolStatusStyles.expandToggleRow}>
          <button
            class={toolStatusStyles.expandToggleBtn}
            type="button"
            onClick={toggleExpandAll}
          >
            {expandMode() === 'all' ? 'Collapse All' : 'Expand All'}
          </button>
          <span class={toolStatusStyles.expandToggleCount}>
            {props.toolUses.length} tool call{props.toolUses.length !== 1 ? 's' : ''}
          </span>
        </div>
      </Show>
      <For each={groups()}>
        {(group) => (
          <Show
            when={group.type === 'group'}
            fallback={
              <ToolUseChip
                name={group.items[0].name}
                input={group.items[0].input}
                status={group.items[0].status}
                result={group.items[0].result}
                resultIsError={group.items[0].resultIsError}
                expandMode={expandMode()}
              />
            }
          >
            <ToolGroupChip group={group} expandMode={expandMode()} />
          </Show>
        )}
      </For>
    </>
  );
}

/** Map icon name string from ToolSummary to a lucide-solid component. */
const TOOL_ICON_MAP: Record<string, typeof Wrench> = {
  Terminal,
  Bot,
  Eye,
  Search,
  Pencil,
  FilePlus,
  FolderSearch,
  Globe,
  ListTodo,
  FileCode,
  Wrench,
};

const formatToolInput = (input: string): string => {
  try {
    const parsed = JSON.parse(input);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return input;
  }
};

function ToolUseChip(props: {
  name: string;
  input: string;
  status: 'running' | 'done' | 'error';
  result?: string;
  resultIsError?: boolean;
  expandMode?: 'all' | 'none' | 'individual';
}) {
  const [localOpen, setLocalOpen] = createSignal(false);
  const [showFullResult, setShowFullResult] = createSignal(false);
  const RESULT_PREVIEW_LIMIT = 2000;

  const effectiveOpen = () => {
    const mode = props.expandMode ?? 'individual';
    if (mode === 'all') return true;
    if (mode === 'none') return false;
    return localOpen();
  };

  const summary = () => extractToolSummary(props.name, props.input);
  const IconComponent = () => TOOL_ICON_MAP[summary().iconName] ?? Wrench;

  const dotClass = () => {
    switch (props.status) {
      case 'running': return toolStatusStyles.statusDotRunning;
      case 'error': return toolStatusStyles.statusDotError;
      default: return toolStatusStyles.statusDotSuccess;
    }
  };

  const truncatedResult = () => {
    const r = props.result ?? '';
    if (r.length <= RESULT_PREVIEW_LIMIT || showFullResult()) return r;
    return r.slice(0, RESULT_PREVIEW_LIMIT) + '\n...';
  };

  const resultIsTruncated = () => (props.result ?? '').length > RESULT_PREVIEW_LIMIT && !showFullResult();

  const handleClick = () => {
    // Only toggle local state when in individual mode.
    setLocalOpen(!localOpen());
  };

  return (
    <div class={styles.toolBlock} onClick={handleClick} style={{ cursor: 'pointer' }}>
      <span class={dotClass()} />
      {(() => {
        const Ic = IconComponent();
        return <Ic size={11} style={{ 'vertical-align': 'middle', 'margin-right': '4px', 'flex-shrink': '0' }} />;
      })()}
      <Show when={effectiveOpen()} fallback={<ChevronRight size={11} style={{ 'vertical-align': 'middle', 'flex-shrink': '0' }} />}>
        <ChevronDown size={11} style={{ 'vertical-align': 'middle', 'flex-shrink': '0' }} />
      </Show>
      <span style={{ 'margin-left': '4px', 'flex-shrink': '0' }}>{props.name}</span>
      <Show when={summary().label}>
        <span class={toolStatusStyles.toolNameSep}>—</span>
        <span class={toolStatusStyles.toolSummaryLabel} title={summary().label}>{summary().label}</span>
      </Show>
      <Show when={summary().badge}>
        <span class={toolStatusStyles.toolBadge}>{summary().badge}</span>
      </Show>
      <Show when={effectiveOpen()}>
        <pre style={{
          'margin-top': '6px',
          'white-space': 'pre-wrap',
          'word-break': 'break-word',
          'width': '100%',
          'padding': '8px 10px',
          'border-radius': '6px',
          'background': 'rgba(255, 255, 255, 0.03)',
          'border': '1px solid rgba(255, 255, 255, 0.06)',
          'font-size': '11px',
          'line-height': '1.5',
          'overflow-x': 'auto',
        }}>
          <code>{formatToolInput(props.input)}</code>
        </pre>
        <Show when={props.result}>
          <div
            style={{
              'margin-top': '6px',
              'padding': '6px 8px',
              'border-radius': '4px',
              'font-size': '11px',
              'background': props.resultIsError ? 'rgba(255, 98, 126, 0.08)' : 'rgba(255, 255, 255, 0.04)',
              'border-left': props.resultIsError ? '2px solid var(--danger, #ff627e)' : '2px solid var(--accent, #7c8aff)',
              'width': '100%',
            }}
          >
            <span style={{
              'font-weight': '600',
              'font-size': '10px',
              'text-transform': 'uppercase',
              'letter-spacing': '0.5px',
              'color': props.resultIsError ? 'var(--danger, #ff627e)' : 'var(--accent, #7c8aff)',
            }}>
              {props.resultIsError ? 'Error' : 'Result'}
            </span>
            <pre style={{
              'margin-top': '4px',
              'white-space': 'pre-wrap',
              'word-break': 'break-all',
              'color': props.resultIsError ? 'var(--danger, #ff627e)' : 'inherit',
            }}>
              {truncatedResult()}
            </pre>
            <Show when={resultIsTruncated()}>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowFullResult(true); }}
                style={{
                  'margin-top': '4px',
                  'background': 'none',
                  'border': 'none',
                  'color': 'var(--accent, #7c8aff)',
                  'cursor': 'pointer',
                  'font-size': '11px',
                  'padding': '0',
                  'text-decoration': 'underline',
                }}
              >
                Show more ({((props.result ?? '').length / 1000).toFixed(1)}K chars)
              </button>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  );
}

/** Collapsed group chip for 5+ consecutive same-name tool calls. */
function ToolGroupChip(props: {
  group: ToolGroup;
  expandMode: 'all' | 'none' | 'individual';
}) {
  const [open, setOpen] = createSignal(false);

  const effectiveOpen = () => {
    const mode = props.expandMode;
    if (mode === 'all') return true;
    if (mode === 'none') return false;
    return open();
  };

  const runningCount = () => props.group.items.filter((i) => i.status === 'running').length;
  const errorCount = () => props.group.items.filter((i) => i.status === 'error').length;
  const IconComponent = () => TOOL_ICON_MAP[extractToolSummary(props.group.name, '{}').iconName] ?? Wrench;

  return (
    <div>
      <div class={toolStatusStyles.toolGroupHeader} onClick={() => setOpen(!open())}>
        {(() => {
          const Ic = IconComponent();
          return <Ic size={11} style={{ 'flex-shrink': '0' }} />;
        })()}
        <Show when={effectiveOpen()} fallback={<ChevronRight size={11} style={{ 'flex-shrink': '0' }} />}>
          <ChevronDown size={11} style={{ 'flex-shrink': '0' }} />
        </Show>
        <span>{props.group.name}</span>
        <span>({props.group.items.length} calls)</span>
        <Show when={runningCount() > 0}>
          <span class={toolStatusStyles.statusDotRunning} />
        </Show>
        <Show when={errorCount() > 0}>
          <span class={toolStatusStyles.statusDotError} />
          <span style={{ 'font-size': '10px' }}>{errorCount()} failed</span>
        </Show>
        <Show when={props.group.previewLabels.length > 0 && !effectiveOpen()}>
          <span class={toolStatusStyles.toolNameSep}>—</span>
          <span class={toolStatusStyles.toolGroupPreview}>
            {props.group.previewLabels.join(', ')}
            {props.group.items.length > 3 ? ', …' : ''}
          </span>
        </Show>
      </div>
      <Show when={effectiveOpen()}>
        <div class={toolStatusStyles.toolGroupChildren}>
          <For each={props.group.items}>
            {(t) => (
              <ToolUseChip
                name={t.name}
                input={t.input}
                status={t.status}
                result={t.result}
                resultIsError={t.resultIsError}
                expandMode="individual"
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function TurnMetrics(props: { turn: TurnView; turnIndex: number; edits: Record<string, ComposerEditCard> }) {
  const duration = () => {
    if (!props.turn.completedAt || !props.turn.startedAt) return '';
    const sec = Math.round((props.turn.completedAt - props.turn.startedAt) / 1000);
    if (sec < 60) return `${sec}s`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  };

  const filesEdited = () => props.turn.editIds.length;
  const linesChanged = () => {
    let added = 0, removed = 0;
    for (const id of props.turn.editIds) {
      const card = props.edits[id];
      if (card) { added += card.lines_added; removed += card.lines_removed; }
    }
    return { added, removed };
  };

  return (
    <div class={metricsStyles.turnMetrics}>
      <span>Turn {props.turnIndex + 1}</span>
      <Show when={duration()}>
        <span class={metricsStyles.metricsDot}>&middot;</span>
        <span>{duration()}</span>
      </Show>
      <span class={metricsStyles.metricsDot}>&middot;</span>
      <span>{formatTokenCount(props.turn.inputTokens)} in / {formatTokenCount(props.turn.outputTokens)} out</span>
      <span class={metricsStyles.metricsDot}>&middot;</span>
      <span>${props.turn.costUSD.toFixed(4)}</span>
      <Show when={filesEdited() > 0}>
        <span class={metricsStyles.metricsDot}>&middot;</span>
        <span>{filesEdited()} file{filesEdited() > 1 ? 's' : ''}</span>
        <span class={metricsStyles.turnLinesAdded}>+{linesChanged().added}</span>
        <span class={metricsStyles.turnLinesRemoved}>-{linesChanged().removed}</span>
      </Show>
    </div>
  );
}


// ── Helpers ────────────────────────────────────────────────────────────

function basename(p: string): string {
  if (!p) return '';
  const idx = p.lastIndexOf('/');
  return idx >= 0 ? p.slice(idx + 1) : p;
}

function guessLanguage(path: string): string {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return 'plaintext';
  const ext = path.slice(dot + 1).toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
      return 'javascript';
    case 'go':
      return 'go';
    case 'py':
      return 'python';
    case 'rs':
      return 'rust';
    case 'json':
      return 'json';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'md':
      return 'markdown';
    case 'sql':
      return 'sql';
    case 'sh':
    case 'bash':
      return 'shell';
    default:
      return 'plaintext';
  }
}

// Trick to keep `createEffect` import live for future expansion (lint guard).
const _keepImports = (): void => {
  void createEffect;
};
void _keepImports;
