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

const handleConnection = async (ws: WebSocket, termId: string): Promise<void> => {
  let session = getPtySession(termId);

  const setupSession = (s: typeof session) => {
    if (!s) return;
    const onData = (data: string) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'output', data }));
      }
    };
    s.listeners.add(onData);
    ws.on('close', () => { s.listeners.delete(onData); });
  };

  // If session already exists (reconnect), wire it up immediately
  if (session) {
    setupSession(session);
  }

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      switch (msg.type) {
        case 'init': {
          // Spawn PTY with cwd from the frontend
          if (!session) {
            try {
              session = await createPty(termId, msg.cwd || undefined);
              setupSession(session);
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
          // If no init was sent, create PTY on first input (fallback)
          if (!session) {
            try {
              session = await createPty(termId);
              setupSession(session);
            } catch { /* already handled */ }
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
};
