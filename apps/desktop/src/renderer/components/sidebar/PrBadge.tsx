/**
 * PrBadge — small PR status icon for worktree items
 * Fetches PR status on mount + polls every 60s, shows state icon.
 *
 * @author Subash Karki
 */
import { Tooltip } from '@mantine/core';
import {
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
} from 'lucide-react';
import { useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { gitPrStatus } from '../../lib/api';
import { prStatusFamily } from '../../atoms/activity';

interface PrBadgeProps {
  worktreeId: string;
}

export function PrBadge({ worktreeId }: PrBadgeProps) {
  const setPrStatus = useSetAtom(prStatusFamily(worktreeId));
  const prStatus = useAtomValue(prStatusFamily(worktreeId));

  useEffect(() => {
    const fetchPr = () => gitPrStatus(worktreeId).then(setPrStatus).catch(() => {});
    fetchPr();
    const interval = setInterval(fetchPr, 60_000);
    return () => clearInterval(interval);
  }, [worktreeId, setPrStatus]);

  if (!prStatus) return null;

  switch (prStatus.state) {
    case 'MERGED':
      return (
        <Tooltip label="Merged" position="right" withArrow openDelay={300}>
          <span style={{ display: 'inline-flex', flexShrink: 0 }}>
            <GitMerge size={12} style={{ color: '#a855f7' }} />
          </span>
        </Tooltip>
      );
    case 'OPEN':
      return (
        <Tooltip label={`PR #${prStatus.number}`} position="right" withArrow openDelay={300}>
          <span style={{ display: 'inline-flex', flexShrink: 0 }}>
            <GitPullRequest size={12} style={{ color: 'var(--phantom-status-success, #22c55e)' }} />
          </span>
        </Tooltip>
      );
    case 'DRAFT':
      return (
        <Tooltip label="Draft PR" position="right" withArrow openDelay={300}>
          <span style={{ display: 'inline-flex', flexShrink: 0 }}>
            <GitPullRequestDraft size={12} style={{ color: 'var(--phantom-text-muted)' }} />
          </span>
        </Tooltip>
      );
    case 'CLOSED':
      return (
        <Tooltip label="PR Closed" position="right" withArrow openDelay={300}>
          <span style={{ display: 'inline-flex', flexShrink: 0 }}>
            <GitPullRequestClosed size={12} style={{ color: 'var(--phantom-status-error, #ef4444)' }} />
          </span>
        </Tooltip>
      );
    default:
      return null;
  }
}
