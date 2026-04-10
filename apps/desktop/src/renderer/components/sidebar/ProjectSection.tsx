/**
 * ProjectSection — collapsible project group in the worktree sidebar
 * Supports hover "+" button, inline worktree input, context menu, and inline rename
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
import { ChevronRight, GitBranch, Plus, RefreshCw, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSetAtom } from 'jotai';
import type { DiscoveredWorktree, ProjectData, WorktreeData } from '../../lib/api';
import { detectProjectProfile, getDiscoveredWorktrees, importWorktree, renameProject } from '../../lib/api';
import { refreshProjectsAtom, refreshWorktreesAtom } from '../../atoms/worktrees';
import { WorktreeItem } from './WorktreeItem';
import { InlineWorktreeInput } from './InlineWorktreeInput';
import { ProjectContextMenu } from './ProjectContextMenu';
import { RemoveProjectDialog } from './RemoveProjectDialog';

interface ProjectSectionProps {
  project: ProjectData;
  worktrees: WorktreeData[];
  isExpanded: boolean;
  activeWorktreeId: string | null;
  onToggle: () => void;
  onSelectWorktree: (id: string) => void;
}

export function ProjectSection({
  project,
  worktrees,
  isExpanded,
  activeWorktreeId,
  onToggle,
  onSelectWorktree,
}: ProjectSectionProps) {
  const [showNewInput, setShowNewInput] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(project.name);
  const [isHovered, setIsHovered] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredWorktree[]>([]);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const refreshProjects = useSetAtom(refreshProjectsAtom);
  const refreshWorktrees = useSetAtom(refreshWorktreesAtom);

  const refreshDiscovered = useCallback(() => {
    if (project.id) {
      getDiscoveredWorktrees(project.id).then(setDiscovered).catch(() => setDiscovered([]));
    }
  }, [project.id]);

  useEffect(() => {
    if (isExpanded) refreshDiscovered();
  }, [isExpanded, refreshDiscovered]);

  useEffect(() => {
    if (isRenaming) {
      const timer = setTimeout(() => {
        renameInputRef.current?.focus();
        renameInputRef.current?.select();
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [isRenaming]);

  const handleRedetect = useCallback(async () => {
    try {
      await detectProjectProfile(project.id);
      refreshProjects();
    } catch {
      // silent — detection may take time; sidebar refreshes on next poll
    }
  }, [project.id, refreshProjects]);

  const handleImportWorktree = useCallback(async (path: string, branch: string) => {
    try {
      await importWorktree(project.id, { path, name: branch });
      refreshWorktrees();
      refreshProjects();
      // Remove from discovered list
      setDiscovered((prev) => prev.filter((d) => d.path !== path));
    } catch { /* silent */ }
  }, [project.id, refreshWorktrees, refreshProjects]);

  const handleAddWorktree = useCallback(() => {
    setShowNewInput(true);
    if (!isExpanded) onToggle();
  }, [isExpanded, onToggle]);

  const handleRenameSubmit = useCallback(async () => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === project.name) {
      setIsRenaming(false);
      return;
    }
    try {
      await renameProject(project.id, trimmed);
      refreshProjects();
    } catch {
      // Revert on failure
      setRenameValue(project.name);
    }
    setIsRenaming(false);
  }, [renameValue, project.id, project.name, refreshProjects]);

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
        onAddWorktree={handleAddWorktree}
        onRename={() => {
          setRenameValue(project.name);
          setIsRenaming(true);
        }}
        onRedetect={handleRedetect}
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
          <Group gap={4} wrap="nowrap">
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
                width: 8,
                height: 8,
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
              {worktrees.length}
            </Text>
            {!isRenaming && worktrees.length > 0 && (
              <Tooltip label="New worktree" position="right">
                <ActionIcon
                  variant="subtle"
                  size={18}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddWorktree();
                  }}
                  aria-label="New worktree"
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
        <div style={{ paddingLeft: 24, position: 'relative' }}>
          {worktrees.map((ws, index) => (
            <WorktreeItem
              key={ws.id}
              worktree={ws}
              isActive={ws.id === activeWorktreeId}
              onSelect={onSelectWorktree}
              isLast={index === worktrees.length - 1}
            />
          ))}
          {discovered.length > 0 && (
            <div
              style={{
                marginTop: 8,
                marginBottom: 4,
                padding: '6px 8px',
                borderRadius: 6,
                background: 'linear-gradient(135deg, color-mix(in srgb, var(--phantom-accent-glow) 12%, var(--phantom-surface-card)), color-mix(in srgb, var(--phantom-accent-purple) 10%, var(--phantom-surface-card)))',
                border: '1px solid color-mix(in srgb, var(--phantom-accent-glow) 25%, transparent)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <Sparkles size={10} style={{ color: 'var(--phantom-accent-glow)' }} />
                <Text
                  fz="0.6rem"
                  fw={700}
                  tt="uppercase"
                  c="var(--phantom-accent-glow)"
                  style={{ letterSpacing: '0.1em', textShadow: '0 0 8px var(--phantom-accent-glow)', flex: 1 }}
                >
                  Discovered
                </Text>
                <Tooltip label="Refresh" position="right">
                  <ActionIcon
                    size={14}
                    variant="subtle"
                    onClick={refreshDiscovered}
                    aria-label="Refresh discovered worktrees"
                    style={{ flexShrink: 0 }}
                  >
                    <RefreshCw size={9} style={{ color: 'var(--phantom-accent-glow)' }} />
                  </ActionIcon>
                </Tooltip>
              </div>
              {discovered.map((wt) => (
                <div
                  key={wt.path}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 6px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    transition: 'background-color 100ms ease',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'color-mix(in srgb, var(--phantom-accent-glow) 10%, transparent)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                  }}
                >
                  <GitBranch size={12} style={{ color: 'var(--phantom-accent-cyan)', flexShrink: 0 }} />
                  <Text fz="0.75rem" c="var(--phantom-text-primary)" truncate style={{ flex: 1 }}>
                    {wt.branch}
                  </Text>
                  <Tooltip label="Import worktree" position="right">
                    <ActionIcon
                      size={18}
                      variant="light"
                      color="teal"
                      radius="xl"
                      onClick={() => handleImportWorktree(wt.path, wt.branch)}
                      aria-label={`Import ${wt.branch}`}
                      style={{ flexShrink: 0 }}
                    >
                      <Plus size={10} />
                    </ActionIcon>
                  </Tooltip>
                </div>
              ))}
            </div>
          )}
          {worktrees.length === 0 && !showNewInput && (
            <UnstyledButton
              onClick={handleAddWorktree}
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
              Create new worktree
            </UnstyledButton>
          )}
          {showNewInput && (
            <InlineWorktreeInput
              projectId={project.id}
              projectName={project.name}
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
        worktreeCount={worktrees.length}
      />
    </div>
  );
}
