/**
 * usePreferences — loads user preferences from DB, provides getter/setter
 * @author Subash Karki
 */
import { atom, useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { getPreferences, setPreference } from '../lib/api';

// Atom holding all preferences as { key: value }
const preferencesAtom = atom<Record<string, string>>({});
const prefsLoadedAtom = atom(false);

// Write atom to update a single preference
const setPrefAtom = atom(
  null,
  async (_get, set, { key, value }: { key: string; value: string }) => {
    const updated = await setPreference(key, value);
    set(preferencesAtom, updated);
  },
);

// Write atom to load preferences from server
const loadPrefsAtom = atom(null, async (_get, set) => {
  try {
    const prefs = await getPreferences();
    set(preferencesAtom, prefs);
  } catch {
    // Ignore — use defaults
  } finally {
    set(prefsLoadedAtom, true);
  }
});

export function usePreferences() {
  const prefs = useAtomValue(preferencesAtom);
  const loaded = useAtomValue(prefsLoadedAtom);
  const loadPrefs = useSetAtom(loadPrefsAtom);
  const setPref = useSetAtom(setPrefAtom);

  // Load on mount (once)
  useEffect(() => {
    if (!loaded) loadPrefs();
  }, [loaded, loadPrefs]);

  return {
    prefs,
    loaded,
    setPref: (key: string, value: string) => setPref({ key, value }),
    isEnabled: (key: string) => prefs[key] === 'true',
  };
}

// Export atoms for direct use in non-hook contexts
export { preferencesAtom, prefsLoadedAtom };
