/**
 * ViewHeader Component
 * Shared header for detail views with icon, title, and optional subtitle
 *
 * @author Subash Karki
 */
import { Box, Group, Text } from '@mantine/core';
import type { ReactNode } from 'react';

export interface ViewHeaderProps {
  title: string;
  icon: ReactNode;
  subtitle?: string;
}

export const ViewHeader = ({ title, icon, subtitle }: ViewHeaderProps) => (
  <Group gap="sm" wrap="nowrap" mb="md" role="heading" aria-level={1}>
    <Box
      style={{
        color: 'var(--phantom-accent-glow)',
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
      }}
    >
      {icon}
    </Box>
    <div>
      <Text
        ff="Orbitron, sans-serif"
        fz="1.25rem"
        fw={700}
        c="var(--phantom-text-primary)"
        tt="uppercase"
        style={{ letterSpacing: '0.05em' }}
      >
        {title}
      </Text>
      {subtitle && (
        <Text fz="0.8125rem" c="var(--phantom-text-secondary)">
          {subtitle}
        </Text>
      )}
    </div>
  </Group>
);
