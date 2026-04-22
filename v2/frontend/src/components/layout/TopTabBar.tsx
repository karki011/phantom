// PhantomOS v2 — Top navigation tab bar
// Author: Subash Karki

import { Tabs } from '@kobalte/core/tabs';
import { activeTopTab, setActiveTopTab } from '@/core/signals/app';
import * as shellStyles from '@/styles/app-shell.css';

export function TopTabBar() {
  return (
    <Tabs
      value={activeTopTab()}
      onChange={setActiveTopTab}
      class={shellStyles.topTabBar}
    >
      <Tabs.List class={shellStyles.topTabList}>
        <Tabs.Trigger value="system" class={shellStyles.topTab}>
          System
        </Tabs.Trigger>
        <Tabs.Trigger value="worktree" class={shellStyles.topTab}>
          Worktree
        </Tabs.Trigger>
      </Tabs.List>
    </Tabs>
  );
}
