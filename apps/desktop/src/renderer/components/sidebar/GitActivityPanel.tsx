/**
 * GitActivityPanel — PR status, CI/CD runs, recent commits
 * Third tab in the right sidebar. All items clickable to open in browser.
 *
 * @author Subash Karki
 */
import { ScrollArea, Skeleton, Text } from '@mantine/core';
import { useAtomValue, useSetAtom } from 'jotai';
import React, { memo, useCallback, useEffect, useState } from 'react';
import {
  CheckCircle,
  XCircle,
  Loader2,
  Circle,
  GitPullRequest,
  GitCommit,
  Play,
  ExternalLink,
} from 'lucide-react';

import { activeWorktreeAtom } from '../../atoms/worktrees';
import {
  prCreatingSetAtom,
  prStatusFamily,
  ciRunsFamily,
  commitsFamily,
  addPrCreatingAtom,
} from '../../atoms/activity';
import {
  gitCreatePr,
  gitPrStatus,
  gitCiRuns,
  gitRecentCommits,
} from '../../lib/api';
import { showSystemNotification } from '../notifications/SystemToast';

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------

const sectionHeaderStyle: React.CSSProperties = {
  fontSize: '0.65rem',
  fontWeight: 700,
  textTransform: 'uppercase',
  color: 'var(--phantom-text-muted)',
  letterSpacing: '0.05em',
};

const clickableRowBase: React.CSSProperties = {
  cursor: 'pointer',
  borderRadius: 3,
  padding: '4px 8px',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  transition: 'background-color 100ms ease',
};

const prCardStyle: React.CSSProperties = {
  background: 'var(--phantom-surface-bg, #0a0a1a)',
  border: '1px solid var(--phantom-border-subtle)',
  borderRadius: 6,
  padding: '8px 10px',
};

// ---------------------------------------------------------------------------
// State dot color map
// ---------------------------------------------------------------------------

const PR_STATE_COLORS: Record<string, string> = {
  OPEN: 'var(--phantom-status-success, #22c55e)',
  MERGED: '#a855f7',
  CLOSED: 'var(--phantom-text-muted)',
  DRAFT: 'var(--phantom-text-muted)',
};

// ---------------------------------------------------------------------------
// Hover helpers
// ---------------------------------------------------------------------------

const onRowEnter = (e: React.MouseEvent<HTMLDivElement>) => {
  (e.currentTarget as HTMLElement).style.backgroundColor =
    'var(--phantom-surface-elevated, #2a2a2a)';
};
const onRowLeave = (e: React.MouseEvent<HTMLDivElement>) => {
  (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
};

// ---------------------------------------------------------------------------
// PrSection
// ---------------------------------------------------------------------------

const PrSection = memo(function PrSection({ worktreeId }: { worktreeId: string }) {
  const pr = useAtomValue(prStatusFamily(worktreeId));
  const creatingSet = useAtomValue(prCreatingSetAtom);
  const addCreating = useSetAtom(addPrCreatingAtom);

  const isCreating = creatingSet.has(worktreeId);

  const handleCreatePr = useCallback(() => {
    if (isCreating) return;
    addCreating(worktreeId);
    showSystemNotification('Pull Request', 'Creating PR...', 'info');
    gitCreatePr(worktreeId).catch(() => {});
  }, [worktreeId, isCreating, addCreating]);

  return (
    <div style={{ padding: '6px 8px' }}>
      <div style={{ ...sectionHeaderStyle, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
        <GitPullRequest size={11} />
        Pull Request
      </div>

      {isCreating && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 0' }}>
          <Loader2
            size={14}
            style={{
              color: 'var(--phantom-accent-cyan, #06b6d4)',
              animation: 'spin 1s linear infinite',
            }}
          />
          <Text fz="0.73rem" c="var(--phantom-text-secondary)">
            Claude is creating PR...
          </Text>
        </div>
      )}

      {!isCreating && pr && (
        <div style={prCardStyle}>
          {/* State badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: PR_STATE_COLORS[pr.state] ?? 'var(--phantom-text-muted)',
                flexShrink: 0,
              }}
            />
            <Text fz="0.65rem" fw={600} c="var(--phantom-text-muted)" tt="uppercase">
              {pr.state}
            </Text>
          </div>

          {/* Title + number */}
          <div
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}
            onClick={() => window.open(pr.url, '_blank')}
          >
            <Text fz="0.75rem" fw={600} c="var(--phantom-text-primary)" truncate style={{ flex: 1 }}>
              {pr.title}
            </Text>
            <Text fz="0.65rem" c="var(--phantom-text-muted)" style={{ flexShrink: 0 }}>
              #{pr.number}
            </Text>
            <ExternalLink size={10} style={{ color: 'var(--phantom-text-muted)', flexShrink: 0 }} />
          </div>

          {/* Branch info */}
          <Text fz="0.6rem" c="var(--phantom-text-muted)" truncate>
            {pr.headRefName} → {pr.baseRefName}
          </Text>
        </div>
      )}

      {!isCreating && !pr && (
        <Text fz="0.73rem" c="var(--phantom-text-muted)" py={4}>
          No pull request for this branch
        </Text>
      )}

      {/* Create PR button */}
      <div
        onClick={!isCreating ? handleCreatePr : undefined}
        style={{
          marginTop: 8,
          padding: '5px 0',
          textAlign: 'center',
          borderRadius: 4,
          cursor: isCreating ? 'default' : 'pointer',
          backgroundColor: isCreating
            ? 'var(--phantom-surface-elevated, #2a2a2a)'
            : 'var(--phantom-accent-cyan, #06b6d4)',
          color: isCreating ? 'var(--phantom-text-muted)' : '#000',
          fontSize: '0.73rem',
          fontWeight: 600,
          transition: 'all 150ms ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <GitPullRequest size={12} />
        {isCreating ? 'Creating...' : 'Create PR with Claude'}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// CiSection
// ---------------------------------------------------------------------------

function getCiStatusIcon(status: string, conclusion: string | null) {
  if (conclusion === 'success')
    return <CheckCircle size={13} style={{ color: 'var(--phantom-status-success, #22c55e)', flexShrink: 0 }} />;
  if (conclusion === 'failure')
    return <XCircle size={13} style={{ color: 'var(--phantom-status-error, #ef4444)', flexShrink: 0 }} />;
  if (status === 'in_progress')
    return (
      <Loader2
        size={13}
        style={{
          color: 'var(--phantom-accent-gold, #f59e0b)',
          animation: 'spin 1s linear infinite',
          flexShrink: 0,
        }}
      />
    );
  return <Circle size={13} style={{ color: 'var(--phantom-text-muted)', flexShrink: 0 }} />;
}

function getCiLabel(status: string, conclusion: string | null): string {
  if (conclusion) return conclusion;
  return status;
}

const CiSection = memo(function CiSection({ worktreeId }: { worktreeId: string }) {
  const runs = useAtomValue(ciRunsFamily(worktreeId));

  // gh not available — hide section
  if (runs === null) return null;

  return (
    <div style={{ padding: '6px 8px' }}>
      <div style={{ ...sectionHeaderStyle, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
        <Play size={11} />
        CI / CD Runs
      </div>

      {runs.length === 0 ? (
        <Text fz="0.73rem" c="var(--phantom-text-muted)" py={4}>
          No CI runs
        </Text>
      ) : (
        <ScrollArea scrollbarSize={6} style={{ maxHeight: 200 }}>
          {runs.map((run) => (
            <div
              key={run.databaseId}
              style={{ ...clickableRowBase, height: 30 }}
              onClick={() => window.open(run.url, '_blank')}
              onMouseEnter={onRowEnter}
              onMouseLeave={onRowLeave}
            >
              {getCiStatusIcon(run.status, run.conclusion)}
              <Text fz="0.7rem" c="var(--phantom-text-primary)" truncate style={{ flex: 1 }}>
                {run.name}
              </Text>
              <Text fz="0.6rem" c="var(--phantom-text-muted)" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                {getCiLabel(run.status, run.conclusion)}
              </Text>
            </div>
          ))}
        </ScrollArea>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// CommitsSection
// ---------------------------------------------------------------------------

const CommitsSection = memo(function CommitsSection({ worktreeId }: { worktreeId: string }) {
  const commits = useAtomValue(commitsFamily(worktreeId));

  if (commits.length === 0) return null;

  return (
    <div style={{ padding: '6px 8px' }}>
      <div style={{ ...sectionHeaderStyle, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
        <GitCommit size={11} />
        Recent Commits
      </div>

      <ScrollArea scrollbarSize={6} style={{ maxHeight: 180 }}>
        {commits.map((commit) => (
          <div
            key={commit.sha}
            style={{
              ...clickableRowBase,
              cursor: commit.url ? 'pointer' : 'default',
            }}
            onClick={() => { if (commit.url) window.open(commit.url, '_blank'); }}
            onMouseEnter={commit.url ? onRowEnter : undefined}
            onMouseLeave={commit.url ? onRowLeave : undefined}
          >
            <Text
              fz="0.65rem"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                color: 'var(--phantom-accent-cyan, #06b6d4)',
                flexShrink: 0,
              }}
            >
              {commit.shortSha}
            </Text>
            <Text fz="0.7rem" c="var(--phantom-text-primary)" truncate style={{ flex: 1 }}>
              {commit.message}
            </Text>
            <Text fz="0.6rem" c="var(--phantom-text-muted)" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
              {commit.timeAgo}
            </Text>
          </div>
        ))}
      </ScrollArea>
    </div>
  );
});

// ---------------------------------------------------------------------------
// GitActivityPanel
// ---------------------------------------------------------------------------

function ActivitySkeleton() {
  return (
    <div style={{ padding: '8px 12px' }}>
      {/* PR section skeleton */}
      <Skeleton height={10} width="35%" mb={10} />
      <Skeleton height={60} radius={6} mb={16} />
      <Skeleton height={30} radius={4} mb={16} />

      {/* CI section skeleton */}
      <Skeleton height={10} width="30%" mb={10} />
      <Skeleton height={16} mb={6} />
      <Skeleton height={16} mb={6} />
      <Skeleton height={16} mb={16} />

      {/* Commits section skeleton */}
      <Skeleton height={10} width="40%" mb={10} />
      <Skeleton height={14} mb={6} />
      <Skeleton height={14} mb={6} />
      <Skeleton height={14} mb={6} />
    </div>
  );
}

export function GitActivityPanel() {
  const worktree = useAtomValue(activeWorktreeAtom);
  const wtId = worktree?.id ?? '';
  const setPrStatus = useSetAtom(prStatusFamily(wtId));
  const setCiRuns = useSetAtom(ciRunsFamily(wtId));
  const setCommits = useSetAtom(commitsFamily(wtId));
  const [initialLoading, setInitialLoading] = useState(true);

  // Clear stale cached data and mark loading on worktree switch
  useEffect(() => {
    setPrStatus(null);
    setCiRuns(null);
    setCommits([]);
    setInitialLoading(true);
  }, [wtId, setPrStatus, setCiRuns, setCommits]);

  useEffect(() => {
    if (!worktree) return;
    const id = worktree.id;
    let cancelled = false;

    // Equality guard — skip set() if data hasn't changed
    let lastPrJson = '';
    let lastCiJson = '';
    let lastCommitsJson = '';

    const fetchPr = () =>
      gitPrStatus(id).then((pr) => {
        if (cancelled) return;
        const json = JSON.stringify(pr);
        if (json !== lastPrJson) { lastPrJson = json; setPrStatus(pr); }
      }).catch(() => {});

    const fetchCi = () =>
      gitCiRuns(id).then((runs) => {
        if (cancelled) return;
        if (runs !== null) {
          const json = JSON.stringify(runs);
          if (json !== lastCiJson) { lastCiJson = json; setCiRuns(runs); }
        }
      }).catch(() => {});

    const fetchCommits = () =>
      gitRecentCommits(id).then((commits) => {
        if (cancelled) return;
        const json = JSON.stringify(commits);
        if (json !== lastCommitsJson) { lastCommitsJson = json; setCommits(commits); }
      }).catch(() => {});

    // Fetch all, then clear loading
    Promise.all([fetchPr(), fetchCi(), fetchCommits()]).finally(() => {
      if (!cancelled) setInitialLoading(false);
    });

    const prInterval = setInterval(fetchPr, 60_000);
    const ciInterval = setInterval(fetchCi, 30_000);

    return () => {
      cancelled = true;
      clearInterval(prInterval);
      clearInterval(ciInterval);
    };
  }, [wtId, setPrStatus, setCiRuns, setCommits]);

  if (!worktree) {
    return (
      <Text fz="0.75rem" c="var(--phantom-text-muted)" ta="center" py="xl" px="sm">
        Select a worktree to view activity
      </Text>
    );
  }

  if (initialLoading) {
    return <ActivitySkeleton />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ScrollArea style={{ flex: 1 }} scrollbarSize={6}>
        <PrSection worktreeId={worktree.id} />

        <div style={{ height: 1, backgroundColor: 'var(--phantom-border-subtle)', margin: '2px 8px' }} />

        <CiSection worktreeId={worktree.id} />

        <div style={{ height: 1, backgroundColor: 'var(--phantom-border-subtle)', margin: '2px 8px' }} />

        <CommitsSection worktreeId={worktree.id} />
      </ScrollArea>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
