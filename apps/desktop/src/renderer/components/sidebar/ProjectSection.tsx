/**
 * ProjectSection — collapsible project group in the workspace sidebar
 *
 * @author Subash Karki
 */
import { Collapse, Group, Text, UnstyledButton } from '@mantine/core';
import { ChevronRight } from 'lucide-react';
import type { ProjectData, WorkspaceData } from '../../lib/api';
import { WorkspaceItem } from './WorkspaceItem';

interface ProjectSectionProps {
  project: ProjectData;
  workspaces: WorkspaceData[];
  isExpanded: boolean;
  activeWorkspaceId: string | null;
  onToggle: () => void;
  onSelectWorkspace: (id: string) => void;
}

export function ProjectSection({
  project,
  workspaces,
  isExpanded,
  activeWorkspaceId,
  onToggle,
  onSelectWorkspace,
}: ProjectSectionProps) {
  return (
    <div>
      <UnstyledButton
        onClick={onToggle}
        py={6}
        px="sm"
        style={{
          display: 'block',
          width: '100%',
          borderRadius: 4,
          transition: 'background-color 120ms ease',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor =
            'var(--phantom-surface-card)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor =
            'transparent';
        }}
      >
        <Group gap={8} wrap="nowrap">
          <ChevronRight
            size={14}
            style={{
              color: 'var(--phantom-text-muted)',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 150ms ease',
              flexShrink: 0,
            }}
          />
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: project.color || 'var(--phantom-accent-purple)',
              flexShrink: 0,
            }}
          />
          <Text
            fz="0.8rem"
            fw={600}
            c="var(--phantom-text-primary)"
            truncate
            style={{ flex: 1 }}
          >
            {project.name}
          </Text>
          <Text fz="0.7rem" c="var(--phantom-text-muted)">
            {workspaces.length}
          </Text>
        </Group>
      </UnstyledButton>

      <Collapse expanded={isExpanded}>
        <div style={{ paddingLeft: 18 }}>
          {workspaces.map((ws) => (
            <WorkspaceItem
              key={ws.id}
              workspace={ws}
              isActive={ws.id === activeWorkspaceId}
              onSelect={onSelectWorkspace}
            />
          ))}
          {workspaces.length === 0 && (
            <Text fz="0.75rem" c="var(--phantom-text-muted)" py={4} px="sm">
              No workspaces
            </Text>
          )}
        </div>
      </Collapse>
    </div>
  );
}
