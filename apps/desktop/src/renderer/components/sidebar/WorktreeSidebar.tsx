/**
 * WorktreeSidebar — left sidebar with project/worktree list
 * 2-click worktree flow: no modals for the happy path
 *
 * @author Subash Karki
 */
import {
  ActionIcon,
  Button,
  Group,
  ScrollArea,
  Skeleton,
  Text,
  Tooltip,
} from '@mantine/core';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  ChevronsLeft,
  FolderOpen,
  Plus,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  activeWorktreeIdAtom,
  expandedProjectsAtom,
  leftSidebarCollapsedAtom,
  leftSidebarWidthAtom,
  openRepositoryAtom,
  projectsAtom,
  projectsLoadingStateAtom,
  refreshProjectsAtom,
  refreshWorktreesAtom,
  worktreesByProjectAtom,
} from '../../atoms/worktrees';
import { showSystemNotification } from '../notifications/SystemToast';
import { ResizeHandle } from './ResizeHandle';
import { ProjectSection } from './ProjectSection';
import { EmptyState } from './EmptyState';

/** Call Electron's native folder picker via IPC */
const pickFolder = async (): Promise<string | null> => {
  try {
    const api = window.phantomOS;
    if (api?.invoke) {
      const result = await api.invoke('phantom:pick-folder');
      return result as string | null;
    }
    return window.prompt('Enter repository path:');
  } catch (err) {
    console.error('[WorktreeSidebar] Folder picker failed:', err);
    return window.prompt('Enter repository path:');
  }
};

export function WorktreeSidebar() {
  const projects = useAtomValue(projectsAtom);
  const loading = useAtomValue(projectsLoadingStateAtom);
  const worktreesByProject = useAtomValue(worktreesByProjectAtom);
  const [activeWorktreeId, setActiveWorktreeId] = useAtom(
    activeWorktreeIdAtom,
  );
  const [expandedProjects, setExpandedProjects] = useAtom(
    expandedProjectsAtom,
  );
  const [collapsed, setCollapsed] = useAtom(leftSidebarCollapsedAtom);
  const [width, setWidth] = useAtom(leftSidebarWidthAtom);

  const refreshProjects = useSetAtom(refreshProjectsAtom);
  const refreshWorktrees = useSetAtom(refreshWorktreesAtom);
  const openRepo = useSetAtom(openRepositoryAtom);

  const [isDragOver, setIsDragOver] = useState(false);

  // Track which project should show inline worktree input from header "+"
  const [inlineInputProjectId, setInlineInputProjectId] = useState<string | null>(null);

  // Fetch on mount
  useEffect(() => {
    refreshProjects();
    refreshWorktrees();
  }, [refreshProjects, refreshWorktrees]);

  // Auto-expand the project containing the active worktree (once on startup)
  const hasAutoExpanded = useRef(false);
  useEffect(() => {
    if (hasAutoExpanded.current || !activeWorktreeId || worktreesByProject.size === 0) return;
    for (const [projectId, wts] of worktreesByProject) {
      if (wts.some((w) => w.id === activeWorktreeId)) {
        hasAutoExpanded.current = true;
        if (!expandedProjects.includes(projectId)) {
          setExpandedProjects((prev) => [...prev, projectId]);
        }
        break;
      }
    }
  }, [activeWorktreeId, worktreesByProject]);

  const toggleProject = useCallback(
    (projectId: string) => {
      setExpandedProjects((prev) =>
        prev.includes(projectId)
          ? prev.filter((id) => id !== projectId)
          : [...prev, projectId],
      );
    },
    [setExpandedProjects],
  );

  const handleOpenRepository = useCallback(async () => {
    const folder = await pickFolder();
    if (!folder) return;
    try {
      await openRepo(folder);
      showSystemNotification(
        'Repository Opened',
        `Opened ${folder.split('/').pop() ?? folder}`,
        'success',
      );
    } catch (err) {
      showSystemNotification(
        'Error',
        'Failed to open repository.',
        'warning',
      );
      console.error('[WorktreeSidebar] openRepository failed:', err);
    }
  }, [openRepo]);

  const handleHeaderPlusClick = useCallback(() => {
    if (projects.length === 0) {
      handleOpenRepository();
      return;
    }
    // Expand first project and show inline input there
    const firstProject = projects[0];
    if (!expandedProjects.includes(firstProject.id)) {
      setExpandedProjects((prev) => [...prev, firstProject.id]);
    }
    setInlineInputProjectId(firstProject.id);
  }, [projects, expandedProjects, setExpandedProjects, handleOpenRepository]);

  // Drag-and-drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      // Try to extract folder path from dropped items
      const items = e.dataTransfer.files;
      if (items.length > 0) {
        const item = items[0];
        // Electron exposes .path on File objects
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const filePath = (item as any).path as string | undefined;
        if (filePath) {
          try {
            await openRepo(filePath);
            showSystemNotification(
              'Repository Opened',
              `Opened ${filePath.split('/').pop() ?? filePath}`,
              'success',
            );
          } catch {
            showSystemNotification(
              'Error',
              'Failed to open dropped folder.',
              'warning',
            );
          }
        }
      }
    },
    [openRepo],
  );

  if (collapsed) {
    return (
      <div
        style={{
          width: 40,
          minWidth: 40,
          height: '100%',
          backgroundColor: 'var(--phantom-surface-card)',
          borderRight: '1px solid var(--phantom-border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 8,
        }}
      >
        <Tooltip label="Expand sidebar" position="right">
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
          >
            <ChevronsLeft
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
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        width,
        minWidth: 160,
        maxWidth: 400,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--phantom-surface-card)',
        borderRight: '1px solid var(--phantom-border-subtle)',
        position: 'relative',
        // Drop indicator
        outline: isDragOver
          ? '2px solid var(--phantom-accent-purple)'
          : 'none',
        outlineOffset: -2,
        transition: 'outline 150ms ease',
      }}
    >
      {/* Header */}
      <Group
        justify="space-between"
        px="sm"
        py={8}
        style={{
          borderBottom: '1px solid var(--phantom-border-subtle)',
          flexShrink: 0,
        }}
      >
        <Text fz="0.8rem" fw={700} c="var(--phantom-text-primary)">
          Worktrees
        </Text>
        <Group gap={4}>
          <Tooltip label="New worktree">
            <ActionIcon
              variant="subtle"
              size="xs"
              onClick={handleHeaderPlusClick}
              aria-label="New worktree"
            >
              <Plus size={14} style={{ color: 'var(--phantom-text-muted)' }} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Collapse sidebar">
            <ActionIcon
              variant="subtle"
              size="xs"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
            >
              <ChevronsLeft
                size={14}
                style={{ color: 'var(--phantom-text-muted)' }}
              />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {/* Body */}
      {loading && projects.length === 0 ? (
        <div style={{ flex: 1, padding: '8px 12px' }}>
          <Skeleton height={20} mb={8} />
          <Skeleton height={16} mb={6} />
          <Skeleton height={16} mb={6} />
          <Skeleton height={20} mb={8} mt={12} />
          <Skeleton height={16} mb={6} />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState onOpenRepository={handleOpenRepository} />
      ) : (
      <ScrollArea style={{ flex: 1 }} scrollbarSize={6}>
        <div style={{ padding: '4px 0' }}>
          {projects.map((project, idx) => (
            <div key={project.id}>
              {idx > 0 && (
                <div style={{ height: 1, backgroundColor: 'var(--phantom-border-subtle)', margin: '6px 12px', opacity: 0.5 }} />
              )}
              <ProjectSection
                project={project}
                worktrees={worktreesByProject.get(project.id) ?? []}
                isExpanded={expandedProjects.includes(project.id)}
                activeWorktreeId={activeWorktreeId}
                onToggle={() => toggleProject(project.id)}
                onSelectWorktree={setActiveWorktreeId}
              />
            </div>
          ))}
        </div>
      </ScrollArea>
      )}

      {/* Footer */}
      <div
        style={{
          borderTop: '1px solid var(--phantom-border-subtle)',
          padding: '6px 8px',
          flexShrink: 0,
        }}
      >
        <Button
          variant="subtle"
          size="xs"
          fullWidth
          leftSection={
            <FolderOpen
              size={14}
              style={{ color: 'var(--phantom-text-muted)' }}
            />
          }
          onClick={handleOpenRepository}
          styles={{
            label: {
              color: 'var(--phantom-text-secondary)',
              fontSize: '0.75rem',
            },
          }}
        >
          Open Repository
        </Button>
      </div>

      {/* Resize handle on right edge */}
      <ResizeHandle
        position="right"
        onResize={(delta) =>
          setWidth((prev) => Math.max(160, Math.min(400, prev + delta)))
        }
      />
    </div>
  );
}
