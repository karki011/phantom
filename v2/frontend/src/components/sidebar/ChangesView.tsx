// PhantomOS v2 — Git changes view with staged/unstaged collapsible sections
// Author: Subash Karki

import { createSignal, createEffect, on, For, Show } from 'solid-js';
import { Collapsible } from '@kobalte/core/collapsible';
import { ContextMenu } from '@kobalte/core/context-menu';
import { TextField } from '@kobalte/core/text-field';
import {
  ChevronRight, ChevronDown, GitCommit, Sparkles,
  Plus, Minus, Undo2, RefreshCw,
  ArrowDownFromLine, ArrowUpFromLine,
  FilePen, FilePlus2, FileX, FileQuestion,
  GitBranch, Eye, Clipboard, Trash2,
} from 'lucide-solid';
import * as styles from '@/styles/right-sidebar.css';
import { iconShrink } from '@/styles/utilities.css';
import { activeWorktreeId } from '@/core/signals/app';
import { worktreeMap } from '@/core/signals/worktrees';
import {
  gitStage, gitStageAll, gitUnstage, gitCommit,
  gitDiscard, gitPull, gitPush, getWorkspaceStatus,
  refreshWorkspaceStatus,
  revealInFinder,
  readFileContents, getFileAtRevision,
} from '@/core/bindings';
import { showFileDiff } from '@/core/editor/diff-utils';
import { openFileInEditor } from '@/core/editor/open-file';
import { removeTab, tabs } from '@/core/panes/signals';
import { showToast, showWarningToast } from '@/shared/Toast/Toast';
import { Tip } from '@/shared/Tip/Tip';
import { onWailsEvent } from '@/core/events';
import type { RepoStatus, FileStatus } from '@/core/types';
import {
  commitMessage, setCommitMessage, setChangesCount,
} from '@/core/signals/files';

// ── Base path helper ─────────────────────────────────────────────────────────

function getBasePath(): string {
  const wtId = activeWorktreeId();
  if (!wtId) return '';
  for (const workspaces of Object.values(worktreeMap())) {
    const match = workspaces.find((w) => w.id === wtId);
    if (match) return match.worktree_path ?? '';
  }
  return '';
}

// ── Status icon per git status code ──────────────────────────────────────────

function FileStatusIcon(props: { status: string }) {
  const iconProps = { size: 12, class: iconShrink };
  switch (props.status) {
    case 'M': return <FilePen {...iconProps} class={styles.statusIconM} />;
    case 'A': return <FilePlus2 {...iconProps} class={styles.statusIconA} />;
    case 'D': return <FileX {...iconProps} class={styles.statusIconD} />;
    case 'R': return <FilePen size={12} class={styles.statusIconR} />;
    default:  return <FileQuestion {...iconProps} class={styles.statusIconQ} />;
  }
}

// ── Individual file row ───────────────────────────────────────────────────────

function StagedFileRow(props: {
  file: FileStatus;
  onUnstage: (path: string) => void;
  onFileClick: (file: FileStatus) => void;
}) {
  const name = () => props.file.path.split('/').pop() ?? props.file.path;
  const absolutePath = () => {
    const base = getBasePath();
    return base ? `${base}/${props.file.path}` : props.file.path;
  };

  return (
    <ContextMenu>
      <ContextMenu.Trigger as="div" class={styles.fileRow} onClick={() => props.onFileClick(props.file)}>
        <FileStatusIcon status={props.file.status} />
        <span class={styles.fileRowName} title={props.file.path}>{name()}</span>
        <div class={styles.fileRowActions}>
          <Tip label="Unstage" placement="left">
            <button
              type="button"
              class={styles.fileActionUnstage}
              onClick={(e) => { e.stopPropagation(); props.onUnstage(props.file.path); }}
            >
              <Minus size={11} />
            </button>
          </Tip>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content class={styles.contextMenuContent}>
          <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => props.onFileClick(props.file)}>
            <Eye size={13} />
            Open Diff
          </ContextMenu.Item>
          <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => props.onUnstage(props.file.path)}>
            <Minus size={13} />
            Unstage
          </ContextMenu.Item>
          <ContextMenu.Separator class={styles.contextMenuSeparator} />
          <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => { navigator.clipboard.writeText(props.file.path); }}>
            <Clipboard size={13} />
            Copy Path
          </ContextMenu.Item>
          <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => { navigator.clipboard.writeText(absolutePath()); }}>
            <Clipboard size={13} />
            Copy Absolute Path
          </ContextMenu.Item>
          <Show when={props.file.status !== 'D'}>
            <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => revealInFinder(absolutePath())}>
              <Eye size={13} />
              Reveal in Finder
            </ContextMenu.Item>
          </Show>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu>
  );
}

function UnstagedFileRow(props: {
  file: FileStatus;
  onDiscard: (path: string) => void;
  onStage: (path: string) => void;
  onFileClick: (file: FileStatus) => void;
}) {
  const name = () => props.file.path.split('/').pop() ?? props.file.path;
  const absolutePath = () => {
    const base = getBasePath();
    return base ? `${base}/${props.file.path}` : props.file.path;
  };
  const isUntracked = () => props.file.status === '?';

  return (
    <ContextMenu>
      <ContextMenu.Trigger as="div" class={styles.fileRow} onClick={() => props.onFileClick(props.file)}>
        <FileStatusIcon status={props.file.status} />
        <span class={styles.fileRowName} title={props.file.path}>{name()}</span>
        <div class={styles.fileRowActions}>
          <Tip label="Discard changes" placement="left">
            <button
              type="button"
              class={styles.fileActionDiscard}
              onClick={(e) => { e.stopPropagation(); props.onDiscard(props.file.path); }}
            >
              <Undo2 size={11} />
            </button>
          </Tip>
          <Tip label="Stage" placement="left">
            <button
              type="button"
              class={styles.fileActionStage}
              onClick={(e) => { e.stopPropagation(); props.onStage(props.file.path); }}
            >
              <Plus size={11} />
            </button>
          </Tip>
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content class={styles.contextMenuContent}>
          <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => props.onFileClick(props.file)}>
            <Eye size={13} />
            {isUntracked() ? 'Open File' : 'Open Diff'}
          </ContextMenu.Item>
          <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => props.onStage(props.file.path)}>
            <Plus size={13} />
            Stage
          </ContextMenu.Item>
          <Show when={!isUntracked()}>
            <ContextMenu.Item class={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`} onSelect={() => props.onDiscard(props.file.path)}>
              <Trash2 size={13} />
              Discard Changes
            </ContextMenu.Item>
          </Show>
          <ContextMenu.Separator class={styles.contextMenuSeparator} />
          <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => { navigator.clipboard.writeText(props.file.path); }}>
            <Clipboard size={13} />
            Copy Path
          </ContextMenu.Item>
          <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => { navigator.clipboard.writeText(absolutePath()); }}>
            <Clipboard size={13} />
            Copy Absolute Path
          </ContextMenu.Item>
          <Show when={props.file.status !== 'D'}>
            <ContextMenu.Item class={styles.contextMenuItem} onSelect={() => revealInFinder(absolutePath())}>
              <Eye size={13} />
              Reveal in Finder
            </ContextMenu.Item>
          </Show>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu>
  );
}

// ── Main changes view ─────────────────────────────────────────────────────────

export function ChangesView() {
  const [repoStatus, setRepoStatus] = createSignal<RepoStatus | null>(null);
  const [stagedOpen, setStagedOpen] = createSignal(true);
  const [changesOpen, setChangesOpen] = createSignal(true);

  const stagedFiles  = () => repoStatus()?.staged ?? [];
  const unstagedFiles = () => [
    ...(repoStatus()?.unstaged ?? []),
    ...(repoStatus()?.untracked ?? []).map((f) => ({ ...f, status: '?' })),
  ];

  const aheadBy  = () => repoStatus()?.ahead_by  ?? 0;
  const behindBy = () => repoStatus()?.behind_by ?? 0;
  const branchName = () => repoStatus()?.branch ?? '';
  const needsPull = () => behindBy() > 0;
  const needsPush = () => aheadBy() > 0;
  const syncLabel = () => {
    const parts: string[] = [];
    if (needsPull()) parts.push(`${behindBy()} behind`);
    if (needsPush()) parts.push(`${aheadBy()} ahead`);
    return parts.length > 0 ? parts.join(' · ') : 'In sync';
  };

  const [syncing, setSyncing] = createSignal(false);

  async function refreshStatus(fetchRemote = false) {
    const wtId = activeWorktreeId();
    if (!wtId) { setRepoStatus(null); return; }
    if (fetchRemote) setSyncing(true);
    const status = fetchRemote
      ? await refreshWorkspaceStatus(wtId)
      : await getWorkspaceStatus(wtId);
    setRepoStatus(status);
    setChangesCount(
      (status?.staged?.length ?? 0) + (status?.unstaged?.length ?? 0) + (status?.untracked?.length ?? 0),
    );
    if (fetchRemote) setSyncing(false);
  }

  // Auto-load when active worktree changes
  createEffect(on(activeWorktreeId, () => { refreshStatus(); }));

  // Backend-driven refresh
  onWailsEvent('git:status', refreshStatus);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleStage(path: string) {
    const wtId = activeWorktreeId();
    if (!wtId) return;
    await gitStage(wtId, [path]);
    await refreshStatus();
  }

  async function handleUnstage(path: string) {
    const wtId = activeWorktreeId();
    if (!wtId) return;
    await gitUnstage(wtId, [path]);
    await refreshStatus();
  }

  async function handleStageAll() {
    const wtId = activeWorktreeId();
    if (!wtId) return;
    await gitStageAll(wtId);
    await refreshStatus();
  }

  async function handleUnstageAll() {
    const wtId = activeWorktreeId();
    if (!wtId) return;
    const paths = stagedFiles().map((f) => f.path);
    if (paths.length === 0) return;
    await gitUnstage(wtId, paths);
    await refreshStatus();
  }

  function closeDiffTabForFile(filePath: string) {
    const diffTab = tabs().find((t) => {
      const panes = Object.values(t.panes);
      return panes.some((p) => p.kind === 'diff' && p.data?.filePath === filePath);
    });
    if (diffTab) removeTab(diffTab.id);
  }

  async function handleDiscard(path: string) {
    const wtId = activeWorktreeId();
    if (!wtId) return;
    await gitDiscard(wtId, [path]);
    closeDiffTabForFile(path);
    await refreshStatus();
  }

  async function handleDiscardAll() {
    const wtId = activeWorktreeId();
    if (!wtId) return;
    const paths = unstagedFiles().map((f) => f.path);
    if (paths.length === 0) return;
    await gitDiscard(wtId, paths);
    await refreshStatus();
  }

  async function handlePull() {
    const wtId = activeWorktreeId();
    if (!wtId) return;
    const ok = await gitPull(wtId);
    if (ok) { showToast('Pulled', 'Up to date'); await refreshStatus(); }
    else showWarningToast('Pull failed', 'Could not pull from remote');
  }

  async function handlePush() {
    const wtId = activeWorktreeId();
    if (!wtId) return;
    const ok = await gitPush(wtId);
    if (ok) { showToast('Pushed', 'Changes pushed to remote'); await refreshStatus(); }
    else showWarningToast('Push failed', 'Could not push to remote');
  }

  async function handleCommit() {
    const msg   = commitMessage().trim();
    const wtId  = activeWorktreeId();
    if (!msg || stagedFiles().length === 0 || !wtId) return;
    const ok = await gitCommit(wtId, msg);
    if (ok) {
      setCommitMessage('');
      await refreshStatus();
    } else {
      showWarningToast('Commit failed', 'Could not commit staged changes');
    }
  }

  const [aiGenerating, setAiGenerating] = createSignal(false);

  async function handleAiMessage() {
    const wtId = activeWorktreeId();
    if (!wtId || aiGenerating()) return;
    setAiGenerating(true);
    try {
      const msg = await (window as any).go.app.App.GenerateCommitMessage(wtId);
      if (msg) setCommitMessage(msg);
    } catch (err) {
      showWarningToast('AI failed', 'Could not generate commit message');
    } finally {
      setAiGenerating(false);
    }
  }

  async function handleFileClick(file: FileStatus) {
    const wtId = activeWorktreeId();
    if (!wtId) return;

    // Untracked files have no git history — just open in editor
    if (file.status === '?') {
      openFileInEditor({ workspaceId: wtId, filePath: file.path });
      return;
    }

    // Deleted files — show HEAD content vs empty
    if (file.status === 'D') {
      const originalContent = await getFileAtRevision(wtId, file.path, 'HEAD');
      showFileDiff({
        workspaceId: wtId,
        filePath: file.path,
        originalContent,
        modifiedContent: '',
        originalLabel: `${file.path} (HEAD)`,
        modifiedLabel: `${file.path} (deleted)`,
        readOnly: true,
      });
      return;
    }

    // Modified / Added / Renamed — show HEAD vs working copy
    // getFileAtRevision returns '' on error (new file not in HEAD) — that's fine
    const [originalContent, modifiedContent] = await Promise.all([
      getFileAtRevision(wtId, file.path, 'HEAD'),
      readFileContents(wtId, file.path),
    ]);
    console.log('[ChangesView] diff data:', file.path, 'original:', originalContent.length, 'bytes, modified:', modifiedContent.length, 'bytes');
    showFileDiff({
      workspaceId: wtId,
      filePath: file.path,
      originalContent,
      modifiedContent,
      originalLabel: originalContent ? `${file.path} (HEAD)` : '(new file)',
      modifiedLabel: `${file.path} (working copy)`,
      readOnly: true,
    });
  }

  const hasFiles = () => stagedFiles().length > 0 || unstagedFiles().length > 0;

  return (
    <Show
      when={hasFiles()}
      fallback={
        <div class={styles.emptyState}>
          <GitCommit size={24} />
          <span>No changes detected</span>
          <span class={styles.emptyStateHint}>
            Modified files will appear here
          </span>
        </div>
      }
    >
      <div class={styles.fileListContainer}>

        {/* ── Header bar ── */}
        <div class={styles.changesHeader}>
          <Show when={branchName()}>
            <Tip label={branchName()} placement="bottom">
              <span class={styles.branchLabel}>
                <GitBranch size={11} />
                <span class={styles.branchName}>{branchName()}</span>
              </span>
            </Tip>
          </Show>

          <div class={styles.headerActions}>
            <Tip label="Fetch & refresh" placement="bottom">
              <button
                type="button"
                class={styles.changesHeaderButton}
                onClick={() => refreshStatus(true)}
                disabled={syncing()}
              >
                <RefreshCw size={12} class={syncing() ? styles.spinning : undefined} />
              </button>
            </Tip>
            <Tip label={needsPull() ? `Pull — ${behindBy()} commit${behindBy() > 1 ? 's' : ''} behind` : 'Pull from remote'} placement="bottom">
              <button
                type="button"
                class={needsPull() ? styles.changesHeaderButtonActive : styles.changesHeaderButton}
                onClick={handlePull}
              >
                <ArrowDownFromLine size={12} />
                <Show when={needsPull()}>
                  <span class={styles.changesHeaderBadge}>{behindBy()}</span>
                </Show>
              </button>
            </Tip>
            <Tip label={needsPush() ? `Push — ${aheadBy()} commit${aheadBy() > 1 ? 's' : ''} ahead` : 'Push to remote'} placement="bottom">
              <button
                type="button"
                class={needsPush() ? styles.changesHeaderButtonActive : styles.changesHeaderButton}
                onClick={handlePush}
              >
                <ArrowUpFromLine size={12} />
                <Show when={needsPush()}>
                  <span class={styles.changesHeaderBadge}>{aheadBy()}</span>
                </Show>
              </button>
            </Tip>
          </div>
        </div>

        {/* ── Scrollable file list ── */}
        <div class={styles.scrollArea}>

          {/* Staged section */}
          <Show when={stagedFiles().length > 0}>
            <Collapsible open={stagedOpen()} onOpenChange={setStagedOpen}>
              <Collapsible.Trigger as="div" class={styles.sectionHeader}>
                <Show when={stagedOpen()} fallback={<ChevronRight size={12} class={styles.chevronIcon} />}>
                  <ChevronDown size={12} class={styles.chevronIcon} />
                </Show>
                <span class={styles.sectionLabelStaged}>
                  STAGED ({stagedFiles().length})
                </span>
                <div class={styles.sectionActions} onClick={(e) => e.stopPropagation()}>
                  <Tip label="Unstage all" placement="bottom">
                    <button
                      type="button"
                      class={styles.sectionActionButton}
                      onClick={handleUnstageAll}
                    >
                      <Minus size={12} />
                    </button>
                  </Tip>
                </div>
              </Collapsible.Trigger>
              <Collapsible.Content>
                <For each={stagedFiles()}>
                  {(file) => (
                    <StagedFileRow file={file} onUnstage={handleUnstage} onFileClick={handleFileClick} />
                  )}
                </For>
              </Collapsible.Content>
            </Collapsible>
          </Show>

          {/* Unstaged / Changes section */}
          <Show when={unstagedFiles().length > 0}>
            <Collapsible open={changesOpen()} onOpenChange={setChangesOpen}>
              <Collapsible.Trigger as="div" class={styles.sectionHeader}>
                <Show when={changesOpen()} fallback={<ChevronRight size={12} class={styles.chevronIcon} />}>
                  <ChevronDown size={12} class={styles.chevronIcon} />
                </Show>
                <span class={styles.sectionLabelChanges}>
                  CHANGES ({unstagedFiles().length})
                </span>
                <div class={styles.sectionActions} onClick={(e) => e.stopPropagation()}>
                  <Tip label="Discard all" placement="bottom">
                    <button
                      type="button"
                      class={styles.sectionActionButton}
                      onClick={handleDiscardAll}
                    >
                      <Undo2 size={12} />
                    </button>
                  </Tip>
                  <Tip label="Stage all" placement="bottom">
                    <button
                      type="button"
                      class={styles.sectionActionButton}
                      onClick={handleStageAll}
                    >
                      <Plus size={12} />
                    </button>
                  </Tip>
                </div>
              </Collapsible.Trigger>
              <Collapsible.Content>
                <For each={unstagedFiles()}>
                  {(file) => (
                    <UnstagedFileRow
                      file={file}
                      onDiscard={handleDiscard}
                      onStage={handleStage}
                      onFileClick={handleFileClick}
                    />
                  )}
                </For>
              </Collapsible.Content>
            </Collapsible>
          </Show>

        </div>

        {/* ── Commit area (pinned bottom) ── */}
        <div class={`${styles.commitArea} ${styles.commitAreaPinned}`}>
          <TextField
            value={commitMessage()}
            onChange={setCommitMessage}
            class={styles.commitInput}
          >
            <TextField.TextArea
              placeholder="Commit message..."
              rows={4}
            />
          </TextField>
          <div class={styles.commitActions}>
            <button
              type="button"
              class={`${styles.aiButton} ${aiGenerating() ? styles.aiButtonGenerating : ''}`}
              onClick={handleAiMessage}
              disabled={stagedFiles().length === 0 || aiGenerating()}
              title="Generate commit message with AI"
            >
              <Sparkles size={12} />
              {aiGenerating() ? 'Generating...' : 'Generate with AI'}
            </button>
            <button
              type="button"
              class={styles.commitButton}
              onClick={handleCommit}
              disabled={!commitMessage().trim() || stagedFiles().length === 0 || aiGenerating()}
              title={stagedFiles().length === 0 ? 'Stage changes first' : 'Commit staged changes'}
            >
              <GitCommit size={12} />
              Commit
            </button>
          </div>
        </div>

      </div>
    </Show>
  );
}
