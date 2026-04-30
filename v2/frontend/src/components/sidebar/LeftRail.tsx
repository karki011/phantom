// Phantom — Left Identity Rail (44px collapsed sidebar)
// Author: Subash Karki

import { Show, For, createMemo, createSignal } from 'solid-js';
import { Popover } from '@kobalte/core/popover';
import {
  ChevronsRight,
  FolderPlus,
  GitBranch,
  HardDriveDownload,
  Settings2,
} from 'lucide-solid';
import { Tip } from '@/shared/Tip/Tip';
import { CloneDialog } from '@/shared/CloneDialog/CloneDialog';
import { ScanResultsDialog } from '@/shared/ScanResultsDialog/ScanResultsDialog';
import { ManageProjectsDialog } from '@/shared/ManageProjectsDialog/ManageProjectsDialog';
import { PhantomModal, phantomModalStyles } from '@/shared/PhantomModal/PhantomModal';
import { buttonRecipe } from '@/styles/recipes.css';
import {
  activeProject,
  activeWorktree,
  worktreeMap,
  statusMap,
  setLeftSidebarCollapsed,
  selectWorktree,
  bootstrapWorktrees,
} from '@/core/signals/worktrees';
import { addProject, browseDirectory, cloneRepository, isGitRepo, initGitRepo } from '@/core/bindings';
import { refreshProjects, starredProjects } from '@/core/signals/projects';
import { sessions } from '@/core/signals/sessions';
import { showWarningToast } from '@/shared/Toast/Toast';
import { projectGlyph, branchChip } from '@/core/sidebar/glyph';
import type { Project, Workspace } from '@/core/types';
import * as styles from '@/styles/sidebar-rail.css';

export function LeftRail() {
  const project = activeProject;
  const worktree = activeWorktree;

  const projectWorktrees = createMemo(() => {
    const p = project();
    if (!p) return [];
    return worktreeMap()[p.id] ?? [];
  });

  const branchTooltip = createMemo(() => {
    const wt = worktree();
    if (!wt) return '';
    const path = wt.worktree_path;
    const status = path ? statusMap()[path] : undefined;
    if (!status) return wt.branch;
    if (status.ahead_by === 0 && status.behind_by === 0) {
      return `${wt.branch} · clean`;
    }
    const parts: string[] = [];
    if (status.ahead_by > 0) parts.push(`${status.ahead_by} ahead`);
    if (status.behind_by > 0) parts.push(`${status.behind_by} behind`);
    return `${wt.branch} · ${parts.join(', ')}`;
  });

  function expandSidebar() {
    setLeftSidebarCollapsed(false);
  }

  // ── Project stack (starred + always-show-active) ──────────────────────────
  // Build the visible stack: prepend the active project if it isn't starred.
  const stackProjects = createMemo<Project[]>(() => {
    const starred = starredProjects();
    const active = project();
    if (!active) return starred;
    if (starred.some((p) => p.id === active.id)) return starred;
    return [active, ...starred];
  });

  const activeSessions = () => sessions().filter(
    (s) => s.status === 'active' || s.status === 'running',
  );

  function projectHasLiveSession(projectId: string): boolean {
    const wts = worktreeMap()[projectId] ?? [];
    if (wts.length === 0) return false;
    const sess = activeSessions();
    return wts.some((wt) => {
      const path = wt.worktree_path;
      if (!path) return false;
      return sess.some((s) => s.cwd?.startsWith(path) || s.repo === path);
    });
  }

  function projectTooltipFor(p: Project): string {
    const count = (worktreeMap()[p.id] ?? []).length;
    const base = `${p.name} · ${count} worktree${count === 1 ? '' : 's'}`;
    return projectHasLiveSession(p.id) ? `${base} · live` : base;
  }

  function handleStackWorktreeClick(wtId: string) {
    selectWorktree(wtId);
  }

  // ── Bottom action handlers (mirrored from WorktreeSidebar.tsx) ────────────
  const [gitInitPath, setGitInitPath] = createSignal('');
  const gitInitOpen = () => gitInitPath() !== '';
  const [scanOpen, setScanOpen] = createSignal(false);
  const [scanParent, setScanParent] = createSignal('');
  const [cloneOpen, setCloneOpen] = createSignal(false);
  const [manageOpen, setManageOpen] = createSignal(false);

  async function handleAddProject() {
    const path = await browseDirectory('Select project directory');
    if (!path) return;
    const hasGit = await isGitRepo(path);
    if (!hasGit) {
      setGitInitPath(path);
      return;
    }
    await addProject(path);
    await refreshProjects();
    await bootstrapWorktrees();
  }

  async function handleConfirmGitInit() {
    const path = gitInitPath();
    setGitInitPath('');
    await initGitRepo(path);
    await addProject(path);
    await refreshProjects();
    await bootstrapWorktrees();
  }

  async function handleScanDirectory() {
    const parent = await browseDirectory('Select directory to scan');
    if (!parent) return;
    setScanParent(parent);
    setScanOpen(true);
  }

  async function handleCloneSubmit(url: string) {
    const dest = await browseDirectory('Select destination directory');
    if (!dest) return;
    try {
      await cloneRepository(url, dest);
      await refreshProjects();
      await bootstrapWorktrees();
    } catch (err) {
      showWarningToast('Clone failed', String(err));
    }
  }

  return (
    <aside class={styles.leftRail} aria-label="Collapsed sidebar rail">
      {/* Explicit expand chevron (mirrors Cmd+B keyboard shortcut) */}
      <Tip label="Expand sidebar" placement="right">
        <button
          type="button"
          class={styles.railChevron}
          onClick={expandSidebar}
          aria-label="Expand sidebar"
        >
          <ChevronsRight size={14} />
        </button>
      </Tip>

      {/* Starred projects stack (Slack-rail style) */}
      <Show when={stackProjects().length > 0}>
        <div class={styles.projectStack}>
          <For each={stackProjects()}>
            {(p) => {
              const isActive = () => project()?.id === p.id;
              const projectWts = (): Workspace[] => worktreeMap()[p.id] ?? [];
              const live = () => projectHasLiveSession(p.id);

              return (
                <Show
                  when={!isActive()}
                  fallback={
                    <Tip label={projectTooltipFor(p)} placement="right">
                      <div
                        class={`${styles.projectGlyphCircle} ${styles.projectGlyphActive}`}
                        aria-label={`${p.name} (active)`}
                      >
                        {projectGlyph(p.name)}
                        <Show when={live()}>
                          <span class={styles.projectGlyphLive} aria-hidden="true" />
                        </Show>
                      </div>
                    </Tip>
                  }
                >
                  <Popover placement="right-start">
                    <Tip label={projectTooltipFor(p)} placement="right">
                      <Popover.Trigger
                        class={styles.projectGlyphCircle}
                        aria-label={`Open ${p.name} worktrees`}
                      >
                        {projectGlyph(p.name)}
                        <Show when={live()}>
                          <span class={styles.projectGlyphLive} aria-hidden="true" />
                        </Show>
                      </Popover.Trigger>
                    </Tip>
                    <Popover.Portal>
                      <Popover.Content class={styles.popoverContent}>
                        <div class={styles.popoverHeader}>{p.name}</div>
                        <Show
                          when={projectWts().length > 0}
                          fallback={<div class={styles.popoverEmpty}>No worktrees</div>}
                        >
                          <For each={projectWts()}>
                            {(w) => (
                              <button
                                type="button"
                                class={styles.popoverItem}
                                onClick={() => handleStackWorktreeClick(w.id)}
                              >
                                <span>{w.branch}</span>
                                <span class={styles.popoverItemMeta}>{w.type}</span>
                              </button>
                            )}
                          </For>
                        </Show>
                      </Popover.Content>
                    </Popover.Portal>
                  </Popover>
                </Show>
              );
            }}
          </For>
        </div>
        <div class={styles.divider} />
      </Show>

      {/* Branch chip (worktree switcher for the active project) */}
      <Show when={worktree()}>
        {(wt) => (
          <Popover placement="right-start">
            <Tip label={branchTooltip()} placement="right">
              <Popover.Trigger
                class={styles.branchChipButton}
                aria-label={`Switch worktree (current: ${wt().branch})`}
              >
                {branchChip(wt().branch)}
              </Popover.Trigger>
            </Tip>
            <Popover.Portal>
              <Popover.Content class={styles.popoverContent}>
                <div class={styles.popoverHeader}>Worktrees</div>
                <Show
                  when={projectWorktrees().length > 0}
                  fallback={<div class={styles.popoverEmpty}>No worktrees</div>}
                >
                  <For each={projectWorktrees()}>
                    {(w) => (
                      <button
                        type="button"
                        class={`${styles.popoverItem} ${w.id === wt().id ? styles.popoverItemActive : ''}`}
                        onClick={() => selectWorktree(w.id)}
                      >
                        <span>{w.branch}</span>
                        <span class={styles.popoverItemMeta}>{w.type}</span>
                      </button>
                    )}
                  </For>
                </Show>
              </Popover.Content>
            </Popover.Portal>
          </Popover>
        )}
      </Show>

      <div class={styles.divider} />

      <div class={styles.bottomGroup}>
        <Tip label="Add project" placement="right">
          <button type="button" class={styles.iconButton} onClick={handleAddProject}>
            <FolderPlus size={16} />
          </button>
        </Tip>
        <Tip label="Scan directory" placement="right">
          <button type="button" class={styles.iconButton} onClick={handleScanDirectory}>
            <GitBranch size={16} />
          </button>
        </Tip>
        <Tip label="Clone repo" placement="right">
          <button type="button" class={styles.iconButton} onClick={() => setCloneOpen(true)}>
            <HardDriveDownload size={16} />
          </button>
        </Tip>
        <Tip label="Manage projects" placement="right">
          <button type="button" class={styles.iconButton} onClick={() => setManageOpen(true)}>
            <Settings2 size={16} />
          </button>
        </Tip>
      </div>

      <CloneDialog open={cloneOpen} onOpenChange={setCloneOpen} onClone={handleCloneSubmit} />
      <ScanResultsDialog open={scanOpen} onOpenChange={setScanOpen} parentPath={scanParent} />
      <ManageProjectsDialog open={manageOpen} onOpenChange={setManageOpen} />

      <PhantomModal
        open={gitInitOpen}
        onOpenChange={(open) => { if (!open) setGitInitPath(''); }}
        title="No Git Repository Found"
        description={`The directory "${gitInitPath().split('/').pop()}" does not contain a git repository. Would you like to initialize one?`}
        size="sm"
      >
        <div class={phantomModalStyles.actions}>
          <button type="button" class={buttonRecipe({ variant: 'ghost', size: 'md' })} onClick={() => setGitInitPath('')}>
            Cancel
          </button>
          <button type="button" class={buttonRecipe({ variant: 'primary', size: 'md' })} onClick={handleConfirmGitInit}>
            Initialize Git
          </button>
        </div>
      </PhantomModal>
    </aside>
  );
}
