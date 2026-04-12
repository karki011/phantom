/**
 * PhantomOS System Metrics Route
 * Exposes host CPU, memory, and load data so the UI can show resource usage.
 * @author Subash Karki
 */
import { execSync } from 'node:child_process';
import { cpus, freemem, totalmem, loadavg, platform as osPlatform } from 'node:os';
import { Hono } from 'hono';

export const systemMetricsRoutes = new Hono();

// Cache layer — prevents rapid polling from blocking the event loop with execSync
let metricsCache: { data: unknown; timestamp: number } | null = null;
const CACHE_TTL = 2000; // 2 seconds

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

interface TopProcess {
  name: string;
  memMB: number;
  pid: number;
}

function getSwapUsage(): { used: number; total: number } {
  try {
    if (osPlatform() === 'darwin') {
      const output = execSync('sysctl vm.swapusage', { encoding: 'utf-8', timeout: 2000, stdio: ['pipe', 'pipe', 'pipe'] });
      const totalMatch = output.match(/total\s*=\s*([\d.]+)M/);
      const usedMatch = output.match(/used\s*=\s*([\d.]+)M/);
      return {
        total: totalMatch ? parseFloat(totalMatch[1]) * 1024 * 1024 : 0,
        used: usedMatch ? parseFloat(usedMatch[1]) * 1024 * 1024 : 0,
      };
    }
    // Linux: read /proc/meminfo
    const output = execSync('grep Swap /proc/meminfo', { encoding: 'utf-8', timeout: 2000, stdio: ['pipe', 'pipe', 'pipe'] });
    const totalMatch = output.match(/SwapTotal:\s+(\d+)/);
    const freeMatch = output.match(/SwapFree:\s+(\d+)/);
    const total = totalMatch ? parseInt(totalMatch[1], 10) * 1024 : 0;
    const free = freeMatch ? parseInt(freeMatch[1], 10) * 1024 : 0;
    return { total, used: total - free };
  } catch {
    return { used: 0, total: 0 };
  }
}

/** Map raw process command to a friendly app name */
function friendlyName(cmd: string): string {
  const lower = cmd.toLowerCase();

  // Phantom OS — identify specific sub-processes by their role
  if (lower.includes('phantom-os') || lower.includes('phantom_os')) {
    if (lower.includes('electron helper (renderer)')) return 'Phantom OS (UI)';
    if (lower.includes('electron helper') && lower.includes('gpu')) return 'Phantom OS (GPU)';
    if (lower.includes('electron helper') && lower.includes('network')) return 'Phantom OS (Network)';
    if (lower.includes('electron helper')) return 'Phantom OS (Helper)';
    if (lower.includes('electron.app') || lower.includes('electron .')) return 'Phantom OS (Main)';
    if (lower.includes('server/src/index')) return 'Phantom OS (Server)';
    if (lower.includes('electron-vite')) return 'Phantom OS (Vite)';
    if (lower.includes('turbo')) return 'Phantom OS (Turbo)';
    if (lower.includes('esbuild')) return 'Phantom OS (esbuild)';
    if (lower.includes('tsx')) return 'Phantom OS (Server)';
    return 'Phantom OS';
  }
  if (lower.includes('claude')) return 'Claude Code';
  if (lower.includes('arc') || (lower.includes('browser helper') && !lower.includes('phantom'))) return 'Arc Browser';
  if (lower.includes('chrome')) return 'Google Chrome';
  if (lower.includes('safari')) return 'Safari';
  if (lower.includes('firefox')) return 'Firefox';
  if (lower.includes('slack')) return 'Slack';
  if (lower.includes('discord')) return 'Discord';
  if (lower.includes('vscode') || lower.includes('code helper')) return 'VS Code';
  if (lower.includes('cursor')) return 'Cursor';
  if (lower.includes('warp')) return 'Warp Terminal';
  if (lower.includes('iterm')) return 'iTerm2';
  if (lower.includes('spotify')) return 'Spotify';
  if (lower.includes('figma')) return 'Figma';
  if (lower.includes('notion')) return 'Notion';
  if (lower.includes('docker')) return 'Docker';
  if (lower.includes('windowserver')) return 'WindowServer';
  if (lower.includes('wispr')) return 'Wispr Flow';
  // Fall back to last path segment
  return (cmd.split('/').pop() ?? 'unknown').slice(0, 25);
}

const isPhantomProcess = (name: string): boolean =>
  name.startsWith('Phantom OS');

function getTopProcesses(limit = 8): TopProcess[] {
  try {
    // Fetch more than needed so we can find our app processes even if they're not in the top N
    const fetchLimit = 30;
    const cmd = osPlatform() === 'darwin'
      ? `ps -Ao pid,rss,command -r | head -${fetchLimit + 1}`
      : `ps -Ao pid,rss,command --sort=-rss | head -${fetchLimit + 1}`;
    const output = execSync(cmd, { encoding: 'utf-8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] });
    const lines = output.trim().split('\n').slice(1);
    const all = lines.map((line) => {
      const parts = line.trim().split(/\s+/);
      const pid = parseInt(parts[0], 10);
      const rssKb = parseInt(parts[1], 10);
      const fullCmd = parts.slice(2).join(' ');
      return { name: friendlyName(fullCmd), memMB: Math.round(rssKb / 1024), pid };
    }).filter((p) => p.memMB > 0);

    // Pin Phantom OS processes at top, then fill with others
    const phantom = all.filter((p) => isPhantomProcess(p.name));
    const others = all.filter((p) => !isPhantomProcess(p.name));
    const remaining = limit - phantom.length;
    return [...phantom, ...others.slice(0, Math.max(remaining, 0))];
  } catch {
    return [];
  }
}

/** Get available memory (free + reclaimable) — more accurate than os.freemem() on macOS.
 *  macOS aggressively caches files in RAM, so freemem() reports almost zero even
 *  when gigabytes are reclaimable. vm_stat exposes purgeable and inactive pages
 *  that the kernel will release on demand. On Linux, /proc/meminfo MemAvailable
 *  already accounts for this. Falls back to os.freemem() if parsing fails. */
function getAvailableMemory(): number {
  try {
    if (osPlatform() === 'darwin') {
      const output = execSync('vm_stat', { encoding: 'utf-8', timeout: 2000, stdio: ['pipe', 'pipe', 'pipe'] });
      const pageSizeMatch = output.match(/page size of (\d+) bytes/);
      const pageSize = parseInt(pageSizeMatch?.[1] ?? '4096', 10);
      const parse = (label: string): number => {
        const m = output.match(new RegExp(`${label}:\\s+(\\d+)`));
        return m ? parseInt(m[1], 10) : 0;
      };
      return (parse('Pages free') + parse('Pages inactive') + parse('Pages purgeable')) * pageSize;
    }
    if (osPlatform() === 'linux') {
      const output = execSync('grep MemAvailable /proc/meminfo', { encoding: 'utf-8', timeout: 2000, stdio: ['pipe', 'pipe', 'pipe'] });
      const match = output.match(/MemAvailable:\s+(\d+)/);
      if (match) return parseInt(match[1], 10) * 1024;
    }
  } catch {
    // fall through to Node fallback
  }
  return freemem();
}

systemMetricsRoutes.get('/system-metrics', (c) => {
  // Return cached result if still fresh
  if (metricsCache && Date.now() - metricsCache.timestamp < CACHE_TTL) {
    return c.json(metricsCache.data);
  }

  const total = totalmem();
  const available = getAvailableMemory();
  const used = total - available;

  const result = {
    cpu: { usage: getCpuUsage(), cores: cpus().length },
    memory: { used, total, usedPercent: Math.round((used / total) * 100) },
    swap: getSwapUsage(),
    loadAvg: loadavg(),
    topProcesses: getTopProcesses(),
  };

  metricsCache = { data: result, timestamp: Date.now() };
  return c.json(result);
});
