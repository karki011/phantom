/**
 * WorkspaceSidebar — left sidebar with project/workspace list
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
  FolderPlus,
  Plus,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
  activeWorkspaceIdAtom,
  expandedProjectsAtom,
  leftSidebarCollapsedAtom,
  leftSidebarWidthAtom,
  projectsAtom,
  projectsLoadingStateAtom,
  refreshProjectsAtom,
  refreshWorkspacesAtom,
  workspacesByProjectAtom,
} from '../../atoms/workspaces';
import { ResizeHandle } from './ResizeHandle';
import { ProjectSection } from './ProjectSection';
import { NewWorkspaceModal } from './NewWorkspaceModal';
import { AddProjectModal } from './AddProjectModal';

export function WorkspaceSidebar() {
  const projects = useAtomValue(projectsAtom);
  const loading = useAtomValue(projectsLoadingStateAtom);
  const workspacesByProject = useAtomValue(workspacesByProjectAtom);
  const [activeWorkspaceId, setActiveWorkspaceId] = useAtom(
    activeWorkspaceIdAtom,
  );
  const [expandedProjects, setExpandedProjects] = useAtom(
    expandedProjectsAtom,
  );
  const [collapsed, setCollapsed] = useAtom(leftSidebarCollapsedAtom);
  const [width, setWidth] = useAtom(leftSidebarWidthAtom);

  const refreshProjects = useSetAtom(refreshProjectsAtom);
  const refreshWorkspaces = useSetAtom(refreshWorkspacesAtom);

  const [wsModalOpen, setWsModalOpen] = useState(false);
  const [projModalOpen, setProjModalOpen] = useState(false);

  // Fetch on mount
  useEffect(() => {
    refreshProjects();
    refreshWorkspaces();
  }, [refreshProjects, refreshWorkspaces]);

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
          Workspaces
        </Text>
        <Group gap={4}>
          <Tooltip label="New workspace">
            <ActionIcon
              variant="subtle"
              size="xs"
              onClick={() => setWsModalOpen(true)}
              aria-label="New workspace"
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
      <ScrollArea style={{ flex: 1 }} scrollbarSize={6}>
        <div style={{ padding: '4px 0' }}>
          {loading && projects.length === 0 ? (
            <div style={{ padding: '8px 12px' }}>
              <Skeleton height={20} mb={8} />
              <Skeleton height={16} mb={6} />
              <Skeleton height={16} mb={6} />
              <Skeleton height={20} mb={8} mt={12} />
              <Skeleton height={16} mb={6} />
            </div>
          ) : projects.length === 0 ? (
            <Text
              fz="0.75rem"
              c="var(--phantom-text-muted)"
              ta="center"
              py="lg"
              px="sm"
            >
              No projects yet. Add a project to get started.
            </Text>
          ) : (
            projects.map((project) => (
              <ProjectSection
                key={project.id}
                project={project}
                workspaces={workspacesByProject.get(project.id) ?? []}
                isExpanded={expandedProjects.includes(project.id)}
                activeWorkspaceId={activeWorkspaceId}
                onToggle={() => toggleProject(project.id)}
                onSelectWorkspace={setActiveWorkspaceId}
              />
            ))
          )}
        </div>
      </ScrollArea>

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
            <FolderPlus
              size={14}
              style={{ color: 'var(--phantom-text-muted)' }}
            />
          }
          onClick={() => setProjModalOpen(true)}
          styles={{
            label: {
              color: 'var(--phantom-text-secondary)',
              fontSize: '0.75rem',
            },
          }}
        >
          Add Project
        </Button>
      </div>

      {/* Resize handle on right edge */}
      <ResizeHandle
        position="right"
        onResize={(delta) =>
          setWidth((prev) => Math.max(160, Math.min(400, prev + delta)))
        }
      />

      {/* Modals */}
      <NewWorkspaceModal
        opened={wsModalOpen}
        onClose={() => setWsModalOpen(false)}
      />
      <AddProjectModal
        opened={projModalOpen}
        onClose={() => setProjModalOpen(false)}
      />
    </div>
  );
}
