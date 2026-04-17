/**
 * Tracks the most-recently-focused terminal pane so the floating composer
 * can scope its "send" target reliably when the user has multiple terminal
 * splits open.
 *
 * Mounted once in App.tsx. Uses Jotai subscription — zero DOM footprint.
 *
 * @author Subash Karki
 */
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';

import { activePaneAtom } from '@phantom-os/panes';
import { lastTerminalPaneIdAtom } from '../atoms/chatDraft';

export const TerminalFocusTracker = () => {
  const activePane = useAtomValue(activePaneAtom);
  const setLast = useSetAtom(lastTerminalPaneIdAtom);

  useEffect(() => {
    if (activePane?.kind === 'terminal') {
      setLast(activePane.id);
    }
  }, [activePane?.id, activePane?.kind, setLast]);

  return null;
};
