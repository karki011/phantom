// PhantomOS v2 — Git changes view with staged/unstaged sections and commit UI
// Author: Subash Karki

import { For, Show } from 'solid-js';
import { GitCommit, Sparkles, Plus, Minus, FileQuestion, FilePen } from 'lucide-solid';
import * as styles from '@/styles/right-sidebar.css';
import {
  stagedChanges,
  unstagedChanges,
  gitChanges,
  setGitChanges,
  commitMessage,
  setCommitMessage,
  type GitChange,
} from '@/core/signals/files';

// ── Status badge for changes ──────────────────────────────────────────────────

function StatusIcon(props: { status: string; staged: boolean }) {
  const iconProps = { size: 12 };
  switch (props.status) {
    case 'added':    return <Plus {...iconProps} class={styles.gitBadgeA} />;
    case 'deleted':  return <Minus {...iconProps} class={styles.gitBadgeD} />;
    case 'modified': return <FilePen {...iconProps} class={styles.gitBadgeM} />;
    default:         return <FileQuestion {...iconProps} class={styles.gitBadgeQ} />;
  }
}

// ── Toggle stage/unstage ──────────────────────────────────────────────────────

function toggleStaged(path: string) {
  setGitChanges((prev) =>
    prev.map((c) => (c.path === path ? { ...c, staged: !c.staged } : c)),
  );
}

// ── Single change item ────────────────────────────────────────────────────────

function ChangeItem(props: { change: GitChange }) {
  return (
    <div class={styles.changeItem}>
      <input
        type="checkbox"
        class={styles.changeCheckbox}
        checked={props.change.staged}
        onChange={() => toggleStaged(props.change.path)}
        title={props.change.staged ? 'Unstage' : 'Stage'}
      />
      <StatusIcon status={props.change.status} staged={props.change.staged} />
      <span class={styles.changeFilePath} title={props.change.path}>
        {props.change.path.split('/').pop() ?? props.change.path}
      </span>
    </div>
  );
}

// ── Changes view ──────────────────────────────────────────────────────────────

export function ChangesView() {
  async function handleCommit() {
    const msg = commitMessage().trim();
    if (!msg || stagedChanges().length === 0) return;
    // Stub: real implementation will call the git commit binding
    console.info('[PhantomOS] Commit stub — message:', msg);
    setCommitMessage('');
  }

  function handleAiMessage() {
    // Stub: real implementation will call an AI binding to generate commit message
    console.info('[PhantomOS] AI commit message stub');
  }

  return (
    <Show
      when={gitChanges().length > 0}
      fallback={
        <div class={styles.emptyState}>
          <GitCommit size={24} />
          <span>No changes detected</span>
          <span style={{ 'font-size': '10px', opacity: '0.6' }}>
            Modified files will appear here
          </span>
        </div>
      }
    >
      <div style={{ display: 'flex', 'flex-direction': 'column', flex: '1' }}>
        {/* Staged section */}
        <Show when={stagedChanges().length > 0}>
          <div class={styles.changesSection}>
            <div class={styles.changesSectionHeader}>
              Staged ({stagedChanges().length})
            </div>
            <For each={stagedChanges()}>
              {(change) => <ChangeItem change={change} />}
            </For>
          </div>
        </Show>

        {/* Unstaged section */}
        <Show when={unstagedChanges().length > 0}>
          <div class={styles.changesSection}>
            <div class={styles.changesSectionHeader}>
              Unstaged ({unstagedChanges().length})
            </div>
            <For each={unstagedChanges()}>
              {(change) => <ChangeItem change={change} />}
            </For>
          </div>
        </Show>

        {/* Commit area */}
        <div style={{ 'margin-top': 'auto' }}>
          <div class={styles.commitArea}>
            <textarea
              class={styles.commitInput}
              placeholder="Commit message..."
              value={commitMessage()}
              onInput={(e) => setCommitMessage(e.currentTarget.value)}
              rows={3}
            />
            <div class={styles.commitActions}>
              <button
                type="button"
                class={styles.aiButton}
                onClick={handleAiMessage}
                title="Generate commit message with AI"
              >
                <Sparkles size={12} />
                AI
              </button>
              <button
                type="button"
                class={styles.commitButton}
                onClick={handleCommit}
                disabled={!commitMessage().trim() || stagedChanges().length === 0}
                title={stagedChanges().length === 0 ? 'Stage changes first' : 'Commit staged changes'}
              >
                <GitCommit size={12} />
                Commit
              </button>
            </div>
          </div>
        </div>
      </div>
    </Show>
  );
}
