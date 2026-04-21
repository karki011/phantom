// PhantomOS v2 — File tree view with lazy-loaded directories and git status badges
// Author: Subash Karki

import { For, Show, createSignal } from 'solid-js';
import { ChevronRight, Folder, FolderOpen, FileText } from 'lucide-solid';
import * as styles from '@/styles/right-sidebar.css';
import {
  fileTree,
  setFileTree,
  selectedFile,
  setSelectedFile,
  type FileNode,
} from '@/core/signals/files';

// ── Git badge ─────────────────────────────────────────────────────────────────

function GitBadge(props: { status: string }) {
  const badgeClass = () => {
    switch (props.status) {
      case 'M': return styles.gitBadgeM;
      case 'A': return styles.gitBadgeA;
      case 'D': return styles.gitBadgeD;
      case '?': return styles.gitBadgeQ;
      default: return styles.gitBadge;
    }
  };

  return (
    <Show when={props.status && props.status !== ''}>
      <span class={badgeClass()}>{props.status}</span>
    </Show>
  );
}

// ── File tree item (recursive) ────────────────────────────────────────────────

function FileTreeItem(props: { node: FileNode; depth: number }) {
  const [expanded, setExpanded] = createSignal(props.node.expanded ?? false);

  const indent = () => props.depth * 12;

  function handleClick() {
    if (props.node.isDir) {
      setExpanded((v) => !v);
      // Lazy load: if no children yet, the real implementation would call a binding here.
      // For now we just toggle the visual state.
    } else {
      setSelectedFile(props.node.path);
    }
  }

  const isSelected = () => !props.node.isDir && selectedFile() === props.node.path;

  return (
    <>
      <div
        class={`${styles.fileItem} ${props.node.isDir ? styles.fileItemDir : ''} ${isSelected() ? styles.fileItemSelected : ''}`}
        style={{ 'padding-left': `${indent() + 8}px` }}
        onClick={handleClick}
        title={props.node.path}
      >
        <Show
          when={props.node.isDir}
          fallback={<FileText size={14} class={styles.fileIcon} />}
        >
          <ChevronRight
            size={12}
            class={styles.fileIcon}
            style={{ transform: expanded() ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 150ms ease' }}
          />
          <Show when={expanded()} fallback={<Folder size={14} class={styles.fileIcon} />}>
            <FolderOpen size={14} class={styles.fileIcon} />
          </Show>
        </Show>

        <span class={styles.fileName}>{props.node.name}</span>

        <Show when={props.node.gitStatus}>
          <GitBadge status={props.node.gitStatus!} />
        </Show>
      </div>

      <Show when={props.node.isDir && expanded() && props.node.children?.length}>
        <For each={props.node.children}>
          {(child) => <FileTreeItem node={child} depth={props.depth + 1} />}
        </For>
      </Show>
    </>
  );
}

// ── Files view ────────────────────────────────────────────────────────────────

export function FilesView() {
  return (
    <Show
      when={fileTree().length > 0}
      fallback={
        <div class={styles.emptyState}>
          <FileText size={24} />
          <span>No files loaded</span>
          <span style={{ 'font-size': '10px', opacity: '0.6' }}>
            File tree will populate when a worktree is active
          </span>
        </div>
      }
    >
      <div class={styles.fileTree}>
        <For each={fileTree()}>
          {(node) => <FileTreeItem node={node} depth={0} />}
        </For>
      </div>
    </Show>
  );
}
