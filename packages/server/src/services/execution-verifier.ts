/**
 * Execution Verifier Service — runs verification commands after file edits
 *
 * Auto-detects project type from the project root (package.json, go.mod, etc.)
 * and runs appropriate verification commands (typecheck, test). Results feed
 * into the knowledge DB as structured pass/fail signals.
 *
 * NON-BLOCKING: all verification runs in the background via debounced queue.
 *
 * @author Subash Karki
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VerificationResult {
  command: string;
  passed: boolean;
  exitCode: number;
  output: string; // last 500 chars
  durationMs: number;
}

export interface ProjectVerification {
  projectId: string;
  results: VerificationResult[];
  allPassed: boolean;
  timestamp: string;
}

interface CommandDef {
  name: string;
  cmd: string;
  args: string[];
  timeout: number;
}

interface VerifierDef {
  detect: string;
  commands: CommandDef[];
}

// ---------------------------------------------------------------------------
// Verifier Definitions
// ---------------------------------------------------------------------------

const VERIFIERS: Record<string, VerifierDef> = {
  typescript: {
    detect: 'package.json',
    commands: [
      { name: 'typecheck', cmd: 'npx', args: ['tsc', '--noEmit'], timeout: 30_000 },
      { name: 'test', cmd: 'bun', args: ['test', '--bail'], timeout: 60_000 },
    ],
  },
  go: {
    detect: 'go.mod',
    commands: [
      { name: 'vet', cmd: 'go', args: ['vet', './...'], timeout: 30_000 },
      { name: 'test', cmd: 'go', args: ['test', './...'], timeout: 60_000 },
    ],
  },
  rust: {
    detect: 'Cargo.toml',
    commands: [
      { name: 'check', cmd: 'cargo', args: ['check'], timeout: 60_000 },
      { name: 'test', cmd: 'cargo', args: ['test'], timeout: 60_000 },
    ],
  },
  python: {
    detect: 'pyproject.toml',
    commands: [
      { name: 'compile', cmd: 'python', args: ['-m', 'py_compile'], timeout: 30_000 },
      { name: 'test', cmd: 'pytest', args: ['--tb=short'], timeout: 60_000 },
    ],
  },
};

// ---------------------------------------------------------------------------
// Project Type Detection
// ---------------------------------------------------------------------------

const detectProjectType = (projectRoot: string): string | null => {
  for (const [type, def] of Object.entries(VERIFIERS)) {
    if (existsSync(`${projectRoot}/${def.detect}`)) {
      return type;
    }
  }
  return null;
};

/**
 * Find the project root by walking up from a file path, looking for
 * known project markers (package.json, go.mod, etc.).
 */
export const findProjectRoot = (filePath: string): string | null => {
  const markers = Object.values(VERIFIERS).map((v) => v.detect);
  let dir = dirname(filePath);
  const root = '/';

  while (dir !== root) {
    for (const marker of markers) {
      if (existsSync(`${dir}/${marker}`)) {
        return dir;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
};

// ---------------------------------------------------------------------------
// Command Runner
// ---------------------------------------------------------------------------

const runCommand = (
  cmd: string,
  args: string[],
  cwd: string,
  timeout: number,
): Promise<{ passed: boolean; exitCode: number; output: string; durationMs: number }> => {
  return new Promise((resolve) => {
    const start = Date.now();
    let output = '';
    let killed = false;

    const proc = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CI: '1', NO_COLOR: '1' },
    });

    const collect = (data: Buffer) => {
      output += data.toString();
      // Keep only last 1000 chars during collection, trim to 500 at the end
      if (output.length > 1000) {
        output = output.slice(-1000);
      }
    };

    proc.stdout?.on('data', collect);
    proc.stderr?.on('data', collect);

    const timer = setTimeout(() => {
      killed = true;
      proc.kill('SIGTERM');
      setTimeout(() => proc.kill('SIGKILL'), 2000);
    }, timeout);

    proc.on('close', (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - start;
      const trimmedOutput = output.slice(-500);

      resolve({
        passed: !killed && code === 0,
        exitCode: killed ? -1 : (code ?? 1),
        output: killed ? `[TIMEOUT after ${timeout}ms]\n${trimmedOutput}` : trimmedOutput,
        durationMs,
      });
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        passed: false,
        exitCode: -1,
        output: `[SPAWN ERROR] ${err.message}`,
        durationMs: Date.now() - start,
      });
    });
  });
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run verification commands for the detected project type at `projectRoot`.
 * Bails on first failure to avoid wasting time.
 */
export const verify = async (projectRoot: string): Promise<ProjectVerification> => {
  const projectType = detectProjectType(projectRoot);

  if (!projectType) {
    logger.debug('ExecutionVerifier', `No known project type detected at ${projectRoot}`);
    return {
      projectId: basename(projectRoot),
      results: [],
      allPassed: true,
      timestamp: new Date().toISOString(),
    };
  }

  const verifier = VERIFIERS[projectType];
  logger.info('ExecutionVerifier', `Running ${projectType} verification in ${projectRoot}`);

  const results: VerificationResult[] = [];

  for (const cmdDef of verifier.commands) {
    const result = await runCommand(cmdDef.cmd, cmdDef.args, projectRoot, cmdDef.timeout);
    results.push({ command: cmdDef.name, ...result });

    if (!result.passed) {
      logger.info('ExecutionVerifier', `[${cmdDef.name}] FAILED (exit ${result.exitCode}) — bailing`);
      break; // Bail on first failure
    }

    logger.info('ExecutionVerifier', `[${cmdDef.name}] PASSED in ${result.durationMs}ms`);
  }

  return {
    projectId: basename(projectRoot),
    results,
    allPassed: results.every((r) => r.passed),
    timestamp: new Date().toISOString(),
  };
};

// ---------------------------------------------------------------------------
// Debounced Verification Queue
// ---------------------------------------------------------------------------

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingProjectRoot: string | null = null;
let latestResult: ProjectVerification | null = null;
let isRunning = false;

const DEBOUNCE_MS = 5_000;

/**
 * Queue a verification run. Debounces — waits 5s after the last queue call
 * before actually running. Returns immediately (non-blocking).
 */
export const queueVerification = (projectRoot: string): void => {
  pendingProjectRoot = projectRoot;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(async () => {
    if (isRunning || !pendingProjectRoot) return;

    isRunning = true;
    const root = pendingProjectRoot;
    pendingProjectRoot = null;

    try {
      latestResult = await verify(root);

      // Feed result to knowledge DB
      const signal = latestResult.allPassed ? 'success' : 'failure';
      const failedCmd = latestResult.results.find((r) => !r.passed);
      const reason = failedCmd?.command ?? undefined;

      const port = process.env.PORT || '3849';
      await fetch(`http://localhost:${port}/api/orchestrator/record-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signal,
          reason,
          source: 'execution-verifier',
          verification: {
            projectId: latestResult.projectId,
            allPassed: latestResult.allPassed,
            results: latestResult.results.map((r) => ({
              command: r.command,
              passed: r.passed,
              exitCode: r.exitCode,
              durationMs: r.durationMs,
            })),
          },
          timestamp: latestResult.timestamp,
        }),
      }).catch(() => {});

      logger.info(
        'ExecutionVerifier',
        `Verification ${signal}: ${latestResult.results.map((r) => `${r.command}=${r.passed ? 'PASS' : 'FAIL'}`).join(', ')}`,
      );
    } catch (err) {
      logger.error('ExecutionVerifier', 'Verification failed:', err);
    } finally {
      isRunning = false;
    }
  }, DEBOUNCE_MS);
};

/**
 * Get the latest verification result (or null if none has run yet).
 */
export const getLatestResult = (): ProjectVerification | null => latestResult;

/**
 * Check whether a verification is currently running.
 */
export const isVerificationRunning = (): boolean => isRunning;
