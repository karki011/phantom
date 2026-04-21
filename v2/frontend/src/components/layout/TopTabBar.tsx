// PhantomOS v2 — Top navigation tab bar
// Author: Subash Karki

import { activeTopTab, setActiveTopTab, type TopTab } from '@/core/signals/app';
import * as shellStyles from '@/styles/app-shell.css';

export function TopTabBar() {
  return (
    <div class={shellStyles.topTabBar} role="tablist" aria-label="Main navigation">
      <button
        class={activeTopTab() === 'system' ? shellStyles.topTabActive : shellStyles.topTab}
        type="button"
        role="tab"
        aria-selected={activeTopTab() === 'system'}
        onClick={() => setActiveTopTab('system')}
      >
        System
      </button>
      <button
        class={activeTopTab() === 'worktree' ? shellStyles.topTabActive : shellStyles.topTab}
        type="button"
        role="tab"
        aria-selected={activeTopTab() === 'worktree'}
        onClick={() => setActiveTopTab('worktree')}
      >
        Worktree
      </button>
    </div>
  );
}
