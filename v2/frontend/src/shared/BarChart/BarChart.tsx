// PhantomOS v2 — Pure SVG bar chart component
// Author: Subash Karki

import { createSignal, createMemo, For, Show } from 'solid-js';
import { vars } from '@/styles/theme.css';
import * as styles from './BarChart.css';

import type { JSX } from 'solid-js';

export interface BarChartDatum {
  label: string;
  value: number;
  color?: string;
}

interface BarChartProps {
  data: BarChartDatum[];
  height?: number;
  barColor?: string;
  formatValue?: (v: number) => string;
  emptyMessage?: string;
}

// Layout constants (viewBox-relative)
const PADDING_TOP = 24;
const PADDING_BOTTOM = 20;
const PADDING_X = 8;
const VIEWBOX_WIDTH = 400;
const MIN_BAR_HEIGHT = 2;
const BAR_GAP_RATIO = 0.25; // gap as fraction of bar width

export function BarChart(props: BarChartProps): JSX.Element {
  const height = () => props.height ?? 120;
  const defaultColor = () => props.barColor ?? vars.color.accent;
  const format = () => props.formatValue ?? ((v: number) => String(v));

  const [hoveredIndex, setHoveredIndex] = createSignal<number | null>(null);

  const viewBoxHeight = () => height();
  const chartHeight = () => viewBoxHeight() - PADDING_TOP - PADDING_BOTTOM;
  const chartWidth = VIEWBOX_WIDTH - PADDING_X * 2;

  const maxValue = createMemo(() => {
    const vals = props.data.map((d) => d.value);
    return Math.max(...vals, 0.01); // avoid division by zero
  });

  const barLayout = createMemo(() => {
    const count = props.data.length;
    if (count === 0) return [];

    const totalBarWidth = chartWidth / count;
    const gap = totalBarWidth * BAR_GAP_RATIO;
    const barWidth = totalBarWidth - gap;

    return props.data.map((d, i) => {
      const rawHeight = (d.value / maxValue()) * chartHeight();
      const barHeight =
        d.value > 0 ? Math.max(MIN_BAR_HEIGHT, rawHeight) : 0;
      const x = PADDING_X + i * totalBarWidth + gap / 2;
      const y = PADDING_TOP + chartHeight() - barHeight;

      return {
        x,
        y,
        width: barWidth,
        height: barHeight,
        color: d.color ?? defaultColor(),
        label: d.label,
        value: d.value,
        centerX: x + barWidth / 2,
      };
    });
  });

  return (
    <Show
      when={props.data.length > 0}
      fallback={
        <div class={styles.emptyMessage}>
          {props.emptyMessage ?? 'No data available'}
        </div>
      }
    >
      <div class={styles.chartContainer}>
        <svg
          class={styles.chartSvg}
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${viewBoxHeight()}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="Bar chart"
        >
          {/* Bars */}
          <For each={barLayout()}>
            {(bar, index) => (
              <rect
                class={styles.barRect}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                rx={2}
                ry={2}
                fill={bar.color}
                onMouseEnter={() => setHoveredIndex(index())}
                onMouseLeave={() => setHoveredIndex(null)}
              />
            )}
          </For>

          {/* X-axis labels */}
          <For each={barLayout()}>
            {(bar) => (
              <text
                class={styles.xLabel}
                x={bar.centerX}
                y={PADDING_TOP + chartHeight() + 6}
              >
                {bar.label}
              </text>
            )}
          </For>

          {/* Tooltip on hover */}
          <Show when={hoveredIndex() !== null}>
            {(() => {
              const idx = hoveredIndex()!;
              const bar = barLayout()[idx];
              if (!bar) return null;
              const text = format()(bar.value);
              const tooltipWidth = Math.max(text.length * 7 + 16, 48);
              const tooltipHeight = 22;
              const tooltipX = bar.centerX - tooltipWidth / 2;
              const tooltipY = bar.y - tooltipHeight - 6;

              return (
                <g class={styles.tooltipGroup}>
                  <rect
                    class={styles.tooltipRect}
                    x={tooltipX}
                    y={tooltipY}
                    width={tooltipWidth}
                    height={tooltipHeight}
                  />
                  <text
                    class={styles.tooltipText}
                    x={bar.centerX}
                    y={tooltipY + tooltipHeight / 2 + 4}
                  >
                    {text}
                  </text>
                </g>
              );
            })()}
          </Show>
        </svg>
      </div>
    </Show>
  );
}
