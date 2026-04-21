// PhantomOS v2 — Welcome page (no worktree selected)
// Author: Subash Karki

import * as styles from '@/styles/home.css';
import { buttonRecipe } from '@/styles/recipes.css';

export function WelcomePage() {
  return (
    <div class={styles.welcomeContainer}>
      <div class={styles.welcomeTitle}>PhantomOS</div>
      <div class={styles.welcomeSubtitle}>
        Select a project from the sidebar to get started, or add a new one.
      </div>
      <div class={styles.welcomeActions}>
        <button class={buttonRecipe({ variant: 'primary', size: 'md' })} type="button">
          Add Project
        </button>
        <button class={buttonRecipe({ variant: 'ghost', size: 'md' })} type="button">
          Clone Repository
        </button>
        <button class={buttonRecipe({ variant: 'ghost', size: 'md' })} type="button">
          Scan Directory
        </button>
      </div>
    </div>
  );
}
