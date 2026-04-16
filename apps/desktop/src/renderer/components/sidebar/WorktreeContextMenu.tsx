/**
 * WorktreeContextMenu — right-click context menu for worktree items
 * Uses standard Mantine Menu pattern with the children as Menu.Target.
 *
 * @author Subash Karki
 */
import { Menu } from '@mantine/core';
import {
  Clipboard,
  Edit3,
  ExternalLink,
  FolderOpen,
  Terminal,
  X,
} from 'lucide-react';
import { type ReactNode, useCallback, useState } from 'react';

/** Call Electron IPC if available */
const invoke = async (channel: string, ...args: unknown[]): Promise<void> => {
  try {
    const api = window.phantomOS;
    if (api?.invoke) await api.invoke(channel, ...args);
  } catch (err) {
    console.error(`[IPC] ${channel} failed:`, err);
  }
};

interface WorktreeContextMenuProps {
  children: ReactNode;
  worktreePath?: string;
  onRename: () => void;
  onOpenTerminal: () => void;
  onDelete: () => void;
}

export function WorktreeContextMenu({
  children,
  worktreePath,
  onRename,
  onOpenTerminal,
  onDelete,
}: WorktreeContextMenuProps) {
  const [opened, setOpened] = useState(false);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpened(true);
  }, []);

  return (
    <Menu
      opened={opened}
      onChange={(val) => { if (!val) setOpened(false); }}
      shadow="md"
      width={200}
      position="bottom-start"
      withinPortal
      middlewares={{ shift: true, flip: true }}
      styles={{
        dropdown: {
          backgroundColor: 'var(--phantom-surface-card)',
          borderColor: 'var(--phantom-border-subtle)',
        },
        item: {
          fontSize: '0.8rem',
          color: 'var(--phantom-text-secondary)',
          padding: '8px 12px',
          cursor: 'pointer',
        },
        separator: {
          borderColor: 'var(--phantom-border-subtle)',
        },
      }}
    >
      <Menu.Target>
        <div onContextMenu={handleContextMenu}>{children}</div>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<FolderOpen size={14} />}
          onClick={() => { if (worktreePath) invoke('phantom:open-in-finder', worktreePath); }}
          disabled={!worktreePath}
        >
          Open in Finder
        </Menu.Item>
        <Menu.Item
          leftSection={<ExternalLink size={14} />}
          onClick={() => { if (worktreePath) invoke('phantom:open-in-editor', worktreePath); }}
          disabled={!worktreePath}
        >
          Open in Editor
        </Menu.Item>
        <Menu.Item
          leftSection={<Clipboard size={14} />}
          onClick={() => { if (worktreePath) navigator.clipboard.writeText(worktreePath); }}
          disabled={!worktreePath}
        >
          Copy Path
        </Menu.Item>
        <Menu.Divider />
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
          leftSection={<X size={14} />}
          color="red"
          onClick={onDelete}
        >
          Close Worktree
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
