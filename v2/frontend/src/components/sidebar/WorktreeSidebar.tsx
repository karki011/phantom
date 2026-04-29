// PhantomOS v2 — Left sidebar: project/worktree navigation
// Author: Subash Karki

import { For, onMount, createSignal } from 'solid-js';
import { LeftRail } from './LeftRail';
import { ChevronsLeft, FolderPlus, GitBranch, HardDriveDownload, Settings2 } from 'lucide-solid';
import { TextField } from '@kobalte/core/text-field';
import { Tip } from '@/shared/Tip/Tip';
import { PhantomModal, phantomModalStyles } from '@/shared/PhantomModal/PhantomModal';
import { buttonRecipe } from '@/styles/recipes.css';
import { CloneDialog } from '@/shared/CloneDialog/CloneDialog';
import { ScanResultsDialog } from '@/shared/ScanResultsDialog/ScanResultsDialog';
import { ManageProjectsDialog } from '@/shared/ManageProjectsDialog/ManageProjectsDialog';
import * as styles from '@/styles/sidebar.css';
import * as containerStyles from '@/styles/sidebar-animated-container.css';
import {
  filteredProjects,
  sidebarSearch,
  setSidebarSearch,
  leftSidebarWidth,
  leftSidebarCollapsed,
  setLeftSidebarCollapsed,
  isLeftResizing,
  bootstrapWorktrees,
} from '@/core/signals/worktrees';
import { addProject, browseDirectory, cloneRepository, isGitRepo, initGitRepo } from '@/core/bindings';
import { showWarningToast } from '@/shared/Toast/Toast';
import { refreshProjects } from '@/core/signals/projects';
import { ProjectSection } from './ProjectSection';
import { ResizeHandle } from './ResizeHandle';

export function WorktreeSidebar() {
  // Gate the width transition until after the first frame so the initial
  // render (boot with sidebar already expanded) doesn't animate from 0.
  const [mounted, setMounted] = createSignal(false);
  onMount(() => {
    bootstrapWorktrees();
    requestAnimationFrame(() => setMounted(true));
  });


  const [gitInitPath, setGitInitPath] = createSignal('');
  const gitInitOpen = () => gitInitPath() !== '';

  async function handleAddProject() {
    const path = await browseDirectory('Select project directory');
    if (!path) return;
    const alreadyExists = filteredProjects().some((p) => p.repo_path === path);
    if (alreadyExists) {
      showWarningToast('Already added', `"${path.split('/').pop()}" is already in your projects`);
      return;
    }
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

  const [scanOpen, setScanOpen] = createSignal(false);
  const [scanParent, setScanParent] = createSignal('');

  async function handleScanDirectory() {
    const parent = await browseDirectory('Select directory to scan');
    if (!parent) return;
    setScanParent(parent);
    setScanOpen(true);
  }

  const [cloneOpen, setCloneOpen] = createSignal(false);
  const [manageOpen, setManageOpen] = createSignal(false);

  async function handleCloneSubmit(url: string) {
    const dest = await browseDirectory('Select destination directory');
    if (!dest) return;
    await cloneRepository(url, dest);
    await refreshProjects();
    await bootstrapWorktrees();
  }

  const collapsed = () => leftSidebarCollapsed();
  const containerWidth = () => (collapsed() ? 44 : leftSidebarWidth());

  return (
    <div
      class={containerStyles.animatedContainer}
      data-tour="sidebar-worktree"
      style={{ width: `${containerWidth()}px` }}
      data-mounted={mounted() ? 'true' : 'false'}
      data-resizing={isLeftResizing() ? 'true' : 'false'}
    >
      {/* Rail layer (collapsed) — always mounted, fades in/out */}
      <div class={containerStyles.fadeLayer} data-active={collapsed() ? 'true' : 'false'} aria-hidden={!collapsed()}>
        <LeftRail />
      </div>

      {/* Expanded layer — always mounted, fades in/out */}
      <div class={containerStyles.fadeLayer} data-active={!collapsed() ? 'true' : 'false'} aria-hidden={collapsed()}>
      <div
        class={styles.sidebar}
        style={{ width: '100%' }}
      >
        {/* Search input + collapse chevron */}
        <div class={styles.searchWrapper} style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
          <TextField value={sidebarSearch()} onChange={setSidebarSearch} class={styles.searchInput}>
            <TextField.Input
              class={styles.searchInputField}
              placeholder="Search projects & branches…"
              aria-label="Search projects and branches"
            />
          </TextField>
          <Tip label="Collapse sidebar (Cmd+B)">
            <button
              type="button"
              class={`${styles.actionButton} ${styles.actionButtonCompact}`}
              onClick={() => setLeftSidebarCollapsed(true)}
              aria-label="Collapse sidebar"
            >
              <ChevronsLeft size={14} />
            </button>
          </Tip>
        </div>

        {/* Project list */}
        <div class={styles.projectList}>
          <For each={filteredProjects()}>
            {(project) => <ProjectSection project={project} />}
          </For>
        </div>

        {/* Bottom actions */}
        <div class={styles.actions} data-tour="sidebar-actions">
          <Tip label="Add project">
            <button
              class={`${styles.actionButton} ${styles.actionButtonCompact}`}
              type="button"
              onClick={handleAddProject}
            >
              <FolderPlus size={14} />
            </button>
          </Tip>
          <Tip label="Scan directory">
            <button
              class={`${styles.actionButton} ${styles.actionButtonCompact}`}
              type="button"
              onClick={handleScanDirectory}
            >
              <GitBranch size={14} />
            </button>
          </Tip>
          <Tip label="Clone repo">
            <button
              class={`${styles.actionButton} ${styles.actionButtonCompact}`}
              type="button"
              onClick={() => setCloneOpen(true)}
            >
              <HardDriveDownload size={14} />
            </button>
          </Tip>
          <Tip label="Manage projects">
            <button
              class={`${styles.actionButton} ${styles.actionButtonCompact}`}
              type="button"
              onClick={() => setManageOpen(true)}
            >
              <Settings2 size={14} />
            </button>
          </Tip>
        </div>

        <ResizeHandle />

        <CloneDialog
          open={cloneOpen}
          onOpenChange={setCloneOpen}
          onClone={handleCloneSubmit}
        />

        <ScanResultsDialog
          open={scanOpen}
          onOpenChange={setScanOpen}
          parentPath={scanParent}
        />

        <ManageProjectsDialog
          open={manageOpen}
          onOpenChange={setManageOpen}
        />

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
      </div>
      </div>
    </div>
  );
}
