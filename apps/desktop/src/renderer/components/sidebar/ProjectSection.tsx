/**
 * ProjectSection — collapsible project group in the workspace sidebar
 * Supports hover "+" button, inline workspace input, context menu, and inline rename
 *
 * @author Subash Karki
 */
import {
  ActionIcon,
  Collapse,
  Group,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { ChevronRight, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectData, WorkspaceData } from '../../lib/api';
import { WorkspaceItem } from './WorkspaceItem';
import { InlineWorkspaceInput } from './InlineWorkspaceInput';
import { ProjectContextMenu } from './ProjectContextMenu';
import { RemoveProjectDialog } from './RemoveProjectDialog';

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
  const [showNewInput, setShowNewInput] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(project.name);
  const [isHovered, setIsHovered] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      const timer = setTimeout(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [isRenaming]);

  const handleAddWorkspace = useCallback(() => {
    setShowNewInput(true);
    if (!isExpanded) onToggle();
  }, [isExpanded, onToggle]);

  const handleRenameSubmit = useCallback(() => {
    // TODO: wire up renameProject API when available
    setIsRenaming(false);
  }, []);

  const handleRenameKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleRenameSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setIsRenaming(false);
      }
    },
    [handleRenameSubmit],
  );

  return (
    <div>
      <ProjectContextMenu
        onAddWorkspace={handleAddWorkspace}
        onRename={() => {
          setRenameValue(project.name);
          setIsRenaming(true);
        }}
        onRemoveProject={() => setShowRemoveDialog(true)}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={onToggle}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            display: 'block',
            width: '100%',
            borderRadius: 4,
            padding: '6px 12px',
            cursor: 'pointer',
            transition: 'background-color 120ms ease',
            backgroundColor: isHovered
              ? 'var(--phantom-surface-card)'
              : 'transparent',
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
                backgroundColor:
                  project.color || 'var(--phantom-accent-purple)',
                flexShrink: 0,
              }}
            />
            {isRenaming ? (
              <TextInput
                ref={renameInputRef}
                value={renameValue}
                onChange={(e) => setRenameValue(e.currentTarget.value)}
                onKeyDown={handleRenameKeyDown}
                onClick={(e) => e.stopPropagation()}
                size="xs"
                styles={{
                  input: {
                    height: 22,
                    minHeight: 22,
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    backgroundColor: 'var(--phantom-surface-bg)',
                    borderColor: 'var(--phantom-border-subtle)',
                    color: 'var(--phantom-text-primary)',
                    padding: '0 4px',
                  },
                }}
                style={{ flex: 1 }}
              />
            ) : (
              <Text
                fz="0.8rem"
                fw={600}
                c="var(--phantom-text-primary)"
                truncate
                style={{ flex: 1 }}
              >
                {project.name}
              </Text>
            )}
            <Text fz="0.7rem" c="var(--phantom-text-muted)">
              {workspaces.length}
            </Text>
            {!isRenaming && (
              <Tooltip label="New workspace" position="right">
                <ActionIcon
                  variant="subtle"
                  size={18}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddWorkspace();
                  }}
                  aria-label="New workspace"
                  style={{ flexShrink: 0 }}
                >
                  <Plus
                    size={12}
                    style={{ color: 'var(--phantom-text-muted)' }}
                  />
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </div>
      </ProjectContextMenu>

      <Collapse expanded={isExpanded}>
        <div style={{ paddingLeft: 18, position: 'relative' }}>
          {workspaces.map((ws, index) => (
            <WorkspaceItem
              key={ws.id}
              workspace={ws}
              isActive={ws.id === activeWorkspaceId}
              onSelect={onSelectWorkspace}
              isLast={index === workspaces.length - 1}
            />
          ))}
          {workspaces.length === 0 && !showNewInput && (
            <UnstyledButton
              onClick={handleAddWorkspace}
              py={6}
              px="sm"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                width: '100%',
                borderRadius: 4,
                color: 'var(--phantom-text-muted)',
                fontSize: '0.75rem',
              }}
            >
              <Plus size={12} />
              Create new workspace
            </UnstyledButton>
          )}
          {showNewInput && (
            <InlineWorkspaceInput
              projectId={project.id}
              onDone={() => setShowNewInput(false)}
            />
          )}
        </div>
      </Collapse>

      <RemoveProjectDialog
        opened={showRemoveDialog}
        onClose={() => setShowRemoveDialog(false)}
        projectId={project.id}
        projectName={project.name}
        workspaceCount={workspaces.length}
      />
    </div>
  );
}
