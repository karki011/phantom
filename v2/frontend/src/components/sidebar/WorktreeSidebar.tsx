// Phantom — Left sidebar: project/worktree navigation
// Author: Subash Karki

import { For, Show, onMount, onCleanup, createSignal, createMemo } from 'solid-js';
import { Collapsible } from '@kobalte/core/collapsible';
import { LeftRail } from './LeftRail';
import { ChevronsLeft, ChevronsDownUp, ChevronsUpDown, ChevronRight, FolderGit2, FolderPlus, GitBranch, HardDriveDownload, Settings2, Star } from 'lucide-solid';
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
  loadProjectWorktrees,
  expandedProjects,
  setAllProjectsExpanded,
} from '@/core/signals/worktrees';
import { projects, starredProjects } from '@/core/signals/projects';
import { addProject, browseDirectory, cloneRepository, isGitRepo, initGitRepo } from '@/core/bindings';
import { showWarningToast } from '@/shared/Toast/Toast';
import { refreshProjects } from '@/core/signals/projects';
import { ProjectSection } from './ProjectSection';
import { ResizeHandle } from './ResizeHandle';
import { LiveSessionSection } from './LiveSessionSection';
import { bootstrapLiveSessions, cleanupLiveSessions } from '@/core/signals/live-sessions';

export function WorktreeSidebar() {
  // Gate the width transition until after the first frame so the initial
  // render (boot with sidebar already expanded) doesn't animate from 0.
  const [mounted, setMounted] = createSignal(false);
  onMount(() => {
    bootstrapWorktrees();
    bootstrapLiveSessions();
    requestAnimationFrame(() => setMounted(true));
  });
  onCleanup(cleanupLiveSessions);

  const allProjectsExpanded = () => expandedProjects().size >= projects().length;

  const [gitInitPath, setGitInitPath] = createSignal('');
  const gitInitOpen = () => gitInitPath() !== '';
  const [favoritesCollapsed, setFavoritesCollapsed] = createSignal(false);
  const [projectsCollapsed, setProjectsCollapsed] = createSignal(false);

  // Split filtered projects into favorites and the rest
  const starredIds = createMemo(() => new Set(starredProjects().map((p) => p.id)));
  const favoriteProjects = createMemo(() =>
    filteredProjects()
      .filter((p) => starredIds().has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );
  const otherProjects = createMemo(() =>
    filteredProjects()
      .filter((p) => !starredIds().has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name)),
  );

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
    const project = await addProject(path);
    await refreshProjects();
    if (project) await loadProjectWorktrees(project.id);
  }

  async function handleConfirmGitInit() {
    const path = gitInitPath();
    setGitInitPath('');
    await initGitRepo(path);
    const project = await addProject(path);
    await refreshProjects();
    if (project) await loadProjectWorktrees(project.id);
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
    try {
      const project = await cloneRepository(url, dest);
      await refreshProjects();
      if (project) await loadProjectWorktrees(project.id);
    } catch (err) {
      showWarningToast('Clone failed', String(err));
    }
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

        <LiveSessionSection />

        {/* Project list — split into Favorites and Projects */}
        <div class={styles.projectList}>
          <Show when={favoriteProjects().length > 0}>
            <Collapsible
              open={!favoritesCollapsed()}
              onOpenChange={(open) => setFavoritesCollapsed(!open)}
              class={styles.sidebarSection}
            >
              <Collapsible.Trigger class={styles.sidebarSectionHeader}>
                <ChevronRight size={10} class={styles.sidebarChevron} />
                <Star size={10} />
                <span>Favorites</span>
                <span class={styles.sectionCount}>{favoriteProjects().length}</span>
              </Collapsible.Trigger>
              <Collapsible.Content class={styles.sidebarSectionContent}>
                <For each={favoriteProjects()}>
                  {(project) => <ProjectSection project={project} />}
                </For>
              </Collapsible.Content>
            </Collapsible>
          </Show>

          <Collapsible
            open={!projectsCollapsed()}
            onOpenChange={(open) => setProjectsCollapsed(!open)}
            class={styles.sidebarSection}
          >
            <Collapsible.Trigger class={styles.sidebarSectionHeader}>
              <ChevronRight size={10} class={styles.sidebarChevron} />
              <FolderGit2 size={10} />
              <span>Projects</span>
              <span class={styles.sectionCount}>{otherProjects().length}</span>
            </Collapsible.Trigger>
            <Collapsible.Content class={styles.sidebarSectionContent}>
              <For each={otherProjects()}>
                {(project) => <ProjectSection project={project} />}
              </For>
            </Collapsible.Content>
          </Collapsible>
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
          <Show when={projects().length >= 2}>
            <Tip label={allProjectsExpanded() ? 'Collapse all' : 'Expand all'}>
              <button
                class={`${styles.actionButton} ${styles.actionButtonCompact}`}
                type="button"
                onClick={() => setAllProjectsExpanded(!allProjectsExpanded())}
                aria-label={allProjectsExpanded() ? 'Collapse all projects' : 'Expand all projects'}
              >
                {allProjectsExpanded() ? <ChevronsDownUp size={14} /> : <ChevronsUpDown size={14} />}
              </button>
            </Tip>
          </Show>
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
