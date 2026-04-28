// PhantomOS v2 — AI Command Center modal signals
// Author: Subash Karki

import { createSignal } from 'solid-js';

export type AICommandCenterTab = 'overview' | 'insight' | 'evolution' | 'settings';

const [aiCommandCenterOpen, setAiCommandCenterOpen] = createSignal(false);
const [aiCommandCenterTab, setAiCommandCenterTab] = createSignal<AICommandCenterTab>('overview');
const [aiCommandCenterSeen, setAiCommandCenterSeen] = createSignal(false);

export const openAICommandCenter = (tab?: AICommandCenterTab): void => {
  if (tab) setAiCommandCenterTab(tab);
  setAiCommandCenterOpen(true);
  setAiCommandCenterSeen(true);
};

export const closeAICommandCenter = (): void => {
  setAiCommandCenterOpen(false);
};

export { aiCommandCenterOpen, setAiCommandCenterOpen, aiCommandCenterTab, setAiCommandCenterTab, aiCommandCenterSeen };
