/**
 * WorkspaceContextMenu — right-click context menu for workspace items
 * Uses a pending action ref so callbacks fire cleanly after menu closes.
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

interface WorkspaceContextMenuProps {
  children: ReactNode;
  workspacePath?: string;
  onRename: () => void;
  onOpenTerminal: () => void;
  onDelete: () => void;
}

export function WorkspaceContextMenu({
  children,
  workspacePath,
  onRename,
  onOpenTerminal,
  onDelete,
}: WorkspaceContextMenuProps) {
  const [opened, setOpened] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const pendingAction = useRef<(() => void) | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPosition({ x: e.clientX, y: e.clientY });
    setOpened(true);
  }, []);

  const handleOpenChange = useCallback((isOpen: boolean) => {
    setOpened(isOpen);
    if (!isOpen && pendingAction.current) {
      const action = pendingAction.current;
      pendingAction.current = null;
      requestAnimationFrame(action);
    }
  }, []);

  const queueAction = useCallback((action: () => void) => {
    pendingAction.current = action;
    setOpened(false);
  }, []);

  return (
    <>
      <div onContextMenu={handleContextMenu}>{children}</div>
      <Menu
        opened={opened}
        onChange={handleOpenChange}
        shadow="md"
        width={200}
        position="bottom-start"
        styles={{
          dropdown: {
            backgroundColor: 'var(--phantom-surface-card)',
            borderColor: 'var(--phantom-border-subtle)',
            position: 'fixed',
            left: position.x,
            top: position.y,
          },
          item: {
            fontSize: '0.8rem',
            color: 'var(--phantom-text-secondary)',
            padding: '8px 12px',
          },
          separator: {
            borderColor: 'var(--phantom-border-subtle)',
          },
        }}
      >
        <Menu.Target>
          <div style={{ position: 'fixed', left: position.x, top: position.y, width: 0, height: 0 }} />
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<FolderOpen size={14} />}
            onClick={() => {
              if (workspacePath) invoke('phantom:open-in-finder', workspacePath);
            }}
            disabled={!workspacePath}
          >
            Open in Finder
          </Menu.Item>
          <Menu.Item
            leftSection={<ExternalLink size={14} />}
            onClick={() => {
              if (workspacePath) invoke('phantom:open-in-editor', workspacePath);
            }}
            disabled={!workspacePath}
          >
            Open in Editor
          </Menu.Item>
          <Menu.Item
            leftSection={<Clipboard size={14} />}
            onClick={() => {
              if (workspacePath) navigator.clipboard.writeText(workspacePath);
            }}
            disabled={!workspacePath}
          >
            Copy Path
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            leftSection={<Edit3 size={14} />}
            onClick={() => queueAction(onRename)}
          >
            Rename
          </Menu.Item>
          <Menu.Item
            leftSection={<Terminal size={14} />}
            onClick={() => queueAction(onOpenTerminal)}
          >
            Open in Terminal
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            leftSection={<X size={14} />}
            color="red"
            onClick={() => queueAction(onDelete)}
          >
            Close Workspace
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </>
  );
}
