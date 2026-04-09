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
    // Destroy the PTY process when the WebSocket closes to prevent ghost sessions
    if (session) destroyPty(termId);
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
                session = await createPty(termId, msg.cwd || undefined, msg.cols, msg.rows, onData);
                // Auto-run initial command if provided (e.g. "claude --dangerously-skip-permissions")
                if (msg.initialCommand && session) {
                  setTimeout(() => {
                    writePty(termId, msg.initialCommand + '\n');
                  }, 300); // Small delay to let shell initialize
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
