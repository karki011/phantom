/**
 * PlansCard — shows Claude plan files relevant to the active worktree.
 * Groups plans by branch-specific vs project-level.
 * @author Subash Karki
 */
import { Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { usePaneStore } from '@phantom-os/panes';
import { FileText, GitBranch, FolderGit2, RefreshCw } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';

interface PlanFile {
  filename: string;
  title: string;
  modifiedAt: number;
  preview: string;
  fullPath: string;
}

interface GroupedPlans {
  branch: PlanFile[];
  project: PlanFile[];
}

const formatRelativeTime = (ts: number): string => {
  const ms = Date.now() - ts;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
};

function PlanRow({ plan, store }: { plan: PlanFile; store: ReturnType<typeof usePaneStore> }) {
  return (
    <Group
      gap="sm"
      py={4}
      px={6}
      style={{ cursor: 'pointer', borderRadius: 4, transition: 'background-color 100ms ease' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--phantom-surface-elevated)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
      onClick={() => { store.addPaneAsTab('editor', { filePath: plan.fullPath } as Record<string, unknown>, plan.title); }}
    >
      <FileText size={12} style={{ color: 'var(--phantom-text-muted)', flexShrink: 0 }} />
      <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
        <Text fz="0.78rem" fw={500} c="var(--phantom-text-primary)" lineClamp={1}>{plan.title}</Text>
        {plan.preview && <Text fz="0.65rem" c="var(--phantom-text-muted)" lineClamp={1}>{plan.preview}</Text>}
      </Stack>
      <Text fz="0.65rem" c="var(--phantom-text-muted)" style={{ flexShrink: 0 }}>
        {formatRelativeTime(plan.modifiedAt)}
      </Text>
    </Group>
  );
}

export const PlansCard = memo(function PlansCard({ worktreeId }: { worktreeId: string }) {
  const [grouped, setGrouped] = useState<GroupedPlans>({ branch: [], project: [] });
  const [loading, setLoading] = useState(false);
  const store = usePaneStore();
  const lastHash = useRef('');

  const refresh = useCallback((showLoading = false) => {
    if (showLoading) setLoading(true);
    fetch(`/api/plans?worktreeId=${worktreeId}`)
      .then(r => r.json())
      .then((data: GroupedPlans | null) => {
        const safeData = data ?? { branch: [], project: [] };
        const all = [...(safeData.branch ?? []), ...(safeData.project ?? [])];
        const hash = all.map((p) => `${p.filename}:${p.modifiedAt}`).join(',');
        if (hash !== lastHash.current) {
          lastHash.current = hash;
          setGrouped(safeData);
        }
      })
      .catch(() => {
        if (lastHash.current !== '') {
          lastHash.current = '';
          setGrouped({ branch: [], project: [] });
        }
      })
      .finally(() => { if (showLoading) setLoading(false); });
  }, [worktreeId]);

  useEffect(() => {
    refresh(true);
    const interval = setInterval(() => refresh(), 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const total = grouped.branch.length + grouped.project.length;
  if (total === 0) return null;

  return (
    <Paper
      p="md"
      bg="var(--phantom-surface-card)"
      radius="md"
      style={{ border: '1px solid var(--phantom-border-subtle)', maxHeight: 420, display: 'flex', flexDirection: 'column' }}
    >
      <Group gap="xs" mb="sm" style={{ flexShrink: 0 }}>
        <FileText size={14} style={{ color: 'var(--phantom-accent-glow)' }} />
        <Text fz="xs" fw={600} c="var(--phantom-text-secondary)">Plans</Text>
        <Text fz="xs" c="var(--phantom-text-muted)">{total}</Text>
        <Tooltip label="Refresh plans" position="top" withArrow fz="xs">
          <RefreshCw
            size={11}
            style={{ color: 'var(--phantom-text-muted)', cursor: 'pointer', marginLeft: 'auto', animation: loading ? 'spin 1s linear infinite' : 'none' }}
            onClick={() => refresh(true)}
          />
        </Tooltip>
      </Group>
      <Stack gap={4} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {/* Branch-specific plans */}
        {grouped.branch.length > 0 && (
          <>
            <Group gap={4} px={6}>
              <GitBranch size={10} style={{ color: 'var(--phantom-accent-cyan)' }} />
              <Text fz="0.6rem" fw={600} c="var(--phantom-accent-cyan)" tt="uppercase" style={{ letterSpacing: '0.04em' }}>
                Branch ({grouped.branch.length})
              </Text>
            </Group>
            {grouped.branch.map((plan) => (
              <PlanRow key={plan.filename} plan={plan} store={store} />
            ))}
          </>
        )}

        {/* Project-level plans */}
        {grouped.project.length > 0 && (
          <>
            <Group gap={4} px={6} mt={grouped.branch.length > 0 ? 4 : 0}>
              <FolderGit2 size={10} style={{ color: 'var(--phantom-text-muted)' }} />
              <Text fz="0.6rem" fw={600} c="var(--phantom-text-muted)" tt="uppercase" style={{ letterSpacing: '0.04em' }}>
                Project ({grouped.project.length})
              </Text>
            </Group>
            {grouped.project.map((plan) => (
              <PlanRow key={plan.filename} plan={plan} store={store} />
            ))}
          </>
        )}
      </Stack>
    </Paper>
  );
});
