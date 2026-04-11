/**
 * PhantomOS System Metrics Route
 * Exposes host CPU, memory, and load data so the UI can show resource usage.
 * @author Subash Karki
 */
import { cpus, freemem, totalmem, loadavg } from 'node:os';
import { Hono } from 'hono';

export const systemMetricsRoutes = new Hono();

// Keep previous CPU tick snapshot for delta-based usage calculation
let prevIdle = 0;
let prevTotal = 0;

function getCpuUsage(): number {
  const cores = cpus();
  let idle = 0;
  let total = 0;
  for (const core of cores) {
    const t = core.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }

  const idleDiff = idle - prevIdle;
  const totalDiff = total - prevTotal;
  prevIdle = idle;
  prevTotal = total;

  if (totalDiff === 0) {
    // First call or no change — fall back to 1-min load average
    const [load1] = loadavg();
    return Math.min(Math.round((load1 / cores.length) * 100), 100);
  }
  return Math.round((1 - idleDiff / totalDiff) * 100);
}

systemMetricsRoutes.get('/system-metrics', (c) => {
  const total = totalmem();
  const free = freemem();
  const used = total - free;

  return c.json({
    cpu: { usage: getCpuUsage(), cores: cpus().length },
    memory: { used, total, usedPercent: Math.round((used / total) * 100) },
    loadAvg: loadavg(),
  });
});
