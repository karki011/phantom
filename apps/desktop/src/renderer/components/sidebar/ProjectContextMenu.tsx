/**
 * ProjectContextMenu — right-click context menu for project headers
 * Uses Mantine Menu with Floating UI for auto-positioning at cursor.
 *
 * @author Subash Karki
 */
import { Menu } from '@mantine/core';
import { Copy, Edit3, FolderPlus, RefreshCw, Search, Star, Trash2 } from 'lucide-react';
import { type ReactNode, useCallback, useRef, useState } from 'react';

interface ProjectContextMenuProps {
  children: ReactNode;
  repoPath: string;
  isStarred: boolean;
  onToggleStar: () => void;
  onAddWorktree: () => void;
  onRename: () => void;
  onRedetect: () => void;
  onDiscoverWorktrees: () => void;
  onRemoveProject: () => void;
}

export function ProjectContextMenu({
  children,
  repoPath,
  isStarred,
  onToggleStar,
  onAddWorktree,
  onRename,
  onRedetect,
  onDiscoverWorktrees,
  onRemoveProject,
}: ProjectContextMenuProps) {
  const [opened, setOpened] = useState(false);
  const targetRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Move the invisible target to the cursor position so Mantine
    // positions the dropdown there with full Floating UI awareness
    if (targetRef.current) {
      targetRef.current.style.left = `${e.clientX}px`;
      targetRef.current.style.top = `${e.clientY}px`;
    }
    setOpened(true);
  }, []);

  return (
    <>
      <div onContextMenu={handleContextMenu}>{children}</div>
      {/* Invisible anchor that follows the cursor — Mantine positions the dropdown relative to this */}
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
            leftSection={<Star size={14} style={isStarred ? { fill: 'var(--phantom-accent-gold)', color: 'var(--phantom-accent-gold)' } : undefined} />}
            onClick={onToggleStar}
          >
            {isStarred ? 'Unstar Project' : 'Star Project'}
          </Menu.Item>
          <Menu.Item
            leftSection={<FolderPlus size={14} />}
            onClick={onAddWorktree}
          >
            Add Worktree
          </Menu.Item>
          <Menu.Item
            leftSection={<Edit3 size={14} />}
            onClick={onRename}
          >
            Rename Project
          </Menu.Item>
          <Menu.Item
            leftSection={<Copy size={14} />}
            onClick={() => navigator.clipboard.writeText(repoPath)}
          >
            Copy Absolute Path
          </Menu.Item>
          <Menu.Item
            leftSection={<Search size={14} />}
            onClick={onDiscoverWorktrees}
          >
            Discover Worktrees
          </Menu.Item>
          <Menu.Item
            leftSection={<RefreshCw size={14} />}
            onClick={onRedetect}
          >
            Re-detect Recipes
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
    </>
  );
}
