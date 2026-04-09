/**
 * ActivityHeatmap -- GitHub-style contribution heatmap for daily activity
 * Renders an SVG grid showing message counts over the last 52 weeks.
 *
 * @author Subash Karki
 */
import { useState, useMemo, useCallback } from 'react';
import { Group, Paper, Stack, Text, Title } from '@mantine/core';
import { Calendar } from 'lucide-react';

interface HeatmapDay {
  date: string;
  messageCount: number;
  sessionCount: number;
  toolCallCount: number;
}

export interface ActivityHeatmapProps {
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

const DAY_LABELS: { index: number; label: string }[] = [
  { index: 1, label: 'Mon' },
  { index: 3, label: 'Wed' },
  { index: 5, label: 'Fri' },
];

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function getOpacityLevel(count: number, max: number): number {
  if (count === 0 || max === 0) return 0;
  const ratio = count / max;
  if (ratio <= 0.25) return 0.25;
  if (ratio <= 0.5) return 0.5;
  if (ratio <= 0.75) return 0.75;
  return 1;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export const ActivityHeatmap = ({ data }: ActivityHeatmapProps) => {
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    day: null,
  });

  const { grid, monthLabels, maxCount } = useMemo(() => {
    // Build a lookup from date string to HeatmapDay
    const lookup = new Map<string, HeatmapDay>();
    for (const d of data) {
      lookup.set(d.date, d);
    }

    // Find the end date (today) and start date (52 weeks ago)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayDay = today.getDay(); // 0=Sun, 6=Sat

    // End of grid is the current week's Saturday
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + (6 - todayDay));

    // Start date is 52 weeks before the end (Sunday)
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (WEEKS * 7 - 1));

    // Fill the grid: grid[week][day]
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
            messageCount: 0,
            sessionCount: 0,
            toolCallCount: 0,
          };
          weekCells.push(entry);
          if (entry.messageCount > currentMax) {
            currentMax = entry.messageCount;
          }
        }

        // Track month boundaries for labels
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
  }, [data]);

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<SVGRectElement>, day: HeatmapDay) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const parentRect = e.currentTarget.closest('div')?.getBoundingClientRect();
      if (parentRect) {
        setTooltip({
          visible: true,
          x: rect.left - parentRect.left + CELL_SIZE / 2,
          y: rect.top - parentRect.top - 8,
          day,
        });
      }
    },
    [],
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
  }, []);

  const svgWidth = LEFT_LABEL_WIDTH + WEEKS * CELL_STEP;
  const svgHeight = TOP_LABEL_HEIGHT + DAYS_PER_WEEK * CELL_STEP;

  return (
    <Paper
      p="md"
      bg="var(--phantom-surface-card)"
      radius="md"
      style={{ border: '1px solid var(--phantom-border-subtle)' }}
    >
      <Stack gap="md">
        <Group gap="xs">
          <Calendar size={18} color="var(--phantom-accent-glow)" />
          <Title order={4} c="var(--phantom-text-primary)">
            Activity
          </Title>
        </Group>

        <div style={{ position: 'relative', overflowX: 'auto' }}>
          <svg
            width={svgWidth}
            height={svgHeight}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            style={{ display: 'block' }}
          >
            {/* Month labels */}
            {monthLabels.map(({ label, weekIndex }) => (
              <text
                key={`month-${weekIndex}`}
                x={LEFT_LABEL_WIDTH + weekIndex * CELL_STEP}
                y={12}
                fill="var(--phantom-text-muted)"
                fontSize={10}
                fontFamily="sans-serif"
              >
                {label}
              </text>
            ))}

            {/* Day labels */}
            {DAY_LABELS.map(({ index, label }) => (
              <text
                key={`day-${index}`}
                x={0}
                y={TOP_LABEL_HEIGHT + index * CELL_STEP + CELL_SIZE - 2}
                fill="var(--phantom-text-muted)"
                fontSize={10}
                fontFamily="sans-serif"
              >
                {label}
              </text>
            ))}

            {/* Cells */}
            {grid.map((week, weekIdx) =>
              week.map((day, dayIdx) => {
                if (!day) return null;
                const x = LEFT_LABEL_WIDTH + weekIdx * CELL_STEP;
                const y = TOP_LABEL_HEIGHT + dayIdx * CELL_STEP;
                const opacity = getOpacityLevel(day.messageCount, maxCount);

                return (
                  <rect
                    key={`${weekIdx}-${dayIdx}`}
                    x={x}
                    y={y}
                    width={CELL_SIZE}
                    height={CELL_SIZE}
                    rx={2}
                    ry={2}
                    fill={
                      opacity === 0
                        ? 'var(--phantom-surface-elevated)'
                        : 'var(--phantom-accent-glow)'
                    }
                    opacity={opacity === 0 ? 0.4 : opacity}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={(e) => handleMouseEnter(e, day)}
                    onMouseLeave={handleMouseLeave}
                  />
                );
              }),
            )}
          </svg>

          {/* Tooltip */}
          {tooltip.visible && tooltip.day && (
            <div
              style={{
                position: 'absolute',
                left: tooltip.x,
                top: tooltip.y,
                transform: 'translate(-50%, -100%)',
                background: 'var(--phantom-surface-elevated)',
                border: '1px solid var(--phantom-border-subtle)',
                borderRadius: 6,
                padding: '6px 10px',
                pointerEvents: 'none',
                zIndex: 10,
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              }}
            >
              <Text fz="xs" fw={600} c="var(--phantom-text-primary)">
                {formatDate(tooltip.day.date)}
              </Text>
              <Text fz="xs" c="var(--phantom-text-secondary)">
                {tooltip.day.messageCount} messages &middot; {tooltip.day.sessionCount} sessions &middot; {tooltip.day.toolCallCount} tool calls
              </Text>
            </div>
          )}
        </div>
      </Stack>
    </Paper>
  );
};
