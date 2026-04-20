// Author: Subash Karki

import { For, Show, createSignal } from 'solid-js';
import type { Recipe } from '../../../core/types';
import * as styles from './RecipeActions.css';

interface RecipeActionsProps {
  recipes: Recipe[];
  pinnedIds: string[];
  onTogglePin: (recipeId: string) => void;
  onRun: (recipe: Recipe) => void;
}

export function RecipeActions(props: RecipeActionsProps) {
  const [expanded, setExpanded] = createSignal(false);

  const pinned = () => props.recipes.filter((r) => props.pinnedIds.includes(r.id));
  const unpinned = () => props.recipes.filter((r) => !props.pinnedIds.includes(r.id));

  return (
    <div class={styles.section}>
      <Show when={pinned().length > 0}>
        <span class={styles.sectionLabel}>Pinned</span>
        <For each={pinned()}>
          {(recipe) => (
            <div class={styles.recipeRow}>
              <button class={styles.playBtn} onClick={() => props.onRun(recipe)}>▶</button>
              <span class={styles.recipeLabel}>{recipe.label}</span>
              <button class={`${styles.pinBtn} ${styles.pinBtnActive}`} onClick={() => props.onTogglePin(recipe.id)}>★</button>
            </div>
          )}
        </For>
      </Show>
      <Show when={unpinned().length > 0}>
        <div class={styles.expandToggle} onClick={() => setExpanded((v) => !v)}>
          {props.recipes.length} recipes found {expanded() ? '▾' : '▸'}
        </div>
        <Show when={expanded()}>
          <div class={styles.scrollList}>
            <For each={unpinned()}>
              {(recipe) => (
                <div class={styles.recipeRow}>
                  <button class={styles.playBtn} onClick={() => props.onRun(recipe)}>▶</button>
                  <span class={styles.recipeLabel}>{recipe.label}</span>
                  <button class={styles.pinBtn} onClick={() => props.onTogglePin(recipe.id)}>☆</button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>
    </div>
  );
}
