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
import { Check, ChevronRight, GitBranch, Loader2, Plus, RefreshCw, Sparkles, Star } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { enrichmentItemStatusAtom } from '../../atoms/enrichment';
import type { DiscoveredWorktree, ProjectData, WorktreeData } from '../../lib/api';
import { detectProjectProfile, getDiscoveredWorktrees, importWorktree, renameProject, toggleProjectStar } from '../../lib/api';
import { refreshProjectsAtom, refreshWorktreesAtom } from '../../atoms/worktrees';
import { WorktreeItem } from './WorktreeItem';
import { InlineWorktreeInput } from './InlineWorktreeInput';
import { ProjectContextMenu } from './ProjectContextMenu';
import { RemoveProjectDialog } from './RemoveProjectDialog';
import { BranchSwitcher } from './BranchSwitcher';
import { PrBadge } from './PrBadge';

interface ProjectSectionProps {
  project: ProjectData;
  worktrees: WorktreeData[];
  isExpanded: boolean;
  activeWorktreeId: string | null;
  starredCount: number;
  onToggle: () => void;
  onSelectWorktree: (id: string) => void;
}

const MAX_STARRED = 5;

export const ProjectSection = React.memo(function ProjectSection({
  project,
  worktrees,
  isExpanded,
  activeWorktreeId,
  starredCount,
  onToggle,
  onSelectWorktree,
}: ProjectSectionProps) {
  const [showNewInput, setShowNewInput] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(project.name);
  const [isHovered, setIsHovered] = useState(false);
  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [discovered, setDiscovered] = useState<DiscoveredWorktree[]>([]);
  const [showComplete, setShowComplete] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const refreshProjects = useSetAtom(refreshProjectsAtom);
  const refreshWorktrees = useSetAtom(refreshWorktreesAtom);
  const getEnrichmentStatus = useAtomValue(enrichmentItemStatusAtom);
  const enrichmentStatus = getEnrichmentStatus(project.id);
  const isPending = project.id.startsWith('pending-');

  // Show check icon briefly when enrichment completes, then fade
  useEffect(() => {
    if (enrichmentStatus === 'complete') {
      setShowComplete(true);
      const timer = setTimeout(() => setShowComplete(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [enrichmentStatus]);

  const refreshDiscovered = useCallback(() => {
    if (project.id) {
      getDiscoveredWorktrees(project.id).then(setDiscovered).catch(() => setDiscovered([]));
    }
  }, [project.id]);

  useEffect(() => {
    if (isExpanded) refreshDiscovered();
  }, [isExpanded, refreshDiscovered]);

  // Refresh discovered worktrees on window focus (no polling — TanStack Query handles intervals)
  useEffect(() => {
    if (!isExpanded) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshDiscovered();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
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

  const handleToggleStar = useCallback(async () => {
    try {
      await toggleProjectStar(project.id);
      refreshProjects();
    } catch { /* silent */ }
  }, [project.id, refreshProjects]);

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
        repoPath={project.repoPath}
        isStarred={!!project.starred}
        onToggleStar={handleToggleStar}
        onAddWorktree={handleAddWorktree}
        onRename={() => {
          setRenameValue(project.name);
          setIsRenaming(true);
        }}
        onRedetect={handleRedetect}
        onDiscoverWorktrees={() => {
          if (!isExpanded) onToggle();
          refreshDiscovered();
        }}
        onRemoveProject={() => setShowRemoveDialog(true)}
      >
        <div
          role="button"
          tabIndex={isPending ? -1 : 0}
          onClick={isPending ? undefined : onToggle}
          onKeyDown={isPending ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') onToggle(); }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            display: 'block',
            width: '100%',
            borderRadius: 4,
            padding: '6px 12px',
            cursor: isPending ? 'default' : 'pointer',
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
            {isPending ? (
              <Loader2
                size={10}
                style={{
                  color: 'var(--phantom-text-muted)',
                  flexShrink: 0,
                  animation: 'spin 1s linear infinite',
                }}
              />
            ) : (
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
            )}
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
                c={isPending ? 'var(--phantom-text-muted)' : 'var(--phantom-text-primary)'}
                truncate
                style={{ flex: 1, opacity: isPending ? 0.6 : 1 }}
              >
                {project.name}
              </Text>
            )}
            {enrichmentStatus === 'building' && (
              <Loader2
                size={10}
                style={{
                  color: '#00d4ff',
                  flexShrink: 0,
                  animation: 'spin 1s linear infinite',
                }}
              />
            )}
            {showComplete && (
              <Check
                size={10}
                style={{
                  color: '#22c55e',
                  flexShrink: 0,
                  opacity: 1,
                  transition: 'opacity 500ms ease',
                }}
              />
            )}
            <Tooltip
              label={project.starred ? 'Unstar' : starredCount >= MAX_STARRED ? `Max ${MAX_STARRED} starred` : 'Star project'}
              position="right"
            >
              <ActionIcon
                variant="subtle"
                size={18}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!project.starred && starredCount >= MAX_STARRED) return;
                  handleToggleStar();
                }}
                aria-label={project.starred ? 'Unstar project' : 'Star project'}
                style={{
                  flexShrink: 0,
                  cursor: !project.starred && starredCount >= MAX_STARRED ? 'not-allowed' : 'pointer',
                  opacity: !project.starred && starredCount >= MAX_STARRED ? 0.3 : 1,
                }}
              >
                <Star
                  size={11}
                  style={project.starred
                    ? { fill: 'var(--phantom-accent-gold)', color: 'var(--phantom-accent-gold)' }
                    : { color: 'var(--phantom-text-muted)' }
                  }
                />
              </ActionIcon>
            </Tooltip>
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
          {/* Branch-type worktrees first — show with BranchSwitcher */}
          {worktrees
            .filter((ws) => ws.type === 'branch')
            .map((ws) => (
              <BranchSwitcher
                key={ws.id}
                worktreeId={ws.id}
                projectId={project.id}
                currentBranch={ws.branch}
                worktreePath={ws.worktreePath ?? undefined}
                onSwitch={() => {
                  refreshWorktrees();
                }}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectWorktree(ws.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') onSelectWorktree(ws.id);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 8px',
                    borderRadius: 4,
                    marginBottom: 2,
                    cursor: 'pointer',
                    backgroundColor:
                      ws.id === activeWorktreeId
                        ? 'var(--phantom-surface-hover)'
                        : 'transparent',
                    transition: 'background-color 120ms ease',
                  }}
                  onMouseEnter={(e) => {
                    if (ws.id !== activeWorktreeId)
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        'var(--phantom-surface-card)';
                  }}
                  onMouseLeave={(e) => {
                    if (ws.id !== activeWorktreeId)
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        'transparent';
                  }}
                >
                  <GitBranch
                    size={12}
                    style={{
                      color: 'var(--phantom-accent-cyan)',
                      flexShrink: 0,
                    }}
                  />
                  <Text
                    fz="0.75rem"
                    fw={ws.id === activeWorktreeId ? 500 : 400}
                    c="var(--phantom-text-primary)"
                    truncate
                    style={{
                      flex: 1,
                      fontFamily: 'JetBrains Mono, monospace',
                    }}
                  >
                    {ws.branch}
                  </Text>
                  <PrBadge worktreeId={ws.id} />
                  <Text fz="0.65rem" c="var(--phantom-text-muted)">
                    {ws.name}
                  </Text>
                </div>
              </BranchSwitcher>
            ))}
          {/* Regular worktrees */}
          {worktrees
            .filter((ws) => ws.type !== 'branch')
            .map((ws, index, filtered) => (
              <WorktreeItem
                key={ws.id}
                worktree={ws}
                isActive={ws.id === activeWorktreeId}
                onSelect={onSelectWorktree}
                isLast={index === filtered.length - 1}
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
      {enrichmentStatus === 'building' && (
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      )}
    </div>
  );
});
