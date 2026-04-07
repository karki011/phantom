/**
 * PhantomOS Terminal WebSocket Handler
 * Bridges xterm.js in the renderer to node-pty in the server.
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

const handleConnection = (ws: WebSocket, termId: string): void => {
  let session = getPtySession(termId);
  if (!session) {
    session = createPty(termId);
  }

  const onData = (data: string) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'output', data }));
    }
  };
  session.listeners.add(onData);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      switch (msg.type) {
        case 'input':
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

  ws.on('close', () => {
    session?.listeners.delete(onData);
  });
};
