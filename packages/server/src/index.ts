/**
 * PhantomOS — The System
 * Main Hono server: routes, SSE, watchers, migrations, seeding.
 * @author Subash Karki
 */
import { logger } from './logger.js';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { db, sqlite, runMigrations, seedDatabase } from '@phantom-os/db';
import { startSessionWatcher } from './collectors/session-watcher.js';
import { startTaskWatcher } from './collectors/task-watcher.js';
import {
  checkAchievements,
  onSessionEnd,
  onSessionStart,
  onTaskComplete,
  seedAchievements,
} from '@phantom-os/gamification';
import { achievementRoutes } from './routes/achievements.js';
import { hunterRoutes } from './routes/hunter.js';
import { questRoutes } from './routes/quests.js';
import { sessionRoutes } from './routes/sessions.js';
import { statsRoutes } from './routes/stats.js';
import { taskRoutes } from './routes/tasks.js';
import { projectRoutes } from './routes/projects.js';
import { worktreeRoutes, initWorktreeBroadcast } from './routes/worktrees.js';
import { worktreeFileRoutes } from './routes/worktree-files.js';
import { serverRoutes } from './routes/servers.js';
import { initProcessRegistry } from './process-registry.js';
import { hunterStatsRoutes } from './routes/hunter-stats.js';
import { chatRoutes } from './routes/chat.js';
import { paneStateRoutes } from './routes/pane-states.js';
import { plansRoutes } from './routes/plans.js';
import { preferencesRoutes } from './routes/preferences.js';
import { API_PORT } from '@phantom-os/shared';
import type { Server } from 'node:http';
import { setupTerminalWs } from './routes/terminal-ws.js';
import { terminalRestoreRoutes } from './routes/terminal-restore.js';
import { systemMetricsRoutes } from './routes/system-metrics.js';
import { graphRoutes } from './routes/graph.js';
import { orchestratorRoutes } from './routes/orchestrator.js';
import { journalRoutes } from './routes/journal.js';
import { cleanupRoutes } from './routes/cleanup.js';
import { graphEngine } from './services/graph-engine.js';
import { orchestratorEngine } from './services/orchestrator-engine.js';
import { startMcpServer, stopMcpServer } from './mcp/index.js';
import { registerPhantomMcpGlobal } from './services/mcp-config.js';
import { destroyAllPtys, initDaemonClient, disconnectDaemon } from './terminal-manager.js';
import { startHistoryWriter, stopHistoryWriter, markAllExited } from './terminal-history.js';

// ---------------------------------------------------------------------------
// SSE Broadcast
// ---------------------------------------------------------------------------

type SSEClient = {
  sendRaw: (data: string) => void;
  close: () => void;
  abort: () => void;
  lastActive: number;
};

const sseClients = new Set<SSEClient>();

const broadcast = (event: string, data: unknown): void => {
  // Send as data-only (no event: field) so browser's onmessage catches it
  const payload = JSON.stringify({ type: event, data });
  for (const client of sseClients) {
    try {
      client.sendRaw(payload);
    } catch {
      sseClients.delete(client);
    }
  }
};

// ---------------------------------------------------------------------------
// Initialize Process Registry
// ---------------------------------------------------------------------------

initProcessRegistry(broadcast);
initWorktreeBroadcast(broadcast);

// ---------------------------------------------------------------------------
// Database Bootstrap
// ---------------------------------------------------------------------------

runMigrations(sqlite);
seedDatabase(db, sqlite);
seedAchievements();

// Initialize graph engine after migrations so tables exist
graphEngine.init(broadcast);
orchestratorEngine.init(broadcast);

// ---------------------------------------------------------------------------
// Hono App
// ---------------------------------------------------------------------------

const app = new Hono();

app.use('*', cors({ origin: ['http://localhost:3850', 'http://localhost:3849', 'http://127.0.0.1:3850', 'http://127.0.0.1:3849'] }));

// Mount route groups
app.route('/api', hunterRoutes);
app.route('/api', sessionRoutes);
app.route('/api', taskRoutes);
app.route('/api', achievementRoutes);
app.route('/api', questRoutes);
app.route('/api', statsRoutes);
app.route('/api', projectRoutes);
app.route('/api', worktreeRoutes);
app.route('/api', worktreeFileRoutes);
app.route('/api', hunterStatsRoutes);
app.route('/api', chatRoutes);
app.route('/api', serverRoutes);
app.route('/api', paneStateRoutes);
app.route('/api', plansRoutes);
app.route('/api', preferencesRoutes);
app.route('/api', terminalRestoreRoutes);
app.route('/api', systemMetricsRoutes);
app.route('/api', graphRoutes);
app.route('/api', orchestratorRoutes);
app.route('/api', journalRoutes);
app.route('/api', cleanupRoutes);

// SSE endpoint
app.get('/events', (c) => {
  return streamSSE(c, async (stream) => {
    const ac = new AbortController();
    const client: SSEClient = {
      sendRaw: (data) => {
        // Write data-only SSE (no event: field) so onmessage receives it
        stream.writeSSE({ data });
      },
      close: () => {
        sseClients.delete(client);
      },
      abort: () => ac.abort(),
      lastActive: Date.now(),
    };
    sseClients.add(client);

    // Immediate heartbeat so client knows it's connected
    stream.writeSSE({ event: 'heartbeat', data: '' });

    // Periodic heartbeat every 30 seconds
    const heartbeat = setInterval(() => {
      try {
        stream.writeSSE({ event: 'heartbeat', data: '' });
        client.lastActive = Date.now();
      } catch {
        clearInterval(heartbeat);
      }
    }, 30_000);

    // Keep alive until client disconnects
    stream.onAbort(() => {
      clearInterval(heartbeat);
      sseClients.delete(client);
    });

    // Block to keep stream open — abortable so stale sweep can free resources
    try {
      await new Promise((_, reject) => {
        ac.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    } catch {
      // Abort is expected during stale cleanup — exit gracefully
    }
  });
});

// Health check
app.get('/health', (c) => c.json({ status: 'alive', timestamp: Date.now() }));

// Sweep stale SSE clients that silently disconnected (laptop sleep, WiFi switch)
setInterval(() => {
  const staleThreshold = Date.now() - 60_000; // 60 seconds
  for (const client of sseClients) {
    if (client.lastActive < staleThreshold) {
      try { client.abort(); } catch {}
      try { client.close(); } catch {}
      sseClients.delete(client);
    }
  }
}, 30_000);

// ---------------------------------------------------------------------------
// Start Watchers
// ---------------------------------------------------------------------------

const handleTaskComplete = (sessionId: string, taskId: string): void => {
  onTaskComplete(sessionId, taskId);
  const newAchievements = checkAchievements();
  if (newAchievements.length > 0) {
    broadcast('achievement:unlock', newAchievements);
  }
};

const handleSessionStart = (sessionId: string): void => {
  onSessionStart(sessionId);
  const newAchievements = checkAchievements();
  if (newAchievements.length > 0) {
    broadcast('achievement:unlock', newAchievements);
  }
};

const handleSessionEnd = (sessionId: string): void => {
  onSessionEnd(sessionId);
  const newAchievements = checkAchievements();
  if (newAchievements.length > 0) {
    broadcast('achievement:unlock', newAchievements);
  }
};

startSessionWatcher(broadcast, handleSessionStart, handleSessionEnd);
startTaskWatcher(broadcast, handleTaskComplete);

// Scan JSONL sessions async (don't block boot)
import { scanJsonlSessions, startActiveContextPoller, startPeriodicRescan } from './collectors/jsonl-scanner.js';
scanJsonlSessions(broadcast).catch((err) => console.error('[JsonlScanner] Error:', err));

// Poll active sessions for live context every 10s
startActiveContextPoller(broadcast);

// Re-enrich sessions that had 0 tokens at boot (handles late JSONL writes and /clear rotation)
startPeriodicRescan(broadcast);

// Poll active sessions for live activity feed every 5s
import { startActivityPoller } from './collectors/activity-poller.js';
startActivityPoller(broadcast);

// ---------------------------------------------------------------------------
// Graceful Shutdown
// ---------------------------------------------------------------------------

const shutdown = () => {
  logger.info('PhantomOS', 'Shutting down gracefully...');
  void stopMcpServer().catch(() => {});
  graphEngine.destroy();
  stopHistoryWriter();
  markAllExited();
  disconnectDaemon();
  destroyAllPtys();
  // Checkpoint WAL so no data is lost
  try { sqlite.pragma('wal_checkpoint(TRUNCATE)'); } catch {}
  // Close database
  try { sqlite.close(); } catch {}
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------

const server = serve({ fetch: app.fetch, port: API_PORT }, (info) => {
  logger.banner(
    '',
    '================================================',
    ' PhantomOS — The System',
    `   running on http://localhost:${info.port}`,
    '================================================',
    '',
  );
});

setupTerminalWs(server as unknown as Server);
startHistoryWriter();

// Start MCP server for external AI agent integration (non-fatal)
startMcpServer().catch((err) =>
  logger.warn('MCP', 'MCP server start failed (non-fatal):', err),
);

// Register phantom-ai globally in ~/.mcp.json so every Claude session has
// access to graph tools without per-project .mcp.json pollution.
registerPhantomMcpGlobal();

// Skip daemon — use direct PTY (node-pty) for terminal sessions.
// The daemon has output routing bugs that cause black-screen terminals.
// Direct PTY is simpler and works reliably.
// To re-enable daemon: uncomment initDaemonClient() call below.
// initDaemonClient().catch((err) =>
//   console.warn('[PhantomOS] Daemon client init error:', err),
// );
