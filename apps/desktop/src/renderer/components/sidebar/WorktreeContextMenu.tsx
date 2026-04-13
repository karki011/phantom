/**
 * WorktreeContextMenu — right-click context menu for worktree items
 * Uses Mantine Menu with Floating UI for auto-positioning at cursor.
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
import { type ReactNode, useCallback, useRef, useState } from 'react';

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
  const targetRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (targetRef.current) {
      targetRef.current.style.left = `${e.clientX}px`;
      targetRef.current.style.top = `${e.clientY}px`;
    }
    setOpened(true);
  }, []);

  return (
    <>
      <div onContextMenu={handleContextMenu}>{children}</div>
      <Menu
        opened={opened}
        onChange={setOpened}
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
          <div
            ref={targetRef}
            style={{ position: 'fixed', width: 1, height: 1, pointerEvents: 'none' }}
          />
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
    </>
  );
}
