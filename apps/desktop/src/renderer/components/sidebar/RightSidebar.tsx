/**
 * RightSidebar — file explorer and changes tabs
 *
 * @author Subash Karki
 */
import {
  ActionIcon,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { useAtom, useAtomValue } from 'jotai';
import { ChevronsRight } from 'lucide-react';

import {
  rightSidebarCollapsedAtom,
  rightSidebarWidthAtom,
} from '../../atoms/workspaces';
import { rightSidebarTabAtom } from '../../atoms/fileExplorer';
import { ResizeHandle } from './ResizeHandle';
import { FilesView } from './FilesView';

const TABS = [
  { id: 'files' as const, label: 'Files' },
  { id: 'changes' as const, label: 'Changes' },
] as const;

export function RightSidebar() {
  const [collapsed, setCollapsed] = useAtom(rightSidebarCollapsedAtom);
  const [width, setWidth] = useAtom(rightSidebarWidthAtom);
  const [activeTab, setActiveTab] = useAtom(rightSidebarTabAtom);

  if (collapsed) {
    return (
      <div
        style={{
          width: 40,
          minWidth: 40,
          height: '100%',
          backgroundColor: 'var(--phantom-surface-card)',
          borderLeft: '1px solid var(--phantom-border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 8,
        }}
      >
        <Tooltip label="Expand sidebar" position="left">
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
          >
            <ChevronsRight
              size={16}
              style={{
                transform: 'rotate(180deg)',
                color: 'var(--phantom-text-muted)',
              }}
            />
          </ActionIcon>
        </Tooltip>
      </div>
    );
  }

  return (
    <div
      style={{
        width,
        minWidth: 180,
        maxWidth: 500,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--phantom-surface-card)',
        borderLeft: '1px solid var(--phantom-border-subtle)',
        position: 'relative',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid var(--phantom-border-subtle)',
          flexShrink: 0,
        }}
      >
        {TABS.map((tab) => (
          <UnstyledButton
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            py={8}
            px="sm"
            style={{
              flex: 1,
              textAlign: 'center',
              borderBottom:
                activeTab === tab.id
                  ? '2px solid var(--phantom-accent-cyan)'
                  : '2px solid transparent',
              transition: 'border-color 120ms ease',
            }}
          >
            <Text
              fz="0.78rem"
              fw={activeTab === tab.id ? 600 : 400}
              c={
                activeTab === tab.id
                  ? 'var(--phantom-text-primary)'
                  : 'var(--phantom-text-muted)'
              }
            >
              {tab.label}
            </Text>
          </UnstyledButton>
        ))}
        <Tooltip label="Collapse sidebar">
          <ActionIcon
            variant="subtle"
            size="xs"
            onClick={() => setCollapsed(true)}
            aria-label="Collapse sidebar"
            mr={4}
          >
            <ChevronsRight
              size={14}
              style={{ color: 'var(--phantom-text-muted)' }}
            />
          </ActionIcon>
        </Tooltip>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'files' ? (
          <FilesView />
        ) : (
          <Text
            fz="0.75rem"
            c="var(--phantom-text-muted)"
            ta="center"
            py="xl"
            px="sm"
          >
            Changes view coming soon.
          </Text>
        )}
      </div>

      {/* Resize handle on left edge */}
      <ResizeHandle
        position="left"
        onResize={(delta) =>
          setWidth((prev) => Math.max(180, Math.min(500, prev + delta)))
        }
      />
    </div>
  );
}
