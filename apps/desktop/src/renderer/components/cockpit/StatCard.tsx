/**
 * CockpitStatCard Component
 * Large clickable stat card for the cockpit dashboard
 *
 * @author Subash Karki
 */
import { Group, Paper, Text, ThemeIcon } from '@mantine/core';
import type { KeyboardEvent, ReactNode } from 'react';

export interface CockpitStatCardProps {
  icon: ReactNode;
  value: string | number;
  label: string;
  sublabel?: string;
  color: string;
  onClick: () => void;
}

export const CockpitStatCard = ({
  icon,
  value,
  label,
  sublabel,
  color,
  onClick,
}: CockpitStatCardProps) => {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  const displayValue = typeof value === 'number' ? value.toLocaleString() : value;

  return (
    <Paper
      p="sm"
      bg="var(--phantom-surface-card)"
      role="button"
      tabIndex={0}
      aria-label={`${displayValue} ${label}${sublabel ? `, ${sublabel}` : ''}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      style={{
        border: '0.0625rem solid var(--phantom-border-subtle)',
        cursor: 'pointer',
        transition: 'transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease',
        minHeight: '3.5rem',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-0.25rem)';
        e.currentTarget.style.boxShadow = `0 0.5rem 1.5rem rgba(0,0,0,0.2)`;
        e.currentTarget.style.borderColor = `var(--mantine-color-${color}-6)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
        e.currentTarget.style.borderColor = 'var(--phantom-border-subtle)';
      }}
      data-testid="cockpit-stat-card"
    >
      <Group gap="sm" align="center" wrap="nowrap">
        <ThemeIcon size={32} variant="light" color={color} radius="xl">
          {icon}
        </ThemeIcon>
        <div>
          <Text
            ff="Orbitron, sans-serif"
            fz="1.15rem"
            fw={900}
            c="var(--phantom-text-primary)"
            lh={1}
          >
            {displayValue}
          </Text>
          <Text fz="0.7rem" fw={500} c="var(--phantom-text-secondary)" tt="uppercase">
            {label}
          </Text>
          {sublabel && (
            <Text fz="0.65rem" c="var(--phantom-text-muted)">
              {sublabel}
            </Text>
          )}
        </div>
      </Group>
    </Paper>
  );
};
