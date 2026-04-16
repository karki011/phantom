/**
 * RightSidebar — file explorer and changes tabs
 *
 * @author Subash Karki
 */
import type React from 'react';
import { useEffect } from 'react';
import {
  ActionIcon,
  Tabs,
  Tooltip,
} from '@mantine/core';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { ChevronsRight } from 'lucide-react';

import {
  activeWorktreeAtom,
  rightSidebarCollapsedAtom,
  rightSidebarWidthAtom,
} from '../../atoms/worktrees';
import {
  expandedFoldersAtom,
  fetchDirectoryAtom,
  rightSidebarTabAtom,
  selectedFileAtom,
  gitChangesCountAtom,
  rootFileCountAtom,
  trimFileTreeCacheAtom,
} from '../../atoms/fileExplorer';
import {
  activePrStatusAtom,
  activeIsCreatingPrAtom,
} from '../../atoms/activity';
import { gitFetch, invalidateCache } from '../../lib/api';
import { queryClient } from '../../lib/queryClient';
import { ResizeHandle } from './ResizeHandle';
import { FilesView } from './FilesView';
import { ChangesView } from './ChangesView';
import { GitActivityPanel } from './GitActivityPanel';

type SidebarTab = 'files' | 'changes' | 'activity';

export function RightSidebar() {
  const [collapsed, setCollapsed] = useAtom(rightSidebarCollapsedAtom);
  const [width, setWidth] = useAtom(rightSidebarWidthAtom);
  const [activeTab, setActiveTab] = useAtom(rightSidebarTabAtom);
  const changesCount = useAtomValue(gitChangesCountAtom);
  const fileCount = useAtomValue(rootFileCountAtom);
  const activePr = useAtomValue(activePrStatusAtom);
  const isCreatingPr = useAtomValue(activeIsCreatingPrAtom);

  // ------------------------------------------------------------------
  // Worktree-switch data management
  //
  // RightSidebar is always mounted, so it owns the reset + polling
  // for ALL three tabs. Mantine Tabs.Panel unmounts inactive children,
  // which means child components (FilesView, ChangesView, GitActivityPanel)
  // can't reliably run effects when their tab isn't selected.
  // ------------------------------------------------------------------
  const worktree = useAtomValue(activeWorktreeAtom);

  // --- Changes tab: git status via TanStack Query ---
  // Git status is now a per-worktree query (stale-while-revalidate).
  // Switching back to a previously visited worktree shows cached data instantly.
  // Manual refresh events invalidate the query to trigger background refetch.
  useEffect(() => {
    if (!worktree?.id) return;
    const wtId = worktree.id;

    const onManualRefresh = () => {
      queryClient.invalidateQueries({ queryKey: ['git-status', wtId] });
    };
    window.addEventListener('phantom:git-refresh', onManualRefresh);

    return () => {
      window.removeEventListener('phantom:git-refresh', onManualRefresh);
    };
  }, [worktree?.id]);

  // --- Files tab: reset UI state + prefetch root ---
  // File tree cache is keyed by `${worktreeId}:${path}` so data is naturally
  // per-worktree isolated — no need to clear it on switch. We only reset
  // UI state (selectedFile, expandedFolders) which is NOT per-worktree keyed.
  const fetchDirectory = useSetAtom(fetchDirectoryAtom);
  const setSelectedFile = useSetAtom(selectedFileAtom);
  const setExpandedFolders = useSetAtom(expandedFoldersAtom);
  const trimFileTreeCache = useSetAtom(trimFileTreeCacheAtom);

  useEffect(() => {
    // Reset UI state (not per-worktree keyed) but keep file tree cache warm
    setSelectedFile(null);
    setExpandedFolders([]);
    if (worktree?.id) {
      fetchDirectory({ worktreeId: worktree.id, path: '/' });
      trimFileTreeCache(worktree.id);
    }
  }, [worktree?.id, fetchDirectory, setSelectedFile, setExpandedFolders, trimFileTreeCache]);

  // --- Real-time file watching via main-process fs.watch ---
  useEffect(() => {
    if (!worktree?.worktreePath || !worktree?.id) return;

    const wtPath = worktree.worktreePath;
    const wtId = worktree.id;

    // Start watching the worktree directory (recursive, uses FSEvents on macOS)
    window.phantomOS?.watchDirectory?.(wtPath);

    // Listen for batched fs-change events from the main process
    const cleanup = window.phantomOS?.onFsChange?.((data) => {
      if (data.rootPath !== wtPath) return;

      // Git ref changes (.git/refs/) = new/deleted branches
      if (data.dir === '.git/refs') {
        invalidateCache('/api/projects');
        queryClient.invalidateQueries({ queryKey: ['git-status', wtId] });
        return;
      }

      // File changes — refresh tree + git status
      fetchDirectory({ worktreeId: wtId, path: data.dir || '/' });
      queryClient.invalidateQueries({ queryKey: ['git-status', wtId] });
    });

    return () => {
      cleanup?.();
      window.phantomOS?.unwatchDirectory?.(wtPath);
    };
  }, [worktree?.id, worktree?.worktreePath, fetchDirectory]);

  // --- Activity tab: atomFamily data persists across switches ---
  // prStatusFamily, ciRunsFamily, commitsFamily are keyed by worktreeId,
  // so data is naturally isolated. Keeping it warm avoids redundant fetches
  // when switching back. GitActivityPanel fetches fresh data on mount anyway.

  // --- Background git fetch every 60s so ahead/behind counts stay fresh ---
  useEffect(() => {
    if (!worktree) return;
    const wtId = worktree.id;
    gitFetch(wtId).catch(() => {});
    const interval = setInterval(() => gitFetch(wtId).catch(() => {}), 60_000);
    return () => clearInterval(interval);
  }, [worktree?.id]);

  // --- Reveal file in sidebar (triggered from tab context menu) ---
  useEffect(() => {
    const handler = (e: CustomEvent<{ filePath: string }>) => {
      const filePath = e.detail?.filePath;
      if (!filePath || !worktree) return;

      // Switch to Files tab so the tree is visible
      setActiveTab('files');
      setSelectedFile(filePath);

      // Expand parent directories
      const normalized = filePath.replace(/^\//, '');
      const parts = normalized.split('/');
      const parentPaths: string[] = [];
      for (let i = 1; i < parts.length; i++) {
        parentPaths.push(parts.slice(0, i).join('/'));
      }

      setExpandedFolders((prev: string[]) => {
        const toAdd = parentPaths.filter((p) => !prev.includes(p));
        return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
      });

      // Fetch any unfetched parent directories
      for (const dirPath of parentPaths) {
        fetchDirectory({ worktreeId: worktree.id, path: dirPath });
      }

      // Scroll the file into view after the tree renders
      setTimeout(() => {
        const el = document.querySelector(`[data-file-path="${CSS.escape(filePath)}"]`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 250);
    };

    window.addEventListener('phantom:reveal-file' as any, handler);
    return () => window.removeEventListener('phantom:reveal-file' as any, handler);
  }, [worktree?.id, setActiveTab, setSelectedFile, setExpandedFolders, fetchDirectory]);

  if (collapsed) {
    return (
      <div
        style={{
          width: 40,
          minWidth: 40,
          height: '100%',
          backgroundColor: 'var(--phantom-surface-card)',
          borderLeft: '1px solid var(--phantom-border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 8,
        }}
      >
        <Tooltip label="Expand sidebar" position="left">
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
          >
            <ChevronsRight
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
      data-tour="right-sidebar"
      style={{
        width,
        minWidth: 180,
        maxWidth: 500,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--phantom-surface-card)',
        borderLeft: '1px solid var(--phantom-border-subtle)',
        position: 'relative',
        contain: 'content',
        willChange: 'width',
      }}
    >
      <Tabs
        value={activeTab}
        onChange={(val) => { if (val) setActiveTab(val as SidebarTab); }}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {/* Tab bar */}
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <Tabs.List
            style={{
              flex: 1,
              borderBottom: '1px solid var(--phantom-border-subtle)',
              '--tabs-list-border-size': '0px',
            } as React.CSSProperties}
          >
            <Tabs.Tab
              value="files"
              fz="0.78rem"
              fw={activeTab === 'files' ? 600 : 400}
              c={activeTab === 'files' ? 'var(--phantom-text-primary)' : 'var(--phantom-text-muted)'}
              style={{ flex: 1, justifyContent: 'center', borderBottom: activeTab === 'files' ? '2px solid var(--phantom-accent-cyan)' : '2px solid transparent' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                Files
                {fileCount > 0 && (
                  <span style={{ fontSize: '0.6rem', fontWeight: 600, lineHeight: 1, padding: '1px 5px', borderRadius: 8, backgroundColor: 'var(--phantom-surface-elevated, #2a2a2a)', color: 'var(--phantom-text-muted)' }}>
                    {fileCount}
                  </span>
                )}
              </span>
            </Tabs.Tab>
            <Tabs.Tab
              value="changes"
              fz="0.78rem"
              fw={activeTab === 'changes' ? 600 : 400}
              c={activeTab === 'changes' ? 'var(--phantom-text-primary)' : 'var(--phantom-text-muted)'}
              style={{ flex: 1, justifyContent: 'center', borderBottom: activeTab === 'changes' ? '2px solid var(--phantom-accent-cyan)' : '2px solid transparent' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                Changes
                {changesCount > 0 && (
                  <span style={{ fontSize: '0.6rem', fontWeight: 600, lineHeight: 1, padding: '1px 5px', borderRadius: 8, backgroundColor: 'var(--phantom-accent-gold, #f59e0b)', color: '#000' }}>
                    {changesCount}
                  </span>
                )}
              </span>
            </Tabs.Tab>
            <Tabs.Tab
              value="activity"
              fz="0.78rem"
              fw={activeTab === 'activity' ? 600 : 400}
              c={activeTab === 'activity' ? 'var(--phantom-text-primary)' : 'var(--phantom-text-muted)'}
              style={{ flex: 1, justifyContent: 'center', borderBottom: activeTab === 'activity' ? '2px solid var(--phantom-accent-cyan)' : '2px solid transparent' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                Activity
                {isCreatingPr ? (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--phantom-accent-cyan, #06b6d4)', animation: 'pulse-activity 1.2s ease-in-out infinite' }} />
                ) : activePr && activePr.state === 'OPEN' ? (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--phantom-status-success, #22c55e)' }} />
                ) : null}
              </span>
            </Tabs.Tab>
          </Tabs.List>
          <Tooltip label="Collapse sidebar">
            <ActionIcon
              variant="subtle"
              size="xs"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse sidebar"
              mr={4}
            >
              <ChevronsRight
                size={14}
                style={{ color: 'var(--phantom-text-muted)' }}
              />
            </ActionIcon>
          </Tooltip>
        </div>

        {/* Content */}
        <Tabs.Panel value="files" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', contain: 'layout style paint' }}>
          <FilesView />
        </Tabs.Panel>
        <Tabs.Panel value="changes" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', contain: 'layout style paint' }}>
          <ChangesView />
        </Tabs.Panel>
        <Tabs.Panel value="activity" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', contain: 'layout style paint' }}>
          <GitActivityPanel />
        </Tabs.Panel>
      </Tabs>

      {/* Resize handle on left edge */}
      <ResizeHandle
        position="left"
        onResize={(delta) =>
          setWidth((prev) => Math.max(180, Math.min(500, prev + delta)))
        }
      />
      <style>{`@keyframes pulse-activity { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </div>
  );
}
