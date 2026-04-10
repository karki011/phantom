/**
 * useRecipes — merges auto-detected recipes with favorites + custom recipes
 * @author Subash Karki
 */
import { useAtom } from 'jotai';
import { useCallback, useMemo } from 'react';
import { recipeFavoritesAtom, customRecipesAtom, type CustomRecipe } from '../atoms/recipes';
import type { Recipe, ProjectProfile } from '../lib/api';

export interface EnrichedRecipe extends Recipe {
  favorite: boolean;
}

export const useRecipes = (projectId: string | null, projectProfile: ProjectProfile | null) => {
  const [allFavorites, setAllFavorites] = useAtom(recipeFavoritesAtom);
  const [allCustomRecipes, setAllCustomRecipes] = useAtom(customRecipesAtom);

  const favoriteIds = useMemo<Set<string>>(
    () => new Set(projectId ? allFavorites[projectId] ?? [] : []),
    [allFavorites, projectId],
  );

  const customRecipes = useMemo<CustomRecipe[]>(
    () => (projectId ? allCustomRecipes[projectId] ?? [] : []),
    [allCustomRecipes, projectId],
  );

  const allRecipes = useMemo<EnrichedRecipe[]>(() => {
    const autoRecipes: EnrichedRecipe[] = (projectProfile?.recipes ?? []).map((r) => ({
      ...r,
      favorite: favoriteIds.has(r.id),
    }));

    const custom: EnrichedRecipe[] = customRecipes.map((r) => ({
      ...r,
      favorite: r.favorite || favoriteIds.has(r.id),
    }));

    return [...custom, ...autoRecipes];
  }, [projectProfile, favoriteIds, customRecipes]);

  const favoriteRecipes = useMemo<EnrichedRecipe[]>(
    () => allRecipes.filter((r) => r.favorite),
    [allRecipes],
  );

  const toggleFavorite = useCallback(
    (recipeId: string) => {
      if (!projectId) return;
      setAllFavorites((prev) => {
        const current = prev[projectId] ?? [];
        const isCurrentlyFavorite = current.includes(recipeId);
        return {
          ...prev,
          [projectId]: isCurrentlyFavorite
            ? current.filter((id) => id !== recipeId)
            : [...current, recipeId],
        };
      });
    },
    [projectId, setAllFavorites],
  );

  const addCustomRecipe = useCallback(
    (label: string, command: string, category: CustomRecipe['category']) => {
      if (!projectId) return;
      const recipe: CustomRecipe = {
        id: `custom-${Date.now()}`,
        label,
        command,
        icon: '⚙️',
        category,
        auto: false,
        favorite: true,
        createdAt: Date.now(),
      };
      setAllCustomRecipes((prev) => ({
        ...prev,
        [projectId]: [...(prev[projectId] ?? []), recipe],
      }));
    },
    [projectId, setAllCustomRecipes],
  );

  const editCustomRecipe = useCallback(
    (recipeId: string, updates: { label?: string; command?: string; category?: CustomRecipe['category'] }) => {
      if (!projectId) return;
      setAllCustomRecipes((prev) => ({
        ...prev,
        [projectId]: (prev[projectId] ?? []).map((r) =>
          r.id === recipeId ? { ...r, ...updates } : r,
        ),
      }));
    },
    [projectId, setAllCustomRecipes],
  );

  const deleteCustomRecipe = useCallback(
    (recipeId: string) => {
      if (!projectId) return;
      setAllCustomRecipes((prev) => ({
        ...prev,
        [projectId]: (prev[projectId] ?? []).filter((r) => r.id !== recipeId),
      }));
      setAllFavorites((prev) => ({
        ...prev,
        [projectId]: (prev[projectId] ?? []).filter((id) => id !== recipeId),
      }));
    },
    [projectId, setAllCustomRecipes, setAllFavorites],
  );

  return {
    allRecipes,
    favoriteRecipes,
    customRecipes,
    toggleFavorite,
    addCustomRecipe,
    editCustomRecipe,
    deleteCustomRecipe,
  };
};
