/**
 * Recipe persistence atoms — favorites and custom recipes
 * @author Subash Karki
 */
import { atomWithStorage } from 'jotai/utils';

/**
 * Favorited recipe IDs per project.
 * Key: projectId, Value: array of recipe IDs (e.g., "npm-dev", "make-test")
 */
export const recipeFavoritesAtom = atomWithStorage<Record<string, string[]>>(
  'phantom-recipe-favorites',
  {},
);

/**
 * Custom (user-created) recipes per project.
 * Key: projectId, Value: array of Recipe objects with auto=false
 */
export interface CustomRecipe {
  id: string;
  label: string;
  command: string;
  icon: string;
  category: 'setup' | 'test' | 'lint' | 'build' | 'serve' | 'deploy' | 'custom';
  description?: string;
  auto: false;
  favorite: boolean;
  createdAt: number;
}

export const customRecipesAtom = atomWithStorage<Record<string, CustomRecipe[]>>(
  'phantom-custom-recipes',
  {},
);
