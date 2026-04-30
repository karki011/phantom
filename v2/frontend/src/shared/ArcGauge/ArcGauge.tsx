// Phantom — ArcGauge SVG arc meter component
// Author: Subash Karki

import { createMemo, Show } from 'solid-js';
import { vars } from '@/styles/theme.css';
import * as styles from './ArcGauge.css';

import type { JSX } from 'solid-js';

interface ArcGaugeProps {
  value: number;
  label: string;
  sublabel?: string;
  size?: number;
  strokeWidth?: number;
  color?: string;
}

/**
 * Compute the SVG arc `d` attribute for an arc centered at (cx, cy).
 * Sweeps from startAngle to endAngle (degrees, clockwise from 3-o'clock).
 */
const describeArc = (
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string => {
  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const start = {
    x: cx + radius * Math.cos(toRad(endAngle)),
    y: cy + radius * Math.sin(toRad(endAngle)),
  };
  const end = {
    x: cx + radius * Math.cos(toRad(startAngle)),
    y: cy + radius * Math.sin(toRad(startAngle)),
  };
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`;
};

const getSemanticColor = (value: number): string => {
  if (value < 60) return vars.color.success;
  if (value < 80) return vars.color.warning;
  return vars.color.danger;
};

export function ArcGauge(props: ArcGaugeProps): JSX.Element {
  const size = () => props.size ?? 120;
  const strokeWidth = () => props.strokeWidth ?? 8;
  const cx = () => size() / 2;
  const cy = () => size() / 2;
  const radius = () => (size() - strokeWidth()) / 2;

  // 270-degree arc from 135deg (bottom-left) to 405deg (bottom-right)
  const startAngle = 135;
  const endAngle = 405;
  const sweepDeg = endAngle - startAngle; // 270

  const circumference = createMemo(
    () => 2 * Math.PI * radius() * (sweepDeg / 360),
  );

  const clampedValue = createMemo(() =>
    Math.max(0, Math.min(100, props.value)),
  );

  const dashOffset = createMemo(
    () => circumference() * (1 - clampedValue() / 100),
  );

  const arcColor = createMemo(
    () => props.color ?? getSemanticColor(clampedValue()),
  );

  const bgArcPath = createMemo(() =>
    describeArc(cx(), cy(), radius(), startAngle, endAngle),
  );

  return (
    <div class={styles.gaugeWrapper}>
      <svg
        class={styles.gaugeSvg}
        width={size()}
        height={size()}
        viewBox={`0 0 ${size()} ${size()}`}
        role="meter"
        aria-valuenow={clampedValue()}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${props.label}: ${Math.round(clampedValue())}%`}
      >
        {/* Background arc */}
        <path
          class={styles.backgroundArc}
          d={bgArcPath()}
          stroke-width={strokeWidth()}
          stroke-linecap="round"
        />

        {/* Foreground arc */}
        <path
          class={styles.foregroundArc}
          d={bgArcPath()}
          stroke={arcColor()}
          stroke-width={strokeWidth()}
          stroke-linecap="round"
          stroke-dasharray={`${circumference()}`}
          stroke-dashoffset={`${dashOffset()}`}
        />

        {/* Center value */}
        <text class={styles.valueText} x={cx()} y={cy() - 4}>
          {Math.round(clampedValue())}
        </text>
        <text class={styles.unitText} x={cx()} y={cy() + 14}>
          %
        </text>
      </svg>

      <span class={styles.labelText}>{props.label}</span>
      <Show when={props.sublabel}>
        <span class={styles.sublabelText}>{props.sublabel}</span>
      </Show>
    </div>
  );
}
