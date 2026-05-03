// Author: Subash Karki
// Context widgets — small info displays in Composer/terminal margins

import { createSignal } from 'solid-js';

export interface Widget {
  id: string;
  priority: number; // lower = higher priority, shown first
  icon: string; // lucide icon name
  label: string; // compact: "3.2K tokens"
  detail: string; // expanded: "Input: 2.1K · Output: 1.1K · Cache: 89%"
  variant: 'default' | 'warning' | 'danger' | 'success';
  visible: boolean;
}

const [widgets, setWidgets] = createSignal<Widget[]>([]);

export { widgets };

export const updateWidget = (id: string, updates: Partial<Omit<Widget, 'id'>>) => {
  setWidgets(prev => {
    const idx = prev.findIndex(w => w.id === id);
    if (idx >= 0) {
      const next = [...prev];
      next[idx] = { ...next[idx], ...updates };
      return next;
    }
    return prev;
  });
};

export const registerWidget = (widget: Widget) => {
  setWidgets(prev => {
    if (prev.some(w => w.id === widget.id)) return prev;
    return [...prev, widget].sort((a, b) => a.priority - b.priority);
  });
};

export const removeWidget = (id: string) => {
  setWidgets(prev => prev.filter(w => w.id !== id));
};

export const visibleWidgets = () => widgets().filter(w => w.visible);

// Pre-register the 5 standard widgets
export const initWidgets = () => {
  registerWidget({ id: 'conflict', priority: 1, icon: 'AlertTriangle', label: '', detail: '', variant: 'default', visible: false });
  registerWidget({ id: 'tokens', priority: 2, icon: 'Gauge', label: '', detail: '', variant: 'default', visible: false });
  registerWidget({ id: 'cost', priority: 3, icon: 'DollarSign', label: '', detail: '', variant: 'default', visible: false });
  registerWidget({ id: 'git', priority: 4, icon: 'GitBranch', label: '', detail: '', variant: 'default', visible: false });
  registerWidget({ id: 'memory', priority: 5, icon: 'Brain', label: '', detail: '', variant: 'default', visible: false });
};
