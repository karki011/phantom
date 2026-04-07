#!/usr/bin/env node
/**
 * PhantomOS Terminal Daemon
 * Persistent process that manages PTY sessions via a Unix domain socket.
 * Sessions survive app restarts — the daemon runs independently.
 *
 * Protocol: NDJSON over Unix socket at ~/.phantom-os/terminal-host.sock
 *
 * Usage:
 *   node packages/terminal/src/daemon/terminal-daemon.ts
 *   npx tsx packages/terminal/src/daemon/terminal-daemon.ts
 *
 * @author Subash Karki
 */
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { Session } from './session.js';
import {
  encode,
  decode,
  type DaemonRequest,
  type DaemonResponse,
  type OutputMessage,
  type ExitMessage,
} from './protocol.js';

// ─── Configuration ─────────────────────────────────────────────────────

const PHANTOM_DIR = path.join(homedir(), '.phantom-os');
const SOCKET_PATH = path.join(PHANTOM_DIR, 'terminal-host.sock');
const PID_FILE = path.join(PHANTOM_DIR, 'terminal-host.pid');

// ─── State ─────────────────────────────────────────────────────────────

const sessions = new Map<string, Session>();

/**
 * Each connected client may be "subscribed" to one or more sessions.
 * When a session produces output, we push it to all subscribed sockets.
 */
const clientSubscriptions = new Map<net.Socket, Set<string>>();

// ─── Helpers ───────────────────────────────────────────────────────────

const ensureDir = (dir: string): void => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const sendMessage = (socket: net.Socket, msg: DaemonResponse): void => {
  try {
    if (!socket.destroyed) {
      socket.write(encode(msg) + '\n');
    }
  } catch {
    // Socket may have been closed — ignore
  }
};

const broadcastToSubscribers = (sessionId: string, msg: DaemonResponse): void => {
  for (const [socket, subs] of clientSubscriptions) {
    if (subs.has(sessionId)) {
      sendMessage(socket, msg);
    }
  }
};

// ─── Session Management ────────────────────────────────────────────────

const wireSessionEvents = (session: Session): void => {
  session.onOutput = (id: string, data: string) => {
    const msg: OutputMessage = { type: 'output', id, data };
    broadcastToSubscribers(id, msg);
  };

  session.onExit = (id: string, code: number) => {
    const msg: ExitMessage = { type: 'exit', id, code };
    broadcastToSubscribers(id, msg);
    sessions.delete(id);
    // Unsubscribe all clients from this session
    for (const [, subs] of clientSubscriptions) {
      subs.delete(id);
    }
  };
};

// ─── Request Handlers ──────────────────────────────────────────────────

const handleRequest = (socket: net.Socket, req: DaemonRequest): void => {
  switch (req.type) {
    case 'createOrAttach': {
      let session = sessions.get(req.id);
      const isNew = !session;

      if (!session) {
        session = new Session(req.id, req.cols, req.rows, req.cwd);
        sessions.set(req.id, session);
        wireSessionEvents(session);
      }

      // Subscribe this client to the session
      let subs = clientSubscriptions.get(socket);
      if (!subs) {
        subs = new Set();
        clientSubscriptions.set(socket, subs);
      }
      subs.add(req.id);

      sendMessage(socket, { type: 'ok', seq: req.seq });

      // If attaching to existing session, replay scrollback
      if (!isNew) {
        const scrollback = session.getScrollback();
        if (scrollback.length > 0) {
          sendMessage(socket, { type: 'output', id: req.id, data: scrollback });
        }
      }
      break;
    }

    case 'input': {
      const session = sessions.get(req.id);
      if (session) {
        session.write(req.data);
      }
      // No response for input — fire and forget for performance
      break;
    }

    case 'resize': {
      const session = sessions.get(req.id);
      if (session) {
        session.resize(req.cols, req.rows);
      }
      // No response for resize — fire and forget
      break;
    }

    case 'detach': {
      const subs = clientSubscriptions.get(socket);
      if (subs) {
        subs.delete(req.id);
      }
      sendMessage(socket, { type: 'ok', seq: req.seq });
      break;
    }

    case 'kill': {
      const session = sessions.get(req.id);
      if (session) {
        session.kill();
        sessions.delete(req.id);
        // Unsubscribe all clients
        for (const [, subs] of clientSubscriptions) {
          subs.delete(req.id);
        }
        sendMessage(socket, { type: 'ok', seq: req.seq });
      } else {
        sendMessage(socket, {
          type: 'error',
          seq: req.seq,
          message: `Session ${req.id} not found`,
        });
      }
      break;
    }

    case 'list': {
      const sessionList = Array.from(sessions.values()).map((s) => s.toInfo());
      sendMessage(socket, { type: 'list', seq: req.seq, sessions: sessionList });
      break;
    }

    case 'snapshot': {
      const session = sessions.get(req.id);
      if (session) {
        sendMessage(socket, {
          type: 'snapshot',
          seq: req.seq,
          id: req.id,
          scrollback: session.getScrollback(),
        });
      } else {
        sendMessage(socket, {
          type: 'error',
          seq: req.seq,
          message: `Session ${req.id} not found`,
        });
      }
      break;
    }

    case 'ping': {
      sendMessage(socket, { type: 'pong', seq: req.seq });
      break;
    }

    default: {
      // Unknown message type — ignore
      break;
    }
  }
};

// ─── Connection Handler ────────────────────────────────────────────────

const handleConnection = (socket: net.Socket): void => {
  let buffer = '';
  clientSubscriptions.set(socket, new Set());

  socket.on('data', (chunk) => {
    buffer += chunk.toString();

    // Process complete NDJSON lines
    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);

      if (line.length === 0) continue;

      try {
        const msg = decode(line) as DaemonRequest;
        handleRequest(socket, msg);
      } catch (err) {
        console.error('[TerminalDaemon] Failed to parse message:', line, err);
      }
    }
  });

  socket.on('close', () => {
    clientSubscriptions.delete(socket);
  });

  socket.on('error', (err) => {
    console.error('[TerminalDaemon] Socket error:', err.message);
    clientSubscriptions.delete(socket);
  });
};

// ─── Server Lifecycle ──────────────────────────────────────────────────

const cleanupSocket = (): void => {
  // Remove stale socket file if it exists
  if (fs.existsSync(SOCKET_PATH)) {
    try {
      fs.unlinkSync(SOCKET_PATH);
    } catch {
      // Ignore — may have been cleaned up already
    }
  }
};

const writePidFile = (): void => {
  fs.writeFileSync(PID_FILE, String(process.pid), 'utf-8');
};

const removePidFile = (): void => {
  try {
    if (fs.existsSync(PID_FILE)) {
      const pid = fs.readFileSync(PID_FILE, 'utf-8').trim();
      // Only remove if it's our PID
      if (pid === String(process.pid)) {
        fs.unlinkSync(PID_FILE);
      }
    }
  } catch {
    // Ignore
  }
};

const shutdown = (): void => {
  console.log('[TerminalDaemon] Shutting down...');

  // Kill all sessions
  for (const [, session] of sessions) {
    session.kill();
  }
  sessions.clear();
  clientSubscriptions.clear();

  cleanupSocket();
  removePidFile();

  process.exit(0);
};

const startDaemon = (): void => {
  ensureDir(PHANTOM_DIR);

  // Check if another daemon is already running
  if (fs.existsSync(PID_FILE)) {
    const existingPid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
    try {
      // Signal 0 checks if process exists without killing it
      process.kill(existingPid, 0);
      console.error(
        `[TerminalDaemon] Another daemon is already running (PID ${existingPid}). Exiting.`,
      );
      process.exit(1);
    } catch {
      // Process doesn't exist — stale PID file, clean up
      console.log('[TerminalDaemon] Cleaning up stale PID file');
    }
  }

  cleanupSocket();

  const server = net.createServer(handleConnection);

  server.on('error', (err) => {
    console.error('[TerminalDaemon] Server error:', err.message);
    shutdown();
  });

  server.listen(SOCKET_PATH, () => {
    // Make socket accessible
    try {
      fs.chmodSync(SOCKET_PATH, 0o600);
    } catch {
      // Ignore chmod errors
    }

    writePidFile();

    console.log('');
    console.log('================================================');
    console.log(' PhantomOS Terminal Daemon');
    console.log(`   socket: ${SOCKET_PATH}`);
    console.log(`   pid:    ${process.pid}`);
    console.log('================================================');
    console.log('');
  });

  // Graceful shutdown
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

// ─── Entry Point ───────────────────────────────────────────────────────

startDaemon();
