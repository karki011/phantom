/**
 * FileTreeItem — single node in the file explorer tree
 *
 * Uses native onContextMenu with a Mantine Menu (opened state controlled)
 * since Mantine v9 doesn't support trigger="contextMenu".
 *
 * @author Subash Karki
 */
import { Group, Menu, Text, UnstyledButton } from '@mantine/core';
import {
  ChevronRight,
  ClipboardCopy,
  File,
  FileCode,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
} from 'lucide-react';
import { useCallback, useState } from 'react';
import type { FileEntry } from '../../lib/api';

interface FileTreeItemProps {
  entry: FileEntry;
  depth: number;
  isExpanded: boolean;
  isSelected: boolean;
  isLoading: boolean;
  onToggle: () => void;
  onClick: () => void;
  /** Absolute path to the worktree root — used to construct absolute file paths */
  basePath?: string;
}

/** Pick icon based on file extension */
function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'py':
    case 'rs':
    case 'go':
      return FileCode;
    case 'json':
      return FileJson;
    case 'md':
    case 'txt':
    case 'yml':
    case 'yaml':
    case 'toml':
      return FileText;
    default:
      return File;
  }
}


export function FileTreeItem({
  entry,
  depth,
  isExpanded,
  isSelected,
  isLoading,
  onToggle,
  onClick,
  basePath,
}: FileTreeItemProps) {
  const [menuOpened, setMenuOpened] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

  const Icon = entry.isDirectory
    ? isExpanded
      ? FolderOpen
      : Folder
    : getFileIcon(entry.name);

  const iconColor = entry.isDirectory
    ? 'var(--phantom-accent-gold)'
    : 'var(--phantom-text-muted)';

  const handleClick = () => {
    if (entry.isDirectory) {
      onToggle();
    } else {
      onClick();
    }
  };

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setMenuPosition({ x: e.clientX, y: e.clientY });
      setMenuOpened(true);
    },
    [],
  );

  const absolutePath = basePath
    ? `${basePath.replace(/\/$/, '')}/${entry.relativePath.replace(/^\//, '')}`
    : entry.relativePath;

  return (
    <Menu
      opened={menuOpened}
      onChange={(val) => { if (!val) setMenuOpened(false); }}
      position="bottom-start"
      withinPortal
      middlewares={{ shift: true, flip: true }}
      styles={{
        dropdown: {
          backgroundColor: 'var(--phantom-surface-card)',
          borderColor: 'var(--phantom-border-subtle)',
        },
      }}
    >
      <Menu.Target>
        <UnstyledButton
          onClick={handleClick}
          onContextMenu={handleContextMenu}
          data-file-path={entry.relativePath}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('text/plain', absolutePath);
            e.dataTransfer.setData('application/x-phantom-file', absolutePath);
            e.dataTransfer.effectAllowed = 'copy';
          }}
          style={{
            display: 'block',
            width: '100%',
            paddingTop: 2,
            paddingBottom: 2,
            paddingRight: 4,
            paddingLeft: depth * 20 + 4,
            borderRadius: 4,
            backgroundColor: isSelected
              ? 'var(--phantom-surface-hover)'
              : 'transparent',
            transition: 'background-color 100ms ease',
          }}
          onMouseEnter={(e) => {
            if (!isSelected)
              (e.currentTarget as HTMLElement).style.backgroundColor =
                'var(--phantom-surface-card)';
          }}
          onMouseLeave={(e) => {
            if (!isSelected)
              (e.currentTarget as HTMLElement).style.backgroundColor =
                'transparent';
          }}
        >
          <Group gap={4} wrap="nowrap">
            {entry.isDirectory && (
              <ChevronRight
                size={12}
                style={{
                  color: 'var(--phantom-text-muted)',
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 120ms ease',
                  flexShrink: 0,
                  opacity: isLoading ? 0.4 : 1,
                }}
              />
            )}
            {!entry.isDirectory && <div style={{ width: 12 }} />}
            <Icon
              size={14}
              style={{ color: iconColor, flexShrink: 0 }}
            />
            <Text
              fz="0.78rem"
              c="var(--phantom-text-secondary)"
              truncate
              style={{ flex: 1 }}
            >
              {entry.name}
            </Text>
          </Group>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {entry.isDirectory && (
          <>
            <Menu.Item fz="0.8rem">New File</Menu.Item>
            <Menu.Item fz="0.8rem">New Folder</Menu.Item>
            <Menu.Divider />
          </>
        )}
        <Menu.Item
          fz="0.8rem"
          leftSection={<ClipboardCopy size={14} />}
          onClick={() => navigator.clipboard.writeText(absolutePath)}
        >
          Copy Absolute Path
        </Menu.Item>
        <Menu.Item
          fz="0.8rem"
          leftSection={<ClipboardCopy size={14} />}
          onClick={() => navigator.clipboard.writeText(entry.relativePath)}
        >
          Copy Relative Path
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item fz="0.8rem">Rename</Menu.Item>
        <Menu.Item fz="0.8rem" color="red">
          Delete
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}
