/**
 * PeriodSwitcher Component
 * Segmented control for selecting a cockpit time period
 *
 * @author Subash Karki
 */
import { SegmentedControl } from '@mantine/core';
import type { CockpitPeriod } from '@phantom-os/shared';

export interface PeriodSwitcherProps {
  value: CockpitPeriod;
  onChange: (p: CockpitPeriod) => void;
}

const PERIOD_OPTIONS: { label: string; value: CockpitPeriod }[] = [
  { label: 'Today', value: 'today' },
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: 'All', value: 'all' },
];

export const PeriodSwitcher = ({ value, onChange }: PeriodSwitcherProps) => (
  <SegmentedControl
    value={value}
    onChange={(v) => onChange(v as CockpitPeriod)}
    data={PERIOD_OPTIONS}
    styles={{
      root: {
        background: 'var(--phantom-surface-card)',
        border: '0.0625rem solid var(--phantom-border-subtle)',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
      },
      indicator: {
        background: 'var(--phantom-surface-elevated)',
      },
      label: {
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        color: 'var(--phantom-text-secondary)',
      },
    }}
  />
);
