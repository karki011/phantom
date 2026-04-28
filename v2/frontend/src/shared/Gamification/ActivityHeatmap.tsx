// PhantomOS v2 — GitHub-style Activity Heatmap (SVG)
// Author: Subash Karki

import { createSignal, createMemo, For, Show } from 'solid-js';
import type { HeatmapDay } from '@/core/types';
import { hunterRank } from '@/core/signals/gamification';
import { RANK_COLORS, heatmapContainer, heatmapHeader, heatmapTitle, heatmapSvgWrap, heatmapTooltip, heatmapTooltipDate, heatmapTooltipDetail } from '@/styles/gamification.css';
import { vars } from '@/styles/theme.css';

interface ActivityHeatmapProps {
  data: HeatmapDay[];
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  day: HeatmapDay | null;
}

const CELL_SIZE = 12;
const CELL_GAP = 3;
const CELL_STEP = CELL_SIZE + CELL_GAP;
const WEEKS = 52;
const DAYS_PER_WEEK = 7;
const LEFT_LABEL_WIDTH = 32;
const TOP_LABEL_HEIGHT = 18;

const DAY_LABELS = [
  { index: 1, label: 'Mon' },
  { index: 3, label: 'Wed' },
  { index: 5, label: 'Fri' },
];

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const getOpacityLevel = (count: number, max: number): number => {
  if (count === 0 || max === 0) return 0;
  const ratio = count / max;
  if (ratio <= 0.25) return 0.25;
  if (ratio <= 0.5) return 0.5;
  if (ratio <= 0.75) return 0.75;
  return 1;
};

const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const ActivityHeatmap = (props: ActivityHeatmapProps) => {
  const [tooltip, setTooltip] = createSignal<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    day: null,
  });

  const gridData = createMemo(() => {
    const lookup = new Map<string, HeatmapDay>();
    for (const d of props.data) {
      lookup.set(d.date, d);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayDay = today.getDay();

    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + (6 - todayDay));

    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (WEEKS * 7 - 1));

    const cells: (HeatmapDay | null)[][] = [];
    const labels: { label: string; weekIndex: number }[] = [];
    let currentMax = 0;
    let lastMonth = -1;

    const cursor = new Date(startDate);
    for (let week = 0; week < WEEKS; week++) {
      const weekCells: (HeatmapDay | null)[] = [];
      for (let day = 0; day < DAYS_PER_WEEK; day++) {
        if (cursor > today) {
          weekCells.push(null);
        } else {
          const key = cursor.toISOString().slice(0, 10);
          const entry = lookup.get(key) ?? {
            date: key,
            message_count: 0,
            session_count: 0,
            tool_call_count: 0,
          };
          weekCells.push(entry);
          if (entry.message_count > currentMax) {
            currentMax = entry.message_count;
          }
        }

        const month = cursor.getMonth();
        if (day === 0 && month !== lastMonth) {
          labels.push({ label: MONTH_NAMES[month], weekIndex: week });
          lastMonth = month;
        }

        cursor.setDate(cursor.getDate() + 1);
      }
      cells.push(weekCells);
    }

    return { grid: cells, monthLabels: labels, maxCount: currentMax };
  });

  const rankColor = createMemo(() => {
    const rank = hunterRank();
    return RANK_COLORS[rank]?.border ?? vars.color.accent;
  });

  const svgWidth = LEFT_LABEL_WIDTH + WEEKS * CELL_STEP;
  const svgHeight = TOP_LABEL_HEIGHT + DAYS_PER_WEEK * CELL_STEP;

  const handleCellEnter = (e: MouseEvent, day: HeatmapDay) => {
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const parentRect = (e.currentTarget as SVGRectElement).closest('div')?.getBoundingClientRect();
    if (parentRect) {
      setTooltip({
        visible: true,
        x: rect.left - parentRect.left + CELL_SIZE / 2,
        y: rect.top - parentRect.top - 8,
        day,
      });
    }
  };

  const handleCellLeave = () => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  };

  return (
    <div class={heatmapContainer}>
      <div class={heatmapHeader}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={vars.color.accent} stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span class={heatmapTitle}>Activity</span>
      </div>

      <div class={heatmapSvgWrap}>
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ display: 'block' }}
        >
          {/* Month labels */}
          <For each={gridData().monthLabels}>
            {({ label, weekIndex }) => (
              <text
                x={LEFT_LABEL_WIDTH + weekIndex * CELL_STEP}
                y={12}
                fill={vars.color.textDisabled}
                font-size="10"
                font-family="sans-serif"
              >
                {label}
              </text>
            )}
          </For>

          {/* Day labels */}
          <For each={DAY_LABELS}>
            {({ index, label }) => (
              <text
                x={0}
                y={TOP_LABEL_HEIGHT + index * CELL_STEP + CELL_SIZE - 2}
                fill={vars.color.textDisabled}
                font-size="10"
                font-family="sans-serif"
              >
                {label}
              </text>
            )}
          </For>

          {/* Cells */}
          <For each={gridData().grid}>
            {(week, weekIdx) => (
              <For each={week}>
                {(day, dayIdx) => {
                  if (!day) return null;
                  const x = LEFT_LABEL_WIDTH + weekIdx() * CELL_STEP;
                  const y = TOP_LABEL_HEIGHT + dayIdx() * CELL_STEP;
                  const opacity = getOpacityLevel(day.message_count, gridData().maxCount);

                  return (
                    <rect
                      x={x}
                      y={y}
                      width={CELL_SIZE}
                      height={CELL_SIZE}
                      rx={2}
                      ry={2}
                      fill={opacity === 0 ? vars.color.bgTertiary : rankColor()}
                      opacity={opacity === 0 ? 0.4 : opacity}
                      style={{ cursor: 'pointer', transition: 'opacity 150ms ease' }}
                      onMouseEnter={(e) => handleCellEnter(e, day)}
                      onMouseLeave={handleCellLeave}
                    />
                  );
                }}
              </For>
            )}
          </For>
        </svg>

        {/* Tooltip */}
        <Show when={tooltip().visible && tooltip().day}>
          <div
            class={heatmapTooltip}
            style={{
              left: `${tooltip().x}px`,
              top: `${tooltip().y}px`,
            }}
          >
            <div class={heatmapTooltipDate}>
              {formatDate(tooltip().day!.date)}
            </div>
            <div class={heatmapTooltipDetail}>
              {tooltip().day!.message_count} messages · {tooltip().day!.session_count} sessions · {tooltip().day!.tool_call_count} tool calls
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
};
