/**
 * SkillUsageCard Component
 * Shows which /skills and /slash commands have been used across sessions.
 * Data sourced from sessions.tool_breakdown "Skill:/" keys.
 *
 * @author Subash Karki
 */
import { Badge, Group, ScrollArea, Skeleton, Stack, Text } from '@mantine/core';
import { Wand } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { CockpitPeriod } from '@phantom-os/shared';
import { GradientBar } from './GradientBar';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkillEntry {
  name: string;
  count: number;
  repos: string[];
}

interface SkillUsageData {
  total: number;
  skills: SkillEntry[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SkillUsageCardProps {
  period: CockpitPeriod;
}

export const SkillUsageCard = ({ period }: SkillUsageCardProps) => {
  const [data, setData] = useState<SkillUsageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/cockpit/skill-usage?period=${period}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<SkillUsageData>;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [period]);

  const skills = data?.skills ?? [];
  const total = data?.total ?? 0;
  const maxCount = skills.length > 0 ? skills[0].count : 1;

  return (
    <Stack gap="sm" style={{ flex: 1, overflow: 'hidden' }}>
      {/* Header */}
      <Group justify="space-between" align="center" style={{ flexShrink: 0 }}>
        <Group gap="xs" align="center">
          <Wand size={14} style={{ color: 'var(--phantom-accent-cyan)' }} />
          <Text
            ff="Orbitron, sans-serif"
            fz="sm"
            fw={600}
            c="var(--phantom-text-primary)"
          >
            Skill Usage
          </Text>
          {total > 0 && (
            <Badge
              size="xs"
              variant="filled"
              style={{
                background: 'var(--phantom-accent-cyan)',
                color: 'var(--phantom-surface-bg)',
                fontWeight: 700,
                fontSize: '0.6rem',
              }}
            >
              {total} calls
            </Badge>
          )}
        </Group>
      </Group>

      {/* Loading */}
      {loading && (
        <Stack gap="xs">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={28} radius="xs" />
          ))}
        </Stack>
      )}

      {/* Error */}
      {!loading && error && (
        <Text fz="0.75rem" c="var(--phantom-status-error)" ta="center" py="sm">
          Failed to load: {error}
        </Text>
      )}

      {/* Empty */}
      {!loading && !error && skills.length === 0 && (
        <Stack align="center" gap="xs" py="md">
          <Wand size={20} style={{ color: 'var(--phantom-text-muted)' }} />
          <Text fz="0.75rem" c="var(--phantom-text-muted)">
            No skill usage recorded yet
          </Text>
          <Text fz="0.65rem" c="var(--phantom-text-muted)">
            Skills will appear after the server rescans session data
          </Text>
        </Stack>
      )}

      {/* Skill list */}
      {!loading && !error && skills.length > 0 && (
        <ScrollArea style={{ flex: 1 }} scrollbarSize={4}>
          <Stack gap="sm">
            {skills.map((skill) => (
              <Stack key={skill.name} gap={4}>
                <Group justify="space-between" align="baseline" wrap="nowrap">
                  <Group gap={6} align="baseline" style={{ minWidth: 0 }}>
                    <Text
                      fz="0.8rem"
                      fw={600}
                      style={{ color: 'var(--phantom-accent-cyan)' }}
                      ff="JetBrains Mono, monospace"
                    >
                      {skill.name}
                    </Text>
                    {skill.repos.length > 0 && (
                      <Text fz="0.6rem" c="var(--phantom-text-muted)" truncate>
                        {skill.repos.slice(0, 2).join(', ')}
                      </Text>
                    )}
                  </Group>
                  <Text fz="0.75rem" c="var(--phantom-text-primary)" fw={700} style={{ flexShrink: 0 }}>
                    {skill.count}×
                  </Text>
                </Group>
                <GradientBar
                  value={maxCount > 0 ? skill.count / maxCount : 0}
                  height={6}
                  color="var(--phantom-accent-cyan)"
                />
              </Stack>
            ))}
          </Stack>
        </ScrollArea>
      )}
    </Stack>
  );
};
