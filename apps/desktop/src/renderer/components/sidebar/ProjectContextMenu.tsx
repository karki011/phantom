/**
 * ProjectContextMenu — right-click context menu for project headers
 * Uses a pending action ref so callbacks fire cleanly after menu closes.
 *
 * @author Subash Karki
 */
import { Menu } from '@mantine/core';
import { Edit3, FolderPlus, RefreshCw, Trash2 } from 'lucide-react';
import { type ReactNode, useCallback, useRef, useState } from 'react';

interface ProjectContextMenuProps {
  children: ReactNode;
  onAddWorktree: () => void;
  onRename: () => void;
  onRedetect: () => void;
  onRemoveProject: () => void;
}

export function ProjectContextMenu({
  children,
  onAddWorktree,
  onRename,
  onRedetect,
  onRemoveProject,
}: ProjectContextMenuProps) {
  const [opened, setOpened] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const pendingAction = useRef<(() => void) | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPosition({ x: e.clientX, y: e.clientY });
    setOpened(true);
  }, []);

  // When menu closes, execute any pending action
  const handleOpenChange = useCallback((isOpen: boolean) => {
    setOpened(isOpen);
    if (!isOpen && pendingAction.current) {
      const action = pendingAction.current;
      pendingAction.current = null;
      // Execute after the menu unmount completes
      requestAnimationFrame(action);
    }
  }, []);

  // Queue an action and close the menu — action fires after close
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
        offset={{ mainAxis: 0, crossAxis: 0 }}
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
            leftSection={<FolderPlus size={14} />}
            onClick={() => queueAction(onAddWorktree)}
          >
            Add Worktree
          </Menu.Item>
          <Menu.Item
            leftSection={<Edit3 size={14} />}
            onClick={() => queueAction(onRename)}
          >
            Rename Project
          </Menu.Item>
          <Menu.Item
            leftSection={<RefreshCw size={14} />}
            onClick={() => queueAction(onRedetect)}
          >
            Re-detect Recipes
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            leftSection={<Trash2 size={14} />}
            color="red"
            onClick={() => queueAction(onRemoveProject)}
          >
            Remove Project
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </>
  );
}
