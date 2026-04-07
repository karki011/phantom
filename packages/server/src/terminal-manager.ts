/**
 * PhantomOS Terminal Manager
 * Spawns and manages PTY processes via node-pty.
 * @author Subash Karki
 */
import * as pty from 'node-pty';
import { homedir } from 'node:os';

interface PtySession {
  id: string;
  pty: pty.IPty;
  listeners: Set<(data: string) => void>;
}

const sessions = new Map<string, PtySession>();

export const createPty = (id: string, cwd?: string): PtySession => {
  const shell = process.env.SHELL || '/bin/zsh';
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: cwd || homedir(),
    env: { ...process.env, TERM: 'xterm-256color' },
  });

  const session: PtySession = {
    id,
    pty: ptyProcess,
    listeners: new Set(),
  };

  ptyProcess.onData((data) => {
    for (const listener of session.listeners) {
      listener(data);
    }
  });

  sessions.set(id, session);
  return session;
};

export const writePty = (id: string, data: string): void => {
  sessions.get(id)?.pty.write(data);
};

export const resizePty = (
  id: string,
  cols: number,
  rows: number,
): void => {
  sessions.get(id)?.pty.resize(cols, rows);
};

export const destroyPty = (id: string): void => {
  const session = sessions.get(id);
  if (session) {
    session.pty.kill();
    session.listeners.clear();
    sessions.delete(id);
  }
};

export const getPtySession = (
  id: string,
): PtySession | undefined => sessions.get(id);

export const destroyAllPtys = (): void => {
  for (const [id] of sessions) destroyPty(id);
};
