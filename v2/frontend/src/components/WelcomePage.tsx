// PhantomOS v2 — Welcome / Standby ceremony (no project selected)
// Author: Subash Karki

import { createSignal } from 'solid-js';
import { FolderPlus, GitBranch, ScanLine } from 'lucide-solid';
import * as styles from '@/styles/home.css';
import { APP_NAME_SPACED } from '@/core/branding';
import { addProject, browseDirectory, cloneRepository, scanDirectory } from '@/core/bindings';
import { refreshProjects } from '@/core/signals/projects';
import { bootstrapWorktrees } from '@/core/signals/worktrees';
import { CloneDialog } from '@/shared/CloneDialog/CloneDialog';
import { BootRings } from '@/screens/boot/BootRings';

interface ActionTile {
  label: string;
  hint: string;
  icon: typeof FolderPlus;
  primary?: boolean;
  onPress: () => void | Promise<void>;
}

export function WelcomePage() {
  const [cloneOpen, setCloneOpen] = createSignal(false);

  async function handleAddProject() {
    const path = await browseDirectory('Select project directory');
    if (!path) return;
    await addProject(path);
    await refreshProjects();
    await bootstrapWorktrees();
  }

  async function handleCloneSubmit(url: string) {
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

  const tiles: ActionTile[] = [
    {
      label: 'Add Project',
      hint: '// link existing repository',
      icon: FolderPlus,
      primary: true,
      onPress: handleAddProject,
    },
    {
      label: 'Clone',
      hint: '// fetch from remote',
      icon: GitBranch,
      onPress: () => {
        setCloneOpen(true);
      },
    },
    {
      label: 'Scan',
      hint: '// discover in directory',
      icon: ScanLine,
      onPress: handleScan,
    },
  ];

  return (
    <div class={styles.welcomeContainer}>
      <BootRings progress={0} total={3} />

      <div class={styles.welcomeStage}>
        <h1 class={styles.welcomeTitle}>{APP_NAME_SPACED}</h1>
        <p class={styles.welcomeSubtitle}>standby · awaiting target</p>
      </div>

      <div class={styles.welcomeActions} role="group" aria-label="Project actions">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <button
              type="button"
              class={`${styles.welcomeTile} ${tile.primary ? styles.welcomeTilePrimary : ''}`}
              onClick={() => void tile.onPress()}
            >
              <Icon size={22} class={styles.welcomeTileIcon} />
              <span class={styles.welcomeTileLabel}>{tile.label}</span>
              <span class={styles.welcomeTileHint}>{tile.hint}</span>
            </button>
          );
        })}
      </div>

      <div class={styles.welcomeBriefing}>
        <div class={styles.welcomeBriefingHeader}>
          <span>quick start</span>
          <span class={styles.welcomeBriefingRule} aria-hidden="true" />
        </div>
        <div class={styles.welcomeBriefingSteps}>
          <div class={styles.welcomeBriefingStep}>
            <span class={styles.welcomeBriefingIndex}>01</span>
            <span>add, clone, or scan to load a project</span>
          </div>
          <div class={styles.welcomeBriefingStep}>
            <span class={styles.welcomeBriefingIndex}>02</span>
            <span>worktrees appear in the left sidebar</span>
          </div>
          <div class={styles.welcomeBriefingStep}>
            <span class={styles.welcomeBriefingIndex}>03</span>
            <span>
              command palette
              <kbd class={styles.welcomeBriefingKbd}>⌘K</kbd>
            </span>
          </div>
          <div class={styles.welcomeBriefingStep}>
            <span class={styles.welcomeBriefingIndex}>04</span>
            <span>
              settings
              <kbd class={styles.welcomeBriefingKbd}>⌘,</kbd>
            </span>
          </div>
        </div>
      </div>

      <div class={styles.welcomeStatus}>
        <span>{'>'} no project loaded · select from sidebar or initiate above</span>
        <span class={styles.welcomeStatusCaret} aria-hidden="true" />
      </div>

      <CloneDialog
        open={cloneOpen}
        onOpenChange={setCloneOpen}
        onClone={handleCloneSubmit}
      />
    </div>
  );
}
