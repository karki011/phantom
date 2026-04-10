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
  getPtySession,
} from '../terminal-manager.js';
import { registerProcess, unregisterProcess } from '../process-registry.js';

export const setupTerminalWs = (
  server: HttpServer | HttpsServer,
): void => {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const match = url.pathname.match(/^\/ws\/terminal\/(.+)$/);
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

  ws.on('close', () => {
    session?.listeners.delete(onData);
    // Keep PTY alive — user may switch worktrees and come back.
    // Only unregister the WebSocket listener; the PTY continues running.
    // If no client reconnects within 5 minutes, clean up the orphan.
    const orphanTermId = termId;
    setTimeout(() => {
      const s = getPtySession(orphanTermId);
      if (s && s.listeners.size === 0) {
        unregisterProcess(orphanTermId);
        destroyPty(orphanTermId);
      }
    }, 5 * 60 * 1000);
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
        switch (msg.type) {
          case 'init': {
            if (!session) {
              try {
                // Pass onData as initialListener — it's attached to the session
                // BEFORE the daemon subscription, preventing lost output.
                session = await createPty(termId, msg.cwd || undefined, msg.cols, msg.rows, onData, msg.env);
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
        }
      } catch {
        /* ignore malformed messages */
      }
    });
  });
};
