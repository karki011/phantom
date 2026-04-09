/**
 * PhantomOS Logger
 * Simple structured logger. Respects LOG_LEVEL env var.
 * @author Subash Karki
 */
const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 } as const;
type Level = keyof typeof LEVELS;

const currentLevel = (): number => {
  const env = (process.env.LOG_LEVEL ?? 'info') as Level;
  return LEVELS[env] ?? LEVELS.info;
};

const prefix = (tag: string) => `[${tag}]`;

export const logger = {
  debug: (tag: string, ...args: unknown[]) => {
    if (currentLevel() >= LEVELS.debug) console.log(prefix(tag), ...args);
  },
  info: (tag: string, ...args: unknown[]) => {
    if (currentLevel() >= LEVELS.info) console.log(prefix(tag), ...args);
  },
  warn: (tag: string, ...args: unknown[]) => {
    if (currentLevel() >= LEVELS.warn) console.warn(prefix(tag), ...args);
  },
  error: (tag: string, ...args: unknown[]) => {
    if (currentLevel() >= LEVELS.error) console.error(prefix(tag), ...args);
  },
  /** Banner-style multi-line output (always shown at info level) */
  banner: (...lines: string[]) => {
    if (currentLevel() >= LEVELS.info) {
      for (const line of lines) console.log(line);
    }
  },
};
