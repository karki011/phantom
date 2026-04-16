/**
 * RightSidebar — file explorer and changes tabs
 *
 * @author Subash Karki
 */
import type React from 'react';
import { useEffect, useRef } from 'react';
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
  clearFileTreeAtom,
  expandedFoldersAtom,
  fetchDirectoryAtom,
  rightSidebarTabAtom,
  selectedFileAtom,
  gitChangesCountAtom,
  gitStatusAtom,
  rootFileCountAtom,
} from '../../atoms/fileExplorer';
import {
  activePrStatusAtom,
  activeIsCreatingPrAtom,
  prStatusFamily,
  ciRunsFamily,
  commitsFamily,
} from '../../atoms/activity';
import { getGitStatus, gitFetch } from '../../lib/api';
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
  const worktreeIdRef = useRef(worktree?.id);

  // --- Changes tab: git status polling ---
  const setGitStatus = useSetAtom(gitStatusAtom);

  useEffect(() => {
    const wtId = worktree?.id ?? null;
    worktreeIdRef.current = wtId;

    // Immediate reset — badge clears before the fetch resolves
    setGitStatus(null);

    if (!wtId) return;

    const fetchStatus = () => {
      getGitStatus(wtId).then((result) => {
        if (worktreeIdRef.current === wtId) setGitStatus(result);
      }).catch(() => {
        if (worktreeIdRef.current === wtId) setGitStatus(null);
      });
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 10_000);

    const onManualRefresh = () => fetchStatus();
    window.addEventListener('phantom:git-refresh', onManualRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('phantom:git-refresh', onManualRefresh);
    };
  }, [worktree?.id, setGitStatus]);

  // --- Files tab: clear stale tree + prefetch root ---
  const clearFileTree = useSetAtom(clearFileTreeAtom);
  const fetchDirectory = useSetAtom(fetchDirectoryAtom);

  useEffect(() => {
    clearFileTree();
    if (worktree?.id) {
      fetchDirectory({ worktreeId: worktree.id, path: '/' });
    }
  }, [worktree?.id, clearFileTree, fetchDirectory]);

  // --- Activity tab: invalidate cached atom-family entries ---
  // Removing the entry causes the atom to return its default (null / [])
  // next time GitActivityPanel mounts, so no stale cross-worktree data.
  const prevWorktreeIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prevId = prevWorktreeIdRef.current;
    const nextId = worktree?.id ?? null;
    prevWorktreeIdRef.current = nextId;

    // Invalidate BOTH previous and next entries:
    // - previous: free memory from the worktree we just left
    // - next: clear any stale cache from an earlier visit
    if (prevId) {
      prStatusFamily.remove(prevId);
      ciRunsFamily.remove(prevId);
      commitsFamily.remove(prevId);
    }
    if (nextId) {
      prStatusFamily.remove(nextId);
      ciRunsFamily.remove(nextId);
      commitsFamily.remove(nextId);
    }
  }, [worktree?.id]);

  // --- Background git fetch every 60s so ahead/behind counts stay fresh ---
  useEffect(() => {
    if (!worktree) return;
    const wtId = worktree.id;
    gitFetch(wtId).catch(() => {});
    const interval = setInterval(() => gitFetch(wtId).catch(() => {}), 60_000);
    return () => clearInterval(interval);
  }, [worktree?.id]);

  // --- Reveal file in sidebar (triggered from tab context menu) ---
  const setSelectedFile = useSetAtom(selectedFileAtom);
  const setExpandedFolders = useSetAtom(expandedFoldersAtom);

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
        <Tabs.Panel value="files" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <FilesView />
        </Tabs.Panel>
        <Tabs.Panel value="changes" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ChangesView />
        </Tabs.Panel>
        <Tabs.Panel value="activity" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
