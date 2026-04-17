/**
 * useColorScheme — track Mantine's color scheme from the html root.
 * Kept in the editor package to avoid a direct Mantine dependency.
 * @author Subash Karki
 */
import { useSyncExternalStore } from 'react';

export function useColorScheme(): 'dark' | 'light' {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined') return () => {};
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-mantine-color-scheme'],
      });
      return () => observer.disconnect();
    },
    () => {
      if (typeof document === 'undefined') return 'dark';
      const scheme = document.documentElement.getAttribute('data-mantine-color-scheme');
      return scheme === 'light' ? 'light' : 'dark';
    },
    () => 'dark',
  );
}
