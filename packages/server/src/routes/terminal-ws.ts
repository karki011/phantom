/**
 * PhantomOS Terminal WebSocket Handler
 * Bridges xterm.js in the renderer to the terminal daemon (or direct PTY fallback).
 * The frontend WebSocket interface is unchanged — this layer relays between
 * WebSocket and the daemon's Unix socket.
 * @author Subash Karki
 */
import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'node:http';
import type { Server as HttpsServer } from 'node:https';
import {
  createPty,
  writePty,
  resizePty,
  destroyPty,
  detachPty,
  getPtySession,
} from '../terminal-manager.js';
import { registerProcess, unregisterProcess } from '../process-registry.js';
import { historyWriter } from '../terminal-history.js';
import { logger } from '../logger.js';

export const setupTerminalWs = (
  server: HttpServer | HttpsServer,
): void => {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const match = url.pathname.match(/^\/ws\/terminal\/([a-zA-Z0-9_-]+)$/);
    if (!match) return;

    wss.handleUpgrade(req, socket, head, (ws) => {
      handleConnection(ws, match[1]);
    });
  });
};

const handleConnection = (ws: WebSocket, termId: string): void => {
  let session = getPtySession(termId);

  // Output relay — created once, passed as initialListener to createPty
  // so it's attached BEFORE the daemon starts sending output.
  const onData = (data: string) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'output', data }));
    }
  };

  ws.on('close', (code, reason) => {
    logger.debug('TerminalWS', `ws.close termId=${termId.slice(0,8)} code=${code} reason=${reason?.toString() ?? ''}`);
    if (session) {
      detachPty(termId, onData);
      // Only unregister process if no other listeners remain
      if (session.listeners.size === 0) {
        unregisterProcess(termId);
      }
    }
    session = undefined;
  });

  // If session already exists (reconnect), wire listener immediately
  if (session) {
    session.listeners.add(onData);
  }

  // Serialize async message handling — queue messages so resize waits for init
  let processing: Promise<void> = Promise.resolve();

  ws.on('message', (raw) => {
    processing = processing.then(async () => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type !== 'input' && msg.type !== 'resize') {
          logger.debug('TerminalWS', `msg type=${msg.type} termId=${termId.slice(0,8)}`);
        }
        switch (msg.type) {
          case 'init': {
            if (!session) {
              try {
                const ALLOWED_ENV_KEYS = new Set(['PORT', 'NODE_ENV', 'CLAUDE_API_KEY']);
                const safeEnv = msg.env
                  ? Object.fromEntries(
                      Object.entries(msg.env)
                        .filter(([k]: [string, unknown]) => ALLOWED_ENV_KEYS.has(k))
                        .map(([k, v]) => [k, String(v)]),
                    ) as Record<string, string>
                  : undefined;
                // Pass onData as initialListener — it's attached to the session
                // BEFORE the daemon subscription, preventing lost output.
                session = await createPty(termId, msg.cwd || undefined, msg.cols, msg.rows, onData, safeEnv);
                // Record session for cold restore persistence
                historyWriter.recordSession(termId, {
                  worktreeId: msg.worktreeId ?? '',
                  shell: process.env.SHELL || '/bin/zsh',
                  cwd: msg.cwd || '',
                  env: msg.env ? JSON.stringify(msg.env) : '',
                  cols: msg.cols ?? 80,
                  rows: msg.rows ?? 24,
                });

                // Auto-run initial command after shell is ready
                // Wait for shell prompt by watching for output, then send command
                if (msg.initialCommand && session) {
                  let outputCount = 0;
                  let sent = false;
                  const checkReady = (data: string) => {
                    if (sent) return;
                    outputCount++;
                    // Shell is ready when we've received a few output chunks
                    // (prompt rendering, motd, etc.) or see common prompt chars
                    if (outputCount >= 3 || /[$#%>❯➜]\s*$/.test(data)) {
                      sent = true;
                      session?.listeners.delete(checkReady);
                      setTimeout(() => writePty(termId, msg.initialCommand + '\n'), 100);
                    }
                  };
                  session.listeners.add(checkReady);
                  // Fallback: send after 2s no matter what
                  setTimeout(() => {
                    if (!sent) {
                      sent = true;
                      session?.listeners.delete(checkReady);
                      writePty(termId, msg.initialCommand + '\n');
                    }
                  }, 2000);
                }
                // Register in process registry if this is a recipe run
                if (msg.recipeCommand) {
                  registerProcess({
                    termId,
                    worktreeId: msg.worktreeId ?? '',
                    projectId: msg.projectId ?? '',
                    recipe: msg.recipeCommand,
                    recipeLabel: msg.recipeLabel ?? msg.recipeCommand,
                    category: msg.recipeCategory ?? 'custom',
                    port: msg.port ?? null,
                    pid: session?.pty?.pid ?? null,
                    startedAt: Date.now(),
                  });
                }
              } catch (err) {
                console.error(`[TerminalWS] Failed to spawn PTY for ${termId}:`, err);
                ws.send(JSON.stringify({
                  type: 'output',
                  data: `\r\n\x1b[31mFailed to spawn terminal: ${(err as Error).message}\x1b[0m\r\n`,
                }));
                ws.close(1011, 'PTY spawn failed');
              }
            }
            break;
          }
          case 'input':
            if (!session) {
              try {
                session = await createPty(termId, undefined, undefined, undefined, onData);
              } catch { /* handled above */ }
            }
            writePty(termId, msg.data);
            break;
          case 'resize':
            resizePty(termId, msg.cols, msg.rows);
            break;
          case 'kill':
            logger.debug('TerminalWS', `KILL received termId=${termId.slice(0,8)} hasSession=${!!session}`);
            if (session) {
              historyWriter.markExited(termId);
              destroyPty(termId);
              unregisterProcess(termId);
              session = undefined; // Clear before ws.close so close handler doesn't re-detach
            }
            ws.close(1000, 'Terminal killed');
            break;
        }
      } catch {
        /* ignore malformed messages */
      }
    });
  });
};
