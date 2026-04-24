export type BootPhase = 'BURST' | 'CONVERGE' | 'CONFIRM' | 'DISMISS';

export type ParticleColor = 'cyan' | 'green';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  opacity: number;
  targetX: number;
  targetY: number;
  color: ParticleColor;
}

const SPRING_STIFFNESS = 12;
const SPRING_DAMPING = 0.82;
const DISMISS_FORCE = 3;
const DISMISS_FADE = 2.5;

export function createParticles(count: number): Particle[] {
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 6;
    return {
      x: 0.5,
      y: 0.5,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      opacity: 1,
      targetX: 0.5,
      targetY: 0.5,
      color: Math.random() < 0.3 ? 'green' : 'cyan',
    };
  });
}

export function computeGridTargets(count: number): Array<{ x: number; y: number }> {
  const cols = Math.ceil(Math.sqrt(count * 1.5));
  const rows = Math.ceil(count / cols);
  const padding = 0.08;
  const xStep = (1 - 2 * padding) / Math.max(cols - 1, 1);
  const yStep = (1 - 2 * padding) / Math.max(rows - 1, 1);
  const targets: Array<{ x: number; y: number }> = [];

  for (let r = 0; r < rows && targets.length < count; r++) {
    for (let c = 0; c < cols && targets.length < count; c++) {
      targets.push({ x: padding + c * xStep, y: padding + r * yStep });
    }
  }
  return targets;
}

export function updateParticles(
  particles: Particle[],
  phase: BootPhase,
  dt: number,
): void {
  for (const p of particles) {
    switch (phase) {
      case 'BURST': {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.97;
        p.vy *= 0.97;
        break;
      }
      case 'CONVERGE':
      case 'CONFIRM': {
        const dx = p.targetX - p.x;
        const dy = p.targetY - p.y;
        p.vx = (p.vx + dx * SPRING_STIFFNESS * dt) * SPRING_DAMPING;
        p.vy = (p.vy + dy * SPRING_STIFFNESS * dt) * SPRING_DAMPING;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        break;
      }
      case 'DISMISS': {
        const dx = p.x - 0.5;
        const dy = p.y - 0.5;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
        p.vx += (dx / dist) * DISMISS_FORCE * dt;
        p.vy += (dy / dist) * DISMISS_FORCE * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.opacity = Math.max(0, p.opacity - DISMISS_FADE * dt);
        break;
      }
    }
  }
}

export function computeParticleCount(w: number, h: number): number {
  return Math.min(400, Math.max(80, Math.floor((w * h) / 5000)));
}

export function computeParticleRadius(dpr: number): number {
  return Math.max(1.5, 2.5 * dpr);
}
