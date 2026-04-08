/**
 * EmptyState — welcoming empty state when no projects exist
 * Shows a big "Open Repository" button + drag hint
 *
 * @author Subash Karki
 */
import { Button, Text } from '@mantine/core';
import { FolderOpen } from 'lucide-react';

interface EmptyStateProps {
  onOpenRepository: () => void;
}

export function EmptyState({ onOpenRepository }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '24px 16px',
        gap: 12,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          backgroundColor: 'var(--phantom-surface-hover)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 4,
        }}
      >
        <FolderOpen size={24} style={{ color: 'var(--phantom-accent-purple)' }} />
      </div>
      <Button
        variant="light"
        size="sm"
        leftSection={<FolderOpen size={16} />}
        onClick={onOpenRepository}
        styles={{
          root: {
            backgroundColor: 'var(--phantom-surface-hover)',
            color: 'var(--phantom-text-primary)',
            border: '1px solid var(--phantom-border-subtle)',
            '&:hover': {
              backgroundColor: 'var(--phantom-surface-card)',
            },
          },
        }}
      >
        Open Repository
      </Button>
      <Text fz="0.7rem" c="var(--phantom-text-muted)" ta="center">
        or drag a folder here
      </Text>
    </div>
  );
}
