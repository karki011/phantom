// PhantomOS v2 — Welcome page (no worktree selected)
// Author: Subash Karki

import * as styles from '@/styles/home.css';
import { buttonRecipe } from '@/styles/recipes.css';
import { addProject, browseDirectory, cloneRepository, scanDirectory } from '@/core/bindings';
import { refreshProjects } from '@/core/signals/projects';
import { bootstrapWorktrees } from '@/core/signals/worktrees';

export function WelcomePage() {
  async function handleAddProject() {
    const path = await browseDirectory('Select project directory');
    if (!path) return;
    await addProject(path);
    await refreshProjects();
    await bootstrapWorktrees();
  }

  async function handleClone() {
    const url = window.prompt('Repository URL to clone:');
    if (!url) return;
    const dest = await browseDirectory('Select destination directory');
    if (!dest) return;
    await cloneRepository(url, dest);
    await refreshProjects();
    await bootstrapWorktrees();
  }

  async function handleScan() {
    const parent = await browseDirectory('Select directory to scan');
    if (!parent) return;
    const paths = await scanDirectory(parent);
    for (const p of paths) {
      await addProject(p);
    }
    await refreshProjects();
    await bootstrapWorktrees();
  }

  return (
    <div class={styles.welcomeContainer}>
      <div class={styles.welcomeTitle}>PhantomOS</div>
      <div class={styles.welcomeSubtitle}>
        Select a project from the sidebar to get started, or add a new one.
      </div>
      <div class={styles.welcomeActions}>
        <button class={buttonRecipe({ variant: 'primary', size: 'md' })} type="button" onClick={handleAddProject}>
          Add Project
        </button>
        <button class={buttonRecipe({ variant: 'ghost', size: 'md' })} type="button" onClick={handleClone}>
          Clone Repository
        </button>
        <button class={buttonRecipe({ variant: 'ghost', size: 'md' })} type="button" onClick={handleScan}>
          Scan Directory
        </button>
      </div>
    </div>
  );
}
