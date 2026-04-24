import { onMount, onCleanup } from 'solid-js';
import type { BootPhase } from './particle-math';
import {
  createParticles,
  computeGridTargets,
  updateParticles,
  computeParticleCount,
  computeParticleRadius,
} from './particle-math';
import { canvas } from './boot-screen.css';

interface ParticleCanvasProps {
  phase: () => BootPhase;
}

export function ParticleCanvas(props: ParticleCanvasProps) {
  let ref!: HTMLCanvasElement;

  onMount(() => {
    const ctx = ref.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let w = 0;
    let h = 0;
    let particles = createParticles(80);
    let targets = computeGridTargets(80);
    let radius = computeParticleRadius(dpr);

    function resize() {
      const rect = ref.parentElement!.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      ref.width = w * dpr;
      ref.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = computeParticleCount(w, h);
      if (Math.abs(count - particles.length) > 20) {
        particles = createParticles(count);
        targets = computeGridTargets(count);
        particles.forEach((p, i) => {
          p.targetX = targets[i].x;
          p.targetY = targets[i].y;
        });
      }
      radius = computeParticleRadius(dpr);
    }

    const ro = new ResizeObserver(resize);
    ro.observe(ref.parentElement!);
    resize();

    particles = createParticles(computeParticleCount(w, h));
    targets = computeGridTargets(particles.length);
    particles.forEach((p, i) => {
      p.targetX = targets[i].x;
      p.targetY = targets[i].y;
    });

    let mouseX = -1;
    let mouseY = -1;
    const REPEL_RADIUS = 0.08;
    const REPEL_STRENGTH = 0.3;

    function onMouseMove(e: MouseEvent) {
      const rect = ref.getBoundingClientRect();
      mouseX = (e.clientX - rect.left) / rect.width;
      mouseY = (e.clientY - rect.top) / rect.height;
    }
    function onMouseLeave() { mouseX = -1; mouseY = -1; }
    ref.addEventListener('mousemove', onMouseMove);
    ref.addEventListener('mouseleave', onMouseLeave);

    let lastTime = performance.now();
    let animId = 0;

    function loop(time: number) {
      const dt = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;

      updateParticles(particles, props.phase(), dt);

      if (mouseX >= 0 && (props.phase() === 'CONFIRM' || props.phase() === 'CONVERGE')) {
        for (const p of particles) {
          const dx = p.x - mouseX;
          const dy = p.y - mouseY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < REPEL_RADIUS && dist > 0.001) {
            const force = (1 - dist / REPEL_RADIUS) * REPEL_STRENGTH * dt;
            p.x += (dx / dist) * force;
            p.y += (dy / dist) * force;
          }
        }
      }

      ctx!.clearRect(0, 0, w, h);
      for (const p of particles) {
        if (p.opacity <= 0) continue;
        const px = p.x * w;
        const py = p.y * h;

        const isCyan = p.color === 'cyan';
        const core = isCyan ? '#00d4ff' : '#22c55e';
        const glowInner = isCyan ? 'rgba(0, 212, 255, 0.15)' : 'rgba(34, 197, 94, 0.15)';
        const glowOuter = isCyan ? 'rgba(0, 212, 255, 0)' : 'rgba(34, 197, 94, 0)';

        ctx!.globalAlpha = p.opacity * 0.12;
        ctx!.beginPath();
        ctx!.arc(px, py, radius * 3, 0, Math.PI * 2);
        const grad = ctx!.createRadialGradient(
          px, py, radius,
          px, py, radius * 3,
        );
        grad.addColorStop(0, glowInner);
        grad.addColorStop(1, glowOuter);
        ctx!.fillStyle = grad;
        ctx!.fill();

        ctx!.globalAlpha = p.opacity * 0.5;
        ctx!.beginPath();
        ctx!.arc(px, py, radius, 0, Math.PI * 2);
        ctx!.fillStyle = core;
        ctx!.fill();
      }
      ctx!.globalAlpha = 1;

      animId = requestAnimationFrame(loop);
    }

    animId = requestAnimationFrame(loop);

    onCleanup(() => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      ref.removeEventListener('mousemove', onMouseMove);
      ref.removeEventListener('mouseleave', onMouseLeave);
    });
  });

  return <canvas ref={ref} class={canvas} />;
}
