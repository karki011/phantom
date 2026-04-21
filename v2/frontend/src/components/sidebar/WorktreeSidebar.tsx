// PhantomOS v2 — Left sidebar: project/worktree navigation
// Author: Subash Karki

import { Show, For, onMount } from 'solid-js';
import { FolderPlus, GitBranch, HardDriveDownload } from 'lucide-solid';
import * as styles from '@/styles/sidebar.css';
import {
  filteredProjects,
  sidebarSearch,
  setSidebarSearch,
  leftSidebarWidth,
  leftSidebarCollapsed,
  bootstrapWorktrees,
} from '@/core/signals/worktrees';
import { addProject, browseDirectory, cloneRepository, scanDirectory } from '@/core/bindings';
import { refreshProjects } from '@/core/signals/projects';
import { ProjectSection } from './ProjectSection';
import { ResizeHandle } from './ResizeHandle';

export function WorktreeSidebar() {
  onMount(() => {
    bootstrapWorktrees();
  });

  async function handleAddProject() {
    const path = await browseDirectory('Select project directory');
    if (!path) return;
    await addProject(path);
    await refreshProjects();
    await bootstrapWorktrees();
  }

  async function handleScanDirectory() {
    const parent = await browseDirectory('Select directory to scan');
    if (!parent) return;
    const paths = await scanDirectory(parent);
    for (const p of paths) {
      await addProject(p);
    }
    await refreshProjects();
    await bootstrapWorktrees();
  }

  async function handleClone() {
    // Prompt is handled by the OS; for now open a browser-based URL dialog.
    // In a real flow this would open a modal — kept simple per KISS principle.
    const url = window.prompt('Repository URL to clone:');
    if (!url) return;
    const dest = await browseDirectory('Select destination directory');
    if (!dest) return;
    await cloneRepository(url, dest);
    await refreshProjects();
    await bootstrapWorktrees();
  }

  return (
    <Show when={!leftSidebarCollapsed()}>
      <div
        class={styles.sidebar}
        style={{ width: `${leftSidebarWidth()}px` }}
      >
        {/* Search input */}
        <div class={styles.searchWrapper}>
          <input
            class={styles.searchInput}
            type="text"
            placeholder="Search projects & branches…"
            value={sidebarSearch()}
            onInput={(e) => setSidebarSearch(e.currentTarget.value)}
          />
        </div>

        {/* Project list */}
        <div class={styles.projectList}>
          <For each={filteredProjects()}>
            {(project) => <ProjectSection project={project} />}
          </For>
        </div>

        {/* Bottom actions */}
        <div class={styles.actions}>
          <button
            class={styles.actionButton}
            type="button"
            onClick={handleAddProject}
            title="Add project"
          >
            <FolderPlus size={13} />
            Add
          </button>
          <button
            class={styles.actionButton}
            type="button"
            onClick={handleScanDirectory}
            title="Scan directory for repos"
          >
            <GitBranch size={13} />
            Scan
          </button>
          <button
            class={styles.actionButton}
            type="button"
            onClick={handleClone}
            title="Clone repository"
          >
            <HardDriveDownload size={13} />
            Clone
          </button>
        </div>

        <ResizeHandle />
      </div>
    </Show>
  );
}
