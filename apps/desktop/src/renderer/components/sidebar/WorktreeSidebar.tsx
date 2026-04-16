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
  AlertTriangle,
  ChevronsLeft,
  Download,
  FolderPlus,
  FolderSearch,
  Plus,
  Settings2,
  Star,
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
import { gitChangesCountAtom } from '../../atoms/fileExplorer';
import { showSystemNotification } from '../notifications/SystemToast';
import { ResizeHandle } from './ResizeHandle';
import { ProjectSection } from './ProjectSection';
import { EmptyState } from './EmptyState';
import { CloneRepoModal } from './CloneRepoModal';
import { ScanProjectsModal } from './ScanProjectsModal';
import { ManageProjectsModal } from './ManageProjectsModal';

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
  const gitChangesCount = useAtomValue(gitChangesCountAtom);

  const refreshProjects = useSetAtom(refreshProjectsAtom);
  const refreshWorktrees = useSetAtom(refreshWorktreesAtom);
  const openRepo = useSetAtom(openRepositoryAtom);

  const starredCount = projects.filter((p) => p.starred).length;
  const [isDragOver, setIsDragOver] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  // Track which project should show inline worktree input from header "+"
  const [inlineInputProjectId, setInlineInputProjectId] = useState<string | null>(null);

  // Fetch on mount — TanStack Query handles background refetch + SSE invalidation
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

  return (
    <div
      data-tour="sidebar"
      onDragOver={collapsed ? undefined : handleDragOver}
      onDragLeave={collapsed ? undefined : handleDragLeave}
      onDrop={collapsed ? undefined : handleDrop}
      style={{
        width: collapsed ? 40 : width,
        minWidth: collapsed ? 40 : 160,
        maxWidth: collapsed ? 40 : 400,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--phantom-surface-card)',
        borderRight: '1px solid var(--phantom-border-subtle)',
        position: 'relative',
        overflow: 'hidden',
        contain: 'content',
        outline: isDragOver
          ? '2px solid var(--phantom-accent-purple)'
          : 'none',
        outlineOffset: -2,
        transition: 'width 200ms ease, min-width 200ms ease, max-width 200ms ease, outline 150ms ease',
        willChange: 'width',
      }}
    >
      {collapsed ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
          {/* Expand chevron */}
          <div style={{ paddingTop: 8, paddingBottom: 6, borderBottom: '1px solid var(--phantom-border-subtle)', width: '100%', display: 'flex', justifyContent: 'center' }}>
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

          {/* Project avatars */}
          <ScrollArea style={{ flex: 1, width: '100%' }} scrollbarSize={4}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 0' }}>
              {projects.map((project) => {
                const worktrees = worktreesByProject.get(project.id) ?? [];
                const hasActive = worktrees.some((w) => w.id === activeWorktreeId);
                const color = project.color || 'var(--phantom-accent-purple, #a855f7)';
                const letter = (project.name?.[0] ?? '?').toUpperCase();

                const tooltipLines = [
                  project.name,
                  ...worktrees.map((w) =>
                    `${w.id === activeWorktreeId ? '\u25B8 ' : '  '}${w.name} (${w.branch})${w.id === activeWorktreeId ? ' \u2190 active' : ''}`
                  ),
                  `${worktrees.length} worktree${worktrees.length !== 1 ? 's' : ''}`,
                ];

                return (
                  <Tooltip
                    key={project.id}
                    label={tooltipLines.join('\n')}
                    multiline
                    position="right"
                    withArrow
                    openDelay={300}
                    styles={{ tooltip: { whiteSpace: 'pre-line', fontSize: '0.7rem', maxWidth: 260 } }}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setCollapsed(false);
                        if (!expandedProjects.includes(project.id)) {
                          setExpandedProjects((prev) => [...prev, project.id]);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setCollapsed(false);
                          if (!expandedProjects.includes(project.id)) {
                            setExpandedProjects((prev) => [...prev, project.id]);
                          }
                        }
                      }}
                      style={{
                        position: 'relative',
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: color,
                        backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)`,
                        border: hasActive
                          ? '2px solid var(--phantom-accent-cyan, #00d4ff)'
                          : '2px solid transparent',
                        opacity: hasActive ? 1 : 0.6,
                        cursor: 'pointer',
                        transition: 'opacity 150ms ease, border-color 150ms ease',
                        ...(hasActive ? { animation: 'collapsed-rail-pulse 2s ease-in-out infinite' } : {}),
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                      onMouseLeave={(e) => { if (!hasActive) (e.currentTarget as HTMLElement).style.opacity = '0.6'; }}
                    >
                      {letter}

                      {/* Gold dot — changes badge (active project only) */}
                      {hasActive && gitChangesCount > 0 && (
                        <span
                          style={{
                            position: 'absolute',
                            bottom: -1,
                            right: -1,
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: 'var(--phantom-accent-gold, #f59e0b)',
                            border: '1.5px solid var(--phantom-surface-card)',
                          }}
                        />
                      )}

                      {/* Starred overlay */}
                      {project.starred ? (
                        <Star
                          size={7}
                          style={{
                            position: 'absolute',
                            top: -2,
                            right: -2,
                            fill: 'var(--phantom-accent-gold, #f59e0b)',
                            color: 'var(--phantom-accent-gold, #f59e0b)',
                          }}
                        />
                      ) : null}
                    </div>
                  </Tooltip>
                );
              })}
            </div>
          </ScrollArea>

          {/* Warning icon for invalid worktrees */}
          {(() => {
            let invalidCount = 0;
            for (const [, wts] of worktreesByProject) {
              for (const w of wts) {
                if (w.worktreeValid === false) invalidCount++;
              }
            }
            if (invalidCount === 0) return null;
            return (
              <div style={{ padding: '4px 0', borderTop: '1px solid var(--phantom-border-subtle)', width: '100%', display: 'flex', justifyContent: 'center' }}>
                <Tooltip label={`${invalidCount} worktree${invalidCount !== 1 ? 's' : ''} missing — expand to fix`} position="right">
                  <div style={{ padding: 4, cursor: 'pointer' }} onClick={() => setCollapsed(false)}>
                    <AlertTriangle size={14} style={{ color: 'var(--phantom-status-warning, #f59e0b)' }} />
                  </div>
                </Tooltip>
              </div>
            );
          })()}

          {/* Footer actions */}
          <div style={{ borderTop: '1px solid var(--phantom-border-subtle)', padding: '6px 0', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <Tooltip label="Add project" position="right">
              <ActionIcon
                variant="subtle"
                size="sm"
                onClick={handleOpenRepository}
                aria-label="Add project"
              >
                <Plus size={14} style={{ color: 'var(--phantom-text-muted)' }} />
              </ActionIcon>
            </Tooltip>
            {projects.length > 0 && (
              <Tooltip label="Manage projects" position="right">
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  onClick={() => setManageOpen(true)}
                  aria-label="Manage projects"
                >
                  <Settings2 size={14} style={{ color: 'var(--phantom-text-muted)' }} />
                </ActionIcon>
              </Tooltip>
            )}
          </div>

          {/* Modals still need to be available in collapsed mode */}
          <ManageProjectsModal opened={manageOpen} onClose={() => setManageOpen(false)} />

          <style>{`@keyframes collapsed-rail-pulse {
            0%, 100% { border-color: var(--phantom-accent-cyan, #00d4ff); box-shadow: 0 0 4px rgba(0, 212, 255, 0.3); }
            50% { border-color: var(--phantom-accent-cyan, #00d4ff); box-shadow: 0 0 10px rgba(0, 212, 255, 0.5); }
          }`}</style>
        </div>
      ) : (
        <>
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
            <Text fz="0.8rem" fw={700} c="var(--phantom-text-primary)" style={{ whiteSpace: 'nowrap' }}>
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
              {/* Starred projects section */}
              {starredCount > 0 && (
                <>
                  <div style={{ padding: '4px 12px 2px', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Star size={10} style={{ fill: 'var(--phantom-accent-gold)', color: 'var(--phantom-accent-gold)' }} />
                    <Text fz="0.65rem" fw={600} c="var(--phantom-accent-gold)" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
                      Starred
                    </Text>
                    <Text fz="0.6rem" c="var(--phantom-text-muted)" ml="auto">{starredCount}/5</Text>
                  </div>
                  {projects.filter((p) => p.starred).map((project) => (
                    <ProjectSection
                      key={project.id}
                      project={project}
                      worktrees={worktreesByProject.get(project.id) ?? []}
                      isExpanded={expandedProjects.includes(project.id)}
                      activeWorktreeId={activeWorktreeId}
                      starredCount={starredCount}
                      onToggle={() => toggleProject(project.id)}
                      onSelectWorktree={setActiveWorktreeId}
                    />
                  ))}
                  <div style={{ height: 1, backgroundColor: 'var(--phantom-border-subtle)', margin: '8px 12px', opacity: 0.5 }} />
                </>
              )}
              {/* All other projects */}
              {projects.filter((p) => !p.starred).map((project, idx) => (
                <div key={project.id}>
                  {idx > 0 && (
                    <div style={{ height: 1, backgroundColor: 'var(--phantom-border-subtle)', margin: '6px 12px', opacity: 0.5 }} />
                  )}
                  <ProjectSection
                    project={project}
                    worktrees={worktreesByProject.get(project.id) ?? []}
                    isExpanded={expandedProjects.includes(project.id)}
                    activeWorktreeId={activeWorktreeId}
                    starredCount={starredCount}
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
            data-tour="add-project"
            style={{
              borderTop: '1px solid var(--phantom-border-subtle)',
              padding: '6px 8px',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', gap: '4px' }}>
              <Button
                variant="subtle"
                size="xs"
                style={{ flex: 1 }}
                leftSection={
                  <FolderPlus
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
                Add Project
              </Button>
              <Tooltip label="Scan directory for repos" position="top">
                <Button
                  variant="subtle"
                  size="xs"
                  px={8}
                  onClick={() => setScanOpen(true)}
                  styles={{
                    label: {
                      color: 'var(--phantom-text-secondary)',
                      fontSize: '0.75rem',
                    },
                  }}
                >
                  <FolderSearch
                    size={14}
                    style={{ color: 'var(--phantom-text-muted)' }}
                  />
                </Button>
              </Tooltip>
              <Tooltip label="Clone repository" position="top">
                <Button
                  variant="subtle"
                  size="xs"
                  px={8}
                  onClick={() => setCloneOpen(true)}
                  styles={{
                    label: {
                      color: 'var(--phantom-text-secondary)',
                      fontSize: '0.75rem',
                    },
                  }}
                >
                  <Download
                    size={14}
                    style={{ color: 'var(--phantom-text-muted)' }}
                  />
                </Button>
              </Tooltip>
              {projects.length > 0 && (
                <Tooltip label="Manage projects" position="top">
                  <Button
                    variant="subtle"
                    size="xs"
                    px={8}
                    onClick={() => setManageOpen(true)}
                    styles={{
                      label: {
                        color: 'var(--phantom-text-secondary)',
                        fontSize: '0.75rem',
                      },
                    }}
                  >
                    <Settings2
                      size={14}
                      style={{ color: 'var(--phantom-text-muted)' }}
                    />
                  </Button>
                </Tooltip>
              )}
            </div>
          </div>

          <CloneRepoModal opened={cloneOpen} onClose={() => setCloneOpen(false)} />
          <ScanProjectsModal opened={scanOpen} onClose={() => setScanOpen(false)} />
          <ManageProjectsModal opened={manageOpen} onClose={() => setManageOpen(false)} />

          {/* Resize handle on right edge */}
          <ResizeHandle
            position="right"
            onResize={(delta) =>
              setWidth((prev) => Math.max(160, Math.min(400, prev + delta)))
            }
          />
        </>
      )}
    </div>
  );
}
