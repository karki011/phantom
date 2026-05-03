// Author: Subash Karki

/**
 * Pure functions for extracting human-readable summaries from tool_use JSON
 * and grouping consecutive same-name tool calls.
 */

export interface ToolSummary {
  /** Human-readable one-line description of what the tool is doing. */
  label: string;
  /** Lucide icon name to render instead of the generic Wrench. */
  iconName: string;
  /** Optional badge text (e.g. "bg" for background agents). */
  badge?: string;
}

/**
 * Given a tool name and its raw JSON input string, extract a short summary.
 * Falls back gracefully — never throws.
 */
export const extractToolSummary = (name: string, input: string): ToolSummary => {
  try {
    const parsed = JSON.parse(input);
    switch (name) {
      case 'Bash': {
        const cmd = parsed.command || parsed.cmd || '';
        const bg = parsed.run_in_background ? 'bg' : undefined;
        return { label: truncate(cmd, 60), iconName: 'Terminal', badge: bg };
      }
      case 'Agent': {
        const desc = parsed.description || parsed.prompt || 'agent task';
        const model = parsed.model || 'sonnet';
        const bg = parsed.run_in_background ? 'bg' : undefined;
        return { label: `${truncate(desc, 45)} (${model})`, iconName: 'Bot', badge: bg };
      }
      case 'Edit': {
        return { label: basenameOf(parsed.file_path || ''), iconName: 'Pencil' };
      }
      case 'MultiEdit': {
        const editCount = Array.isArray(parsed.edits) ? parsed.edits.length : '?';
        return { label: `${basenameOf(parsed.file_path || '')} (${editCount} edits)`, iconName: 'Pencil' };
      }
      case 'Write': {
        return { label: basenameOf(parsed.file_path || ''), iconName: 'FilePlus' };
      }
      case 'Read': {
        return { label: basenameOf(parsed.file_path || ''), iconName: 'Eye' };
      }
      case 'Grep': {
        return { label: `"${truncate(parsed.pattern || '', 40)}"`, iconName: 'Search' };
      }
      case 'Glob': {
        return { label: parsed.pattern || '', iconName: 'FolderSearch' };
      }
      case 'WebSearch': {
        return { label: truncate(parsed.query || '', 50), iconName: 'Globe' };
      }
      case 'WebFetch': {
        return { label: truncate(parsed.url || '', 50), iconName: 'Globe' };
      }
      case 'TodoRead':
      case 'TodoWrite': {
        return { label: name, iconName: 'ListTodo' };
      }
      case 'NotebookEdit': {
        return { label: basenameOf(parsed.notebook_path || ''), iconName: 'FileCode' };
      }
      case 'LS': {
        return { label: parsed.path || '.', iconName: 'FolderSearch' };
      }
      case 'Task': {
        const desc = parsed.description || parsed.prompt || 'sub-task';
        return { label: truncate(desc, 50), iconName: 'Bot' };
      }
      case 'ToolSearch': {
        return { label: truncate(parsed.query || '', 50), iconName: 'Search' };
      }
      case 'Skill': {
        return { label: parsed.skill || parsed.name || 'skill', iconName: 'Zap' };
      }
      case 'Monitor': {
        return { label: truncate(parsed.command || parsed.url || '', 50), iconName: 'Eye' };
      }
      default: {
        // MCP tools get wrench icon but try to show a useful label
        if (name.startsWith('mcp__')) {
          const shortName = name.split('__').pop() || name;
          return { label: shortName, iconName: 'Wrench' };
        }
        // For unknown tools, try to show something useful from the input
        if (typeof parsed === 'object' && parsed !== null) {
          const first = Object.values(parsed)[0];
          if (typeof first === 'string') {
            return { label: truncate(first, 60), iconName: 'Wrench' };
          }
        }
        return { label: truncate(input, 60), iconName: 'Wrench' };
      }
    }
  } catch {
    return { label: truncate(input, 60), iconName: 'Wrench' };
  }
};

// ── Grouping ──────────────────────────────────────────────────────────────

export interface ToolUseEntry {
  name: string;
  input: string;
  status: 'running' | 'done' | 'error';
  result?: string;
  resultIsError?: boolean;
}

export interface ToolGroup {
  type: 'single' | 'group';
  /** Tool name (same for all items in a group). */
  name: string;
  /** Individual tool use entries. */
  items: ToolUseEntry[];
  /** First few summary labels for the group header preview. */
  previewLabels: string[];
}

/**
 * Groups consecutive same-name tool calls when there are 5+ in a row.
 * Smaller runs are left as individual entries.
 */
export const groupToolCalls = (toolUses: ToolUseEntry[]): ToolGroup[] => {
  if (toolUses.length === 0) return [];

  const groups: ToolGroup[] = [];
  let i = 0;

  while (i < toolUses.length) {
    const current = toolUses[i];
    let runEnd = i + 1;

    // Count consecutive entries with the same tool name.
    while (runEnd < toolUses.length && toolUses[runEnd].name === current.name) {
      runEnd++;
    }

    const runLength = runEnd - i;

    if (runLength >= 5) {
      // Group these into a collapsed group.
      const items = toolUses.slice(i, runEnd);
      const previewLabels = items
        .slice(0, 3)
        .map((t) => extractToolSummary(t.name, t.input).label);
      groups.push({
        type: 'group',
        name: current.name,
        items,
        previewLabels,
      });
    } else {
      // Emit individually.
      for (let j = i; j < runEnd; j++) {
        groups.push({
          type: 'single',
          name: toolUses[j].name,
          items: [toolUses[j]],
          previewLabels: [],
        });
      }
    }

    i = runEnd;
  }

  return groups;
};

// ── Helpers ───────────────────────────────────────────────────────────────

const truncate = (s: string, max: number): string =>
  s.length > max ? s.slice(0, max) + '…' : s;

const basenameOf = (p: string): string => p.split('/').pop() || p;
