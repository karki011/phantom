// Author: Subash Karki

import type { EnrichedRecipe } from '../types';
import { normalize } from './_normalize';

const App = () => (window as any).go?.['app']?.App;

/**
 * Get all recipes (auto-detected + custom) for a project, with favorite status.
 */
export async function getAllRecipes(projectId: string): Promise<EnrichedRecipe[]> {
  try {
    const raw = (await App()?.GetAllRecipes(projectId)) ?? [];
    return normalize<EnrichedRecipe[]>(raw);
  } catch {
    return [];
  }
}

/**
 * Create a new custom recipe for a project.
 * @returns The ID of the newly created recipe, or empty string on failure.
 */
export async function createCustomRecipe(
  projectId: string,
  label: string,
  command: string,
  category: string,
): Promise<string> {
  try {
    return (await App()?.CreateCustomRecipe(projectId, label, command, category)) ?? '';
  } catch (error) {
    console.error('[recipes] createCustomRecipe failed', { projectId, error });
    return '';
  }
}

/**
 * Update an existing custom recipe's label, command, and category.
 */
export async function updateCustomRecipe(
  recipeId: string,
  label: string,
  command: string,
  category: string,
): Promise<boolean> {
  try {
    await App()?.UpdateCustomRecipe(recipeId, label, command, category);
    return true;
  } catch (error) {
    console.error('[recipes] updateCustomRecipe failed', { recipeId, error });
    return false;
  }
}

/**
 * Delete a custom recipe by ID.
 */
export async function deleteCustomRecipe(recipeId: string): Promise<boolean> {
  try {
    await App()?.DeleteCustomRecipe(recipeId);
    return true;
  } catch (error) {
    console.error('[recipes] deleteCustomRecipe failed', { recipeId, error });
    return false;
  }
}

/**
 * Toggle a recipe's favorite status. Works for both auto-detected and custom recipes.
 * @returns The new favorite state.
 */
export async function toggleRecipeFavorite(
  projectId: string,
  recipeId: string,
): Promise<boolean> {
  try {
    return (await App()?.ToggleRecipeFavorite(projectId, recipeId)) ?? false;
  } catch (error) {
    console.error('[recipes] toggleRecipeFavorite failed', { projectId, recipeId, error });
    return false;
  }
}

/**
 * Get only the favorited recipes for a project.
 */
export async function getFavoriteRecipes(projectId: string): Promise<EnrichedRecipe[]> {
  try {
    const raw = (await App()?.GetFavoriteRecipes(projectId)) ?? [];
    return normalize<EnrichedRecipe[]>(raw);
  } catch {
    return [];
  }
}
