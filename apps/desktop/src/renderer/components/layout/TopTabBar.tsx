/**
 * TopTabBar Component
 * Two top-level tabs: Cockpit (gamification dashboard) and Workspace (editor/terminal/files)
 *
 * @author Subash Karki
 */
import { Group, Text, UnstyledButton } from '@mantine/core';
import { useAtom } from 'jotai';
import { Home, Code2 } from 'lucide-react';

import { type TopLevelTab, activeTopTabAtom } from '../../atoms/system';

interface TabDef {
  id: TopLevelTab;
  label: string;
  icon: typeof Home;
}

const TABS: TabDef[] = [
  { id: 'cockpit', label: 'Cockpit', icon: Home },
  { id: 'workspace', label: 'Workspace', icon: Code2 },
];

export function TopTabBar() {
  const [activeTab, setActiveTab] = useAtom(activeTopTabAtom);

  const handleTabClick = (tabId: TopLevelTab) => {
    setActiveTab(tabId);
    // Reset to cockpit home when clicking the Cockpit tab (clears sub-route)
    if (tabId === 'cockpit') {
      window.location.hash = 'cockpit';
    }
  };

  return (
    <div
      style={{
        height: 32,
        minHeight: 32,
        display: 'flex',
        alignItems: 'stretch',
        backgroundColor: 'var(--phantom-surface-card)',
        borderBottom: '1px solid var(--phantom-border-subtle)',
        paddingLeft: 12,
        gap: 0,
      }}
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.icon;

        return (
          <UnstyledButton
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 14px',
              borderBottom: isActive
                ? '2px solid var(--phantom-accent-cyan)'
                : '2px solid transparent',
              transition: 'border-color 120ms ease, background-color 120ms ease',
              backgroundColor: isActive
                ? 'var(--phantom-surface-hover)'
                : 'transparent',
              cursor: 'pointer',
            }}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon
              size={14}
              style={{
                color: isActive
                  ? 'var(--phantom-accent-cyan)'
                  : 'var(--phantom-text-muted)',
              }}
              aria-hidden="true"
            />
            <Text
              fz="0.78rem"
              fw={isActive ? 600 : 400}
              c={isActive ? 'var(--phantom-text-primary)' : 'var(--phantom-text-muted)'}
            >
              {tab.label}
            </Text>
          </UnstyledButton>
        );
      })}
    </div>
  );
}
