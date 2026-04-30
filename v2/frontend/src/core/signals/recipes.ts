// Phantom — Recipe picker visibility signal
// Author: Subash Karki

import { createSignal } from 'solid-js';

const [recipePickerOpen, setRecipePickerOpen] = createSignal(false);

export const openRecipePicker = (): void => setRecipePickerOpen(true);
export const closeRecipePicker = (): void => setRecipePickerOpen(false);
export const toggleRecipePicker = (): void => setRecipePickerOpen((prev) => !prev);

export { recipePickerOpen, setRecipePickerOpen };
