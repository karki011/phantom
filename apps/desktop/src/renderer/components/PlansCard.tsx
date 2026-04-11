/**
 * PlansCard — shows Claude plan files relevant to the active worktree.
 * Auto-detects plans by scanning ~/.claude/plans/ content for worktree name/path.
 * @author Subash Karki
 */
import { Group, Paper, Stack, Text } from '@mantine/core';
import { usePaneStore } from '@phantom-os/panes';
import { FileText } from 'lucide-react';
import { memo, useEffect, useState } from 'react';

interface PlanFile {
  filename: string;
  title: string;
  modifiedAt: number;
  preview: string;
  fullPath: string;
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

export const PlansCard = memo(function PlansCard({ worktreeId }: { worktreeId: string }) {
  const [plans, setPlans] = useState<PlanFile[]>([]);
  const store = usePaneStore();

  useEffect(() => {
    fetch(`/api/plans?worktreeId=${worktreeId}`)
      .then(r => r.json())
      .then(setPlans)
      .catch(() => setPlans([]));
  }, [worktreeId]);

  if (plans.length === 0) return null;

  return (
    <Paper
      p="md"
      bg="var(--phantom-surface-card)"
      radius="md"
      style={{ border: '1px solid var(--phantom-border-subtle)' }}
    >
      <Group gap="xs" mb="sm">
        <FileText size={14} style={{ color: 'var(--phantom-accent-glow)' }} />
        <Text fz="xs" fw={600} c="var(--phantom-text-secondary)">Plans</Text>
        <Text fz="xs" c="var(--phantom-text-muted)">{plans.length}</Text>
      </Group>
      <Stack gap={4} style={{ maxHeight: 200, overflowY: 'auto' }}>
        {plans.map((plan) => (
          <Group
            key={plan.filename}
            gap="sm"
            py={4}
            px={6}
            style={{
              cursor: 'pointer',
              borderRadius: 4,
              transition: 'background-color 100ms ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--phantom-surface-elevated)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
            }}
            onClick={() => {
              store.addPaneAsTab(
                'editor',
                { filePath: plan.fullPath } as Record<string, unknown>,
                plan.title
              );
            }}
          >
            <FileText size={12} style={{ color: 'var(--phantom-text-muted)', flexShrink: 0 }} />
            <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
              <Text fz="0.78rem" fw={500} c="var(--phantom-text-primary)" lineClamp={1}>
                {plan.title}
              </Text>
              {plan.preview && (
                <Text fz="0.65rem" c="var(--phantom-text-muted)" lineClamp={1}>
                  {plan.preview}
                </Text>
              )}
            </Stack>
            <Text fz="0.65rem" c="var(--phantom-text-muted)" style={{ flexShrink: 0 }}>
              {formatRelativeTime(plan.modifiedAt)}
            </Text>
          </Group>
        ))}
      </Stack>
    </Paper>
  );
});
