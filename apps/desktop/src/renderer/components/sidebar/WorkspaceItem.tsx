/**
 * WorkspaceItem — single workspace entry in the left sidebar
 *
 * @author Subash Karki
 */
import { Badge, Group, Text, UnstyledButton } from '@mantine/core';
import type { WorkspaceData } from '../../lib/api';

interface WorkspaceItemProps {
  workspace: WorkspaceData;
  isActive: boolean;
  onSelect: (id: string) => void;
}

export function WorkspaceItem({
  workspace,
  isActive,
  onSelect,
}: WorkspaceItemProps) {
  return (
    <UnstyledButton
      onClick={() => onSelect(workspace.id)}
      py={4}
      px="sm"
      style={{
        display: 'block',
        width: '100%',
        borderRadius: 4,
        backgroundColor: isActive
          ? 'var(--phantom-surface-hover)'
          : 'transparent',
        transition: 'background-color 120ms ease',
      }}
      onMouseEnter={(e) => {
        if (!isActive)
          (e.currentTarget as HTMLElement).style.backgroundColor =
            'var(--phantom-surface-card)';
      }}
      onMouseLeave={(e) => {
        if (!isActive)
          (e.currentTarget as HTMLElement).style.backgroundColor =
            'transparent';
      }}
    >
      <Group gap={8} wrap="nowrap">
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            backgroundColor: workspace.color || 'var(--phantom-accent-cyan)',
            flexShrink: 0,
          }}
        />
        <Text
          fz="0.8rem"
          c={
            isActive
              ? 'var(--phantom-text-primary)'
              : 'var(--phantom-text-secondary)'
          }
          truncate
          style={{ flex: 1 }}
        >
          {workspace.name}
        </Text>
        <Badge
          size="xs"
          variant="light"
          color="gray"
          style={{ flexShrink: 0 }}
        >
          {workspace.branch}
        </Badge>
      </Group>
    </UnstyledButton>
  );
}
