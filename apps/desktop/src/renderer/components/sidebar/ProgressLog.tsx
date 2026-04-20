/**
 * ProgressLog — shared onboarding-style progress UI for batch operations.
 * Used by ScanProjectsModal, ManageProjectsModal, and GitInitModal.
 *
 * @author Subash Karki
 */
import { Button, Group, Progress, Stack, Text } from '@mantine/core';
import { Check, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

export interface ProgressEntry {
  name: string;
  status: 'pending' | 'success' | 'error';
}

interface ProgressLogProps {
  title: string;
  doneTitle: string;
  entries: ProgressEntry[];
  currentIndex: number;
  done: boolean;
  accentColor?: string;
  onDone: () => void;
}

export function ProgressLog({
  title,
  doneTitle,
  entries,
  currentIndex,
  done,
  accentColor = '#00d4ff',
  onDone,
}: ProgressLogProps) {
  const logRef = useRef<HTMLDivElement>(null);

  const total = entries.length;
  const processed = entries.filter((e) => e.status !== 'pending').length;
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  const succeeded = entries.filter((e) => e.status === 'success').length;
  const failed = entries.filter((e) => e.status === 'error').length;

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [currentIndex]);

  return (
    <div style={{
      padding: '16px 0',
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
    }}>
      <Group justify="space-between" mb={8}>
        <Text
          fz="0.8rem"
          fw={700}
          style={{ color: accentColor, textShadow: `0 0 8px ${accentColor}66` }}
        >
          {done ? doneTitle : title}
        </Text>
        <Text fz="0.8rem" fw={600} c="var(--phantom-text-secondary)">
          {processed}/{total}
        </Text>
      </Group>

      <Progress
        value={pct}
        size="sm"
        radius="xs"
        color={accentColor}
        styles={{
          root: { backgroundColor: `${accentColor}1a` },
          section: { boxShadow: `0 0 12px ${accentColor}66`, transition: 'width 300ms ease' },
        }}
      />

      <Text fz="0.7rem" c="var(--phantom-text-muted)" mt={6} mb={16}>
        {done
          ? `${succeeded} succeeded, ${failed} failed`
          : currentIndex < total
            ? `Processing ${entries[currentIndex].name}...`
            : 'Finishing up...'}
      </Text>

      <div
        ref={logRef}
        style={{
          maxHeight: 280,
          overflow: 'auto',
          backgroundColor: 'rgba(0,0,0,0.4)',
          border: `1px solid ${accentColor}26`,
          borderRadius: 8,
          padding: '10px 12px',
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--phantom-border-subtle) transparent',
        }}
      >
        <Stack gap={2}>
          {entries.map((entry, i) => (
            <Group key={`${entry.name}-${i}`} gap={8} wrap="nowrap" style={{ opacity: entry.status === 'pending' ? 0.3 : 1, transition: 'opacity 200ms' }}>
              {entry.status === 'success' && (
                <Check size={12} style={{ color: '#22c55e', flexShrink: 0 }} />
              )}
              {entry.status === 'error' && (
                <X size={12} style={{ color: '#ef4444', flexShrink: 0 }} />
              )}
              {entry.status === 'pending' && (
                <div style={{ width: 12, height: 12, flexShrink: 0 }} />
              )}
              <Text
                fz="0.72rem"
                c={
                  entry.status === 'success'
                    ? '#22c55e'
                    : entry.status === 'error'
                      ? '#ef4444'
                      : 'var(--phantom-text-muted)'
                }
                truncate
                style={{
                  textShadow: entry.status === 'success'
                    ? '0 0 6px rgba(34,197,94,0.3)'
                    : entry.status === 'error'
                      ? '0 0 6px rgba(239,68,68,0.3)'
                      : 'none',
                }}
              >
                <span style={{ color: 'var(--phantom-text-muted)', marginRight: 6 }}>
                  [{String(i + 1).padStart(String(total).length, '0')}]
                </span>
                {entry.name}
              </Text>
            </Group>
          ))}
        </Stack>
      </div>

      {done && (
        <Group justify="flex-end" mt="md">
          <Button size="md" onClick={onDone}>Done</Button>
        </Group>
      )}
    </div>
  );
}
