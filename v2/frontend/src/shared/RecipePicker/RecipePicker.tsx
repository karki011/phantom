// Phantom — Recipe picker dialog (Cmd+Shift+R)
// Author: Subash Karki

import { createSignal, createEffect, createMemo, on, onCleanup, Show, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Search, Plus, Trash2 } from 'lucide-solid';
import { recipePickerOpen, closeRecipePicker } from '@/core/signals/recipes';
import { activeWorktreeId } from '@/core/signals/app';
import { worktreeMap } from '@/core/signals/worktrees';
import { projects } from '@/core/signals/projects';
import { getAllRecipes, createCustomRecipe, deleteCustomRecipe, toggleRecipeFavorite } from '@/core/bindings';
import { addTabWithData } from '@/core/panes/signals';
import type { EnrichedRecipe } from '@/core/types';
import * as styles from './RecipePicker.css';

type RecipeCategory = 'all' | 'setup' | 'test' | 'lint' | 'build' | 'serve' | 'deploy' | 'custom';

const CATEGORIES: RecipeCategory[] = ['all', 'setup', 'test', 'lint', 'build', 'serve', 'deploy', 'custom'];

/**
 * Fuzzy-match a query against label + command.
 * Returns true if all query tokens appear in either field.
 */
const matchesQuery = (recipe: EnrichedRecipe, query: string): boolean => {
  if (!query.trim()) return true;
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const haystack = `${recipe.label} ${recipe.command}`.toLowerCase();
  return tokens.every((t) => haystack.includes(t));
};

export const RecipePicker = () => {
  let inputRef: HTMLInputElement | undefined;
  let listRef: HTMLDivElement | undefined;

  const [query, setQuery] = createSignal('');
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [activeCategory, setActiveCategory] = createSignal<RecipeCategory>('all');
  const [recipes, setRecipes] = createSignal<EnrichedRecipe[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [showCreateForm, setShowCreateForm] = createSignal(false);
  const [newLabel, setNewLabel] = createSignal('');
  const [newCommand, setNewCommand] = createSignal('');

  // Resolve active project from the active worktree
  const activeProject = createMemo(() => {
    const wtId = activeWorktreeId();
    if (!wtId) return null;
    for (const workspaces of Object.values(worktreeMap())) {
      const wt = workspaces.find((w) => w.id === wtId);
      if (wt) return projects().find((p) => p.id === wt.project_id) ?? null;
    }
    return null;
  });

  // Load recipes when the picker opens
  const loadRecipes = async () => {
    const proj = activeProject();
    if (!proj) return;
    setLoading(true);
    const data = await getAllRecipes(proj.id);
    setRecipes(data);
    setLoading(false);
  };

  // Filter + sort: favorites first, then by category, then alphabetically
  const filteredRecipes = createMemo(() => {
    const q = query();
    const cat = activeCategory();
    let list = recipes().filter((r) => matchesQuery(r, q));
    if (cat !== 'all') {
      list = list.filter((r) => r.category === cat);
    }

    // Favorites pinned to top
    const favs = list.filter((r) => r.favorite);
    const rest = list.filter((r) => !r.favorite);
    favs.sort((a, b) => a.label.localeCompare(b.label));
    rest.sort((a, b) => a.label.localeCompare(b.label));

    return [...favs, ...rest];
  });

  // Determine if there are favorites in the current view
  const hasFavorites = createMemo(() => filteredRecipes().some((r) => r.favorite));
  const favoritesEndIndex = createMemo(() => {
    const list = filteredRecipes();
    let i = 0;
    while (i < list.length && list[i].favorite) i++;
    return i;
  });

  // Reset state when picker opens
  createEffect(on(recipePickerOpen, (open) => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setActiveCategory('all');
      setShowCreateForm(false);
      setNewLabel('');
      setNewCommand('');
      loadRecipes();
      requestAnimationFrame(() => inputRef?.focus());
    }
  }));

  // Global Escape handler
  createEffect(() => {
    if (!recipePickerOpen()) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeRecipePicker();
      }
    };
    document.addEventListener('keydown', handler, true);
    onCleanup(() => document.removeEventListener('keydown', handler, true));
  });

  const handleInputKeydown = (e: KeyboardEvent) => {
    const count = filteredRecipes().length;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1) % Math.max(count, 1));
      scrollSelectedIntoView();
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => (i - 1 + Math.max(count, 1)) % Math.max(count, 1));
      scrollSelectedIntoView();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const selected = filteredRecipes()[selectedIndex()];
      if (selected) executeRecipe(selected);
      return;
    }
  };

  const scrollSelectedIntoView = () => {
    requestAnimationFrame(() => {
      listRef?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    });
  };

  const executeRecipe = (recipe: EnrichedRecipe) => {
    const proj = activeProject();
    if (!proj) return;

    closeRecipePicker();

    addTabWithData('terminal', recipe.label, {
      cwd: proj.repo_path,
      command: recipe.command,
    });
  };

  const handleToggleFavorite = async (e: MouseEvent, recipe: EnrichedRecipe) => {
    e.stopPropagation();
    const proj = activeProject();
    if (!proj) return;

    // Enforce max 3 pinned recipes — silently ignore if at limit
    if (!recipe.favorite && recipes().filter((r) => r.favorite).length >= 3) {
      return;
    }

    const newState = await toggleRecipeFavorite(proj.id, recipe.id);
    // Optimistic update
    setRecipes((prev) =>
      prev.map((r) => r.id === recipe.id ? { ...r, favorite: newState } : r),
    );
  };

  const handleDelete = async (e: MouseEvent, recipe: EnrichedRecipe) => {
    e.stopPropagation();
    const ok = await deleteCustomRecipe(recipe.id);
    if (ok) {
      setRecipes((prev) => prev.filter((r) => r.id !== recipe.id));
    }
  };

  const handleCreate = async () => {
    const proj = activeProject();
    const label = newLabel().trim();
    const command = newCommand().trim();
    if (!proj || !label || !command) return;

    const id = await createCustomRecipe(proj.id, label, command, 'custom');
    if (id) {
      setNewLabel('');
      setNewCommand('');
      setShowCreateForm(false);
      await loadRecipes();
    }
  };

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) closeRecipePicker();
  };

  return (
    <Show when={recipePickerOpen()}>
      <Portal>
        <div class={styles.backdrop} onClick={handleBackdropClick}>
          <div class={styles.container}>
            {/* Search */}
            <div class={styles.searchRow}>
              <Search size={16} class={styles.searchIcon} />
              <input
                ref={inputRef}
                class={styles.searchInput}
                type="text"
                placeholder="Search recipes..."
                value={query()}
                onInput={(e) => {
                  setQuery(e.currentTarget.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleInputKeydown}
                spellcheck={false}
                autocomplete="off"
              />
              <span class={styles.escBadge}>ESC</span>
            </div>

            {/* Category filter chips */}
            <div class={styles.categoryRow}>
              <For each={CATEGORIES}>
                {(cat) => (
                  <button
                    type="button"
                    class={styles.categoryChip}
                    data-active={activeCategory() === cat ? 'true' : 'false'}
                    onClick={() => {
                      setActiveCategory(cat);
                      setSelectedIndex(0);
                    }}
                  >
                    {cat}
                  </button>
                )}
              </For>
            </div>

            {/* Recipe list */}
            <div class={styles.recipeList} ref={listRef}>
              <Show when={loading()}>
                <div class={styles.emptyState}>Loading recipes...</div>
              </Show>

              <Show when={!loading()}>
                <Show
                  when={filteredRecipes().length > 0}
                  fallback={<div class={styles.emptyState}>No matching recipes</div>}
                >
                  {/* Favorites section header */}
                  <Show when={hasFavorites()}>
                    <div class={styles.sectionLabel}>Favorites</div>
                  </Show>

                  <For each={filteredRecipes()}>
                    {(recipe, index) => (
                      <>
                        {/* Section header when transitioning from favorites to the rest */}
                        <Show when={hasFavorites() && index() === favoritesEndIndex() && favoritesEndIndex() > 0}>
                          <div class={styles.sectionLabel}>All</div>
                        </Show>

                        <div
                          class={styles.recipeItem}
                          data-selected={index() === selectedIndex() ? 'true' : 'false'}
                          onClick={() => executeRecipe(recipe)}
                          onMouseEnter={() => setSelectedIndex(index())}
                        >
                          <span class={styles.recipeEmoji}>{recipe.icon || '▶'}</span>
                          <span class={styles.recipeLabel}>{recipe.label}</span>
                          <span class={styles.recipeCommand}>{recipe.command}</span>
                          <span class={styles.recipeCategoryBadge}>{recipe.category}</span>

                          <button
                            type="button"
                            class={styles.favoriteButton}
                            data-favorited={recipe.favorite ? 'true' : 'false'}
                            onClick={(e) => handleToggleFavorite(e, recipe)}
                            title={recipe.favorite ? 'Remove from favorites' : 'Add to favorites'}
                          >
                            {recipe.favorite ? '★' : '☆'}
                          </button>

                          <Show when={recipe.custom}>
                            <button
                              type="button"
                              class={styles.deleteButton}
                              onClick={(e) => handleDelete(e, recipe)}
                              title="Delete custom recipe"
                            >
                              <Trash2 size={12} />
                            </button>
                          </Show>
                        </div>
                      </>
                    )}
                  </For>
                </Show>
              </Show>
            </div>

            {/* Create custom recipe section */}
            <div class={styles.createSection}>
              <Show
                when={showCreateForm()}
                fallback={
                  <button
                    type="button"
                    class={styles.createToggle}
                    onClick={() => setShowCreateForm(true)}
                  >
                    <Plus size={12} />
                    Create Custom Recipe
                  </button>
                }
              >
                <div class={styles.createForm}>
                  <div class={styles.createInputRow}>
                    <input
                      class={styles.createInput}
                      type="text"
                      placeholder="Label (e.g. Deploy Staging)"
                      value={newLabel()}
                      onInput={(e) => setNewLabel(e.currentTarget.value)}
                      spellcheck={false}
                    />
                    <input
                      class={styles.createInput}
                      type="text"
                      placeholder="Command (e.g. ./deploy.sh staging)"
                      value={newCommand()}
                      onInput={(e) => setNewCommand(e.currentTarget.value)}
                      spellcheck={false}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleCreate();
                        }
                      }}
                    />
                    <button
                      type="button"
                      class={styles.createButton}
                      disabled={!newLabel().trim() || !newCommand().trim()}
                      onClick={handleCreate}
                    >
                      Add
                    </button>
                  </div>
                </div>
              </Show>
            </div>

            {/* Footer hints */}
            <div class={styles.footer}>
              <span>
                <span class={styles.footerKbd}>{'↑↓'}</span> navigate
              </span>
              <span>
                <span class={styles.footerKbd}>{'↵'}</span> run
              </span>
              <span>
                <span class={styles.footerKbd}>esc</span> close
              </span>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
};
