// Author: Subash Karki

import { For, Show, createSignal, onMount, type Accessor } from 'solid-js';
import type { Project, Workspace, WorktreeStatus, Recipe, Session } from '../../../core/types';
import { listWorktrees, getAllWorktreeStatus, getProjectRecipes } from '../../../core/bindings';
import { getPref, setPref } from '../../../core/signals/preferences';
import { RecipeActions } from './RecipeActions';
import * as styles from './ProjectTree.css';

interface ProjectTreeProps {
  projects: Accessor<Project[]>;
  sessions: Accessor<Session[]>;
  selectedProjectId: Accessor<string | null>;
  setSelectedProjectId: (id: string | null) => void;
  selectedWorktree: Accessor<string | null>;
  setSelectedWorktree: (path: string | null) => void;
}

export function ProjectTree(props: ProjectTreeProps) {
  const [worktrees, setWorktrees] = createSignal<Record<string, Workspace[]>>({});
  const [worktreeStatuses, setWorktreeStatuses] = createSignal<Record<string, WorktreeStatus>>({});
  const [recipes, setRecipes] = createSignal<Record<string, Recipe[]>>({});
  const [pinnedRecipes, setPinnedRecipes] = createSignal<Record<string, string[]>>({});

  const sorted = () =>
    [...props.projects()].sort((a, b) => {
      const aStarred = a.starred ?? 0;
      const bStarred = b.starred ?? 0;
      if (aStarred !== bStarred) return bStarred - aStarred;
      return a.name.localeCompare(b.name);
    });

  onMount(async () => {
    const statuses = await getAllWorktreeStatus();
    const statusMap: Record<string, WorktreeStatus> = {};
    for (const s of statuses) {
      statusMap[s.path] = s;
    }
    setWorktreeStatuses(statusMap);
  });

  async function loadProjectData(projectId: string) {
    if (worktrees()[projectId]) return;

    const [wts, recs] = await Promise.all([
      listWorktrees(projectId),
      getProjectRecipes(projectId),
    ]);
    setWorktrees((prev) => ({ ...prev, [projectId]: wts }));
    setRecipes((prev) => ({ ...prev, [projectId]: recs }));

    const pinJson = getPref(`pinned_recipes:${projectId}`);
    if (pinJson) {
      try {
        const ids = JSON.parse(pinJson) as string[];
        setPinnedRecipes((prev) => ({ ...prev, [projectId]: ids }));
      } catch { /* ignore */ }
    }
  }

  function handleProjectClick(projectId: string) {
    if (props.selectedProjectId() === projectId) {
      props.setSelectedProjectId(null);
      props.setSelectedWorktree(null);
    } else {
      props.setSelectedProjectId(projectId);
      props.setSelectedWorktree(null);
      loadProjectData(projectId);
    }
  }

  function handleWorktreeClick(path: string) {
    if (props.selectedWorktree() === path) {
      props.setSelectedWorktree(null);
    } else {
      props.setSelectedWorktree(path);
    }
  }

  function sessionCountForWorktree(worktreePath: string | null): number {
    if (!worktreePath) return 0;
    return props.sessions().filter((s) => s.cwd === worktreePath).length;
  }

  function sessionCountForProject(project: Project): number {
    return props.sessions().filter((s) => s.repo === project.repo_path).length;
  }

  function worktreeStatusIndicator(path: string | null): { symbol: string; class: string } {
    if (!path) return { symbol: '?', class: '' };
    const status = worktreeStatuses()[path];
    if (!status) return { symbol: '●', class: styles.worktreeStatusClean };
    if (status.has_conflicts) return { symbol: '✕', class: styles.worktreeStatusConflict };
    if (!status.is_clean) return { symbol: '◐', class: styles.worktreeStatusDirty };
    return { symbol: '●', class: styles.worktreeStatusClean };
  }

  function handleTogglePin(projectId: string, recipeId: string) {
    setPinnedRecipes((prev) => {
      const current = prev[projectId] ?? [];
      const next = current.includes(recipeId)
        ? current.filter((id) => id !== recipeId)
        : [...current, recipeId];
      void setPref(`pinned_recipes:${projectId}`, JSON.stringify(next));
      return { ...prev, [projectId]: next };
    });
  }

  function handleRunRecipe(_recipe: Recipe) {
    // Terminal creation wiring — out of scope for Command Center v1
  }

  return (
    <div class={styles.container}>
      <div class={styles.header} onClick={() => { props.setSelectedProjectId(null); props.setSelectedWorktree(null); }}>
        <span class={styles.headerTitle}>All Projects</span>
        <span class={styles.headerCount}>({props.projects().length})</span>
      </div>
      <div class={styles.list}>
        <For each={sorted()}>
          {(project) => {
            const isSelected = () => props.selectedProjectId() === project.id;
            const projectWorktrees = () => worktrees()[project.id] ?? [];
            const projectRecipes = () => recipes()[project.id] ?? [];
            const projectPins = () => pinnedRecipes()[project.id] ?? [];

            return (
              <div>
                <div
                  class={styles.projectItem}
                  classList={{ [styles.projectItemSelected]: isSelected() }}
                  style={project.color ? { 'border-left-color': isSelected() ? project.color : 'transparent' } : {}}
                  onClick={() => handleProjectClick(project.id)}
                >
                  <div class={styles.projectName}>
                    <Show when={(project.starred ?? 0) > 0}>
                      <span class={styles.starIcon}>★</span>
                    </Show>
                    {project.name}
                  </div>
                  <div class={styles.projectMeta}>
                    {project.profile ?? 'unknown'} · {sessionCountForProject(project)} sessions
                  </div>
                </div>
                <Show when={isSelected()}>
                  <div class={styles.expandedContent}>
                    <Show when={projectWorktrees().length > 0}>
                      <span class={styles.sectionLabel}>Worktrees</span>
                      <For each={projectWorktrees()}>
                        {(wt) => {
                          const status = () => worktreeStatusIndicator(wt.worktree_path);
                          const sessCount = () => sessionCountForWorktree(wt.worktree_path);
                          const isWtSelected = () => props.selectedWorktree() === wt.worktree_path;
                          return (
                            <div
                              class={styles.worktreeRow}
                              classList={{ [styles.worktreeRowSelected]: isWtSelected() }}
                              onClick={() => handleWorktreeClick(wt.worktree_path!)}
                            >
                              <span class={status().class}>{status().symbol}</span>
                              <span class={styles.worktreeName}>{wt.branch}</span>
                              <Show when={sessCount() > 0}>
                                <span class={styles.worktreeSessionCount}>{sessCount()}s</span>
                              </Show>
                            </div>
                          );
                        }}
                      </For>
                    </Show>
                    <Show when={projectRecipes().length > 0}>
                      <RecipeActions
                        recipes={projectRecipes()}
                        pinnedIds={projectPins()}
                        onTogglePin={(id) => handleTogglePin(project.id, id)}
                        onRun={handleRunRecipe}
                      />
                    </Show>
                  </div>
                </Show>
              </div>
            );
          }}
        </For>
      </div>
    </div>
  );
}
