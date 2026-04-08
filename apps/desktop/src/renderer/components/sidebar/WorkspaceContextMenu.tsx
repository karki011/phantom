/**
 * WorkspaceContextMenu — right-click context menu for workspace items
 *
 * @author Subash Karki
 */
import { Menu } from '@mantine/core';
import { Edit3, Terminal, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

interface WorkspaceContextMenuProps {
  children: ReactNode;
  onRename: () => void;
  onOpenTerminal: () => void;
  onDelete: () => void;
}

export function WorkspaceContextMenu({
  children,
  onRename,
  onOpenTerminal,
  onDelete,
}: WorkspaceContextMenuProps) {
  return (
    <Menu
      trigger="contextMenu"
      shadow="md"
      width={180}
      position="bottom-start"
      styles={{
        dropdown: {
          backgroundColor: 'var(--phantom-surface-card)',
          borderColor: 'var(--phantom-border-subtle)',
        },
        item: {
          fontSize: '0.75rem',
          color: 'var(--phantom-text-secondary)',
          '&[data-hovered]': {
            backgroundColor: 'var(--phantom-surface-hover)',
          },
        },
        separator: {
          borderColor: 'var(--phantom-border-subtle)',
        },
      }}
    >
      <Menu.Target>{children}</Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<Edit3 size={14} />}
          onClick={onRename}
        >
          Rename
        </Menu.Item>
        <Menu.Item
          leftSection={<Terminal size={14} />}
          onClick={onOpenTerminal}
        >
          Open in Terminal
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<Trash2 size={14} />}
          color="red"
          onClick={onDelete}
        >
          Delete Workspace
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
