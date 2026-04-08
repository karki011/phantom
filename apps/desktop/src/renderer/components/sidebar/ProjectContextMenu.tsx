/**
 * ProjectContextMenu — right-click context menu for project headers
 *
 * @author Subash Karki
 */
import { Menu } from '@mantine/core';
import { Edit3, FolderPlus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

interface ProjectContextMenuProps {
  children: ReactNode;
  onAddWorkspace: () => void;
  onRename: () => void;
  onRemoveProject: () => void;
}

export function ProjectContextMenu({
  children,
  onAddWorkspace,
  onRename,
  onRemoveProject,
}: ProjectContextMenuProps) {
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
          leftSection={<FolderPlus size={14} />}
          onClick={onAddWorkspace}
        >
          Add Workspace
        </Menu.Item>
        <Menu.Item
          leftSection={<Edit3 size={14} />}
          onClick={onRename}
        >
          Rename Project
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={<Trash2 size={14} />}
          color="red"
          onClick={onRemoveProject}
        >
          Remove Project
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
