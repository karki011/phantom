/**
 * PhantomOS — Turn Classifier
 * Deterministic 13-category classifier for Claude session activity.
 * @author Subash Karki
 */
import type { ActivityCategory } from '@phantom-os/shared';

type ToolBreakdown = Record<string, number>;

interface ClassifyInput {
  toolBreakdown: ToolBreakdown | string | null | undefined;
  firstPrompt: string | null | undefined;
}

function parseToolBreakdown(raw: ToolBreakdown | string | null | undefined): ToolBreakdown {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as ToolBreakdown;
    } catch {
      return {};
    }
  }
  return raw;
}

/**
 * Classifies a session into one of 13 activity categories using tool patterns
 * and prompt keyword matching as a fallback.
 */
export function classifySession({ toolBreakdown, firstPrompt }: ClassifyInput): ActivityCategory {
  const tools = parseToolBreakdown(toolBreakdown);
  const toolEntries = Object.entries(tools);
  const totalToolCalls = toolEntries.reduce((sum, [, v]) => sum + v, 0);

  // --- Tool pattern matching (highest priority) ---
  const toolNames = toolEntries.map(([k]) => k.toLowerCase());

  const hasVitest = toolNames.some(t => t.includes('vitest') || t.includes('jest'));
  const hasGit = toolNames.some(t => t.includes('git') || t.includes('gh'));
  const hasBuildTools = toolNames.some(t => t.includes('npm') || t.includes('bun') || t.includes('tsc') || t.includes('webpack') || t.includes('vite'));
  const hasDelegation = toolNames.some(t => t === 'task' || t.includes('task'));

  if (hasVitest) return 'testing';
  if (hasGit) return 'git';
  if (hasBuildTools) return 'build_deploy';
  if (hasDelegation) return 'delegation';

  // --- Ratio-based tool classification ---
  if (totalToolCalls > 0) {
    const editCount = (tools['Edit'] ?? 0) + (tools['MultiEdit'] ?? 0) + (tools['Write'] ?? 0);
    const readCount = tools['Read'] ?? 0;
    const grepCount = (tools['Grep'] ?? 0) + (tools['Glob'] ?? 0);

    const editReadRatio = (editCount + readCount) / totalToolCalls;
    const grepOnlyRatio = grepCount / totalToolCalls;

    if (editReadRatio > 0.5 && editCount > 0) return 'coding';
    if (grepOnlyRatio > 0.5 && editCount === 0) return 'exploration';
  }

  // --- Prompt keyword fallback ---
  const prompt = (firstPrompt ?? '').toLowerCase();

  if (/\b(fix|bug|error|broken|crash|fail|issue|debug)\b/.test(prompt)) return 'debugging';
  if (/\b(test|spec|coverage|unittest)\b/.test(prompt)) return 'testing';
  if (/\b(refactor|clean|rename|reorganize|restructure)\b/.test(prompt)) return 'refactoring';
  if (/\b(add|implement|build|create|new feature|feature)\b/.test(prompt)) return 'feature';
  if (/\b(plan|planning|roadmap|design|architect)\b/.test(prompt)) return 'planning';
  if (/\b(brainstorm|idea|explore ideas|think through)\b/.test(prompt)) return 'brainstorming';
  if (/\b(explain|what is|how does|why|understand|describe)\b/.test(prompt)) return 'conversation';
  if (/\b(find|search|look for|where is|locate|explore)\b/.test(prompt)) return 'exploration';
  if (/\b(deploy|release|publish|ci|cd|pipeline)\b/.test(prompt)) return 'build_deploy';
  if (/\b(commit|push|pr|pull request|merge|branch)\b/.test(prompt)) return 'git';

  return 'general';
}

/**
 * Estimates whether the session used a "one-shot" editing pattern (low retry).
 * Returns null if no edit tools were used (not applicable).
 * Returns true if bash-to-edit ratio is below 1.5 (minimal retry churn).
 * Returns false otherwise (high retry / bash-heavy pattern).
 */
export function estimateOneShotRate(
  toolBreakdown: ToolBreakdown | string | null | undefined,
): boolean | null {
  const tools = parseToolBreakdown(toolBreakdown);

  const editCount =
    (tools['Edit'] ?? 0) +
    (tools['MultiEdit'] ?? 0) +
    (tools['Write'] ?? 0);

  if (editCount === 0) return null;

  const bashCount = tools['Bash'] ?? 0;
  const ratio = bashCount / editCount;

  return ratio < 1.5;
}
