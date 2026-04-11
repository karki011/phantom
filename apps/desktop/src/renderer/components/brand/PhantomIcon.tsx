/**
 * PhantomIcon — Ghost Circuit SVG Icon
 * A ghost/phantom silhouette formed from connected graph nodes and edges.
 * Uses CSS custom properties for theming.
 *
 * @author Subash Karki
 */

interface PhantomIconProps {
  size?: number;
  className?: string;
}

/** Ghost outline as connected dots (clockwise from top center) */
const outlineNodes: [number, number][] = [
  [32, 4],   // top center
  [44, 6],   // top right curve
  [52, 14],  // right shoulder
  [56, 26],  // right side
  [56, 38],  // right mid
  [56, 48],  // right lower
  [52, 56],  // right wave peak
  [46, 60],  // right wave valley
  [40, 56],  // center-right wave peak
  [32, 60],  // center wave valley
  [24, 56],  // center-left wave peak
  [18, 60],  // left wave valley
  [12, 56],  // left wave peak
  [8, 48],   // left lower
  [8, 38],   // left mid
  [8, 26],   // left side
  [12, 14],  // left shoulder
  [20, 6],   // top left curve
];

/** Eye positions */
const eyes: [number, number][] = [
  [24, 28],  // left eye
  [40, 28],  // right eye
];

/** Internal graph nodes */
const innerNodes: [number, number][] = [
  [32, 38],  // center
  [26, 44],  // lower left
  [38, 44],  // lower right
  [32, 50],  // bottom center
];

/** Inner node connections [fromIndex, toIndex] */
const innerEdges: [number, number][] = [
  [0, 1],  // center -> lower left
  [0, 2],  // center -> lower right
  [1, 3],  // lower left -> bottom center
  [2, 3],  // lower right -> bottom center
  [1, 2],  // lower left -> lower right
];

export const PhantomIcon = ({ size = 64, className }: PhantomIconProps) => {
  const accentCyan = 'var(--phantom-accent-cyan, #00d4ff)';
  const accentGlow = 'var(--phantom-accent-glow, #a855f7)';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* Glow filter for eyes */}
        <filter id="phantom-eye-glow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outline edges — connect consecutive nodes, plus close the loop */}
      {outlineNodes.map(([x1, y1], i) => {
        const next = outlineNodes[(i + 1) % outlineNodes.length];
        return (
          <line
            key={`outline-edge-${i}`}
            x1={x1}
            y1={y1}
            x2={next[0]}
            y2={next[1]}
            stroke={accentCyan}
            strokeWidth={1}
            opacity={0.6}
          />
        );
      })}

      {/* Outline nodes */}
      {outlineNodes.map(([cx, cy], i) => (
        <circle
          key={`outline-node-${i}`}
          cx={cx}
          cy={cy}
          r={1.5}
          fill={accentCyan}
        />
      ))}

      {/* Inner graph edges */}
      {innerEdges.map(([from, to], i) => (
        <line
          key={`inner-edge-${i}`}
          x1={innerNodes[from][0]}
          y1={innerNodes[from][1]}
          x2={innerNodes[to][0]}
          y2={innerNodes[to][1]}
          stroke={accentCyan}
          strokeWidth={0.8}
          opacity={0.4}
        />
      ))}

      {/* Inner graph nodes */}
      {innerNodes.map(([cx, cy], i) => (
        <circle
          key={`inner-node-${i}`}
          cx={cx}
          cy={cy}
          r={1.5}
          fill={accentCyan}
          opacity={0.6}
        />
      ))}

      {/* Eyes — larger dots with glow */}
      {eyes.map(([cx, cy], i) => (
        <circle
          key={`eye-${i}`}
          cx={cx}
          cy={cy}
          r={2.5}
          fill={accentGlow}
          filter="url(#phantom-eye-glow)"
        />
      ))}
    </svg>
  );
};
