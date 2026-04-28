export type ScanStatus = 'success' | 'warning' | 'offline';

export interface ScanResult {
  label: string;
  detail: string;
  status: ScanStatus;
}

interface AgentStatus {
  name: string;
  installed: boolean;
  version?: string;
  sessionCount: number;
  detail?: string;
}

interface BootScanData {
  operator: string;
  nodeVersion: string;
  bunVersion: string;
  gitInstalled: boolean;
  gitVersion?: string;
  /** @deprecated Use agents[] instead — kept for backward compat with older backends */
  claudeSessions: number;
  /** @deprecated Use agents[] instead — kept for backward compat with older backends */
  claudeProjects: number;
  /** Generic session/project counts (preferred over claude* fields) */
  sessions?: number;
  projects?: number;
  mcpChannels: number;
  githubAuth: boolean;
  awsConfigured: boolean;
  gcpConfigured: boolean;
  agents?: AgentStatus[];
}

const App = () => (window as any).go?.['app']?.App;

/** Short display names for known agents — keeps the summary row compact. */
const AGENT_SHORT_NAMES: Record<string, string> = {
  'Claude Code': 'Claude Code',
  'Codex CLI': 'Codex',
  'Gemini CLI': 'Gemini',
  'Amazon Q': 'Q',
  Ollama: 'Ollama',
  Cursor: 'Cursor',
};

function formatAgentScans(agents: AgentStatus[]): ScanResult {
  const installed = agents.filter(a => a.installed);

  if (installed.length === 0) {
    return {
      label: 'AI Agents',
      detail: '─── none detected',
      status: 'offline' as ScanStatus,
    };
  }

  if (installed.length === 1) {
    const agent = installed[0];
    const parts: string[] = [agent.name];
    if (agent.version) parts.push(agent.version);
    return {
      label: 'AI Agents',
      detail: `${parts.join(' ')} ─── online`,
      status: 'success' as ScanStatus,
    };
  }

  const names = installed
    .map(a => AGENT_SHORT_NAMES[a.name] ?? a.name)
    .join(', ');

  return {
    label: 'AI Agents',
    detail: `${installed.length} detected (${names}) ─── online`,
    status: 'success' as ScanStatus,
  };
}

function formatScans(d: BootScanData): ScanResult[] {
  const runtimes = [
    d.nodeVersion ? `Node ${d.nodeVersion}` : null,
    d.bunVersion ? `Bun ${d.bunVersion}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const sessionCount = d.sessions ?? d.claudeSessions;
  const projectCount = d.projects ?? d.claudeProjects;

  const agentRow = d.agents && d.agents.length > 0
    ? formatAgentScans(d.agents)
    : {
        label: 'AI Agents',
        detail: sessionCount > 0
          ? `${sessionCount} sessions · ${projectCount} projects ─── loaded`
          : '─── offline',
        status: (sessionCount > 0 ? 'success' : 'offline') as ScanStatus,
      };

  const gitDetail = d.gitInstalled
    ? `${d.gitVersion ?? 'installed'} ─── operational`
    : '─── NOT FOUND (required)';

  const rows: ScanResult[] = [
    {
      label: 'Operator',
      detail: d.operator ? `${d.operator} ─── confirmed` : '─── offline',
      status: d.operator ? 'success' : 'offline',
    },
    {
      label: 'Git',
      detail: gitDetail,
      status: d.gitInstalled ? 'success' : 'warning',
    },
    {
      label: 'Runtimes',
      detail: runtimes ? `${runtimes} ─── operational` : '─── offline',
      status: runtimes ? 'success' : 'offline',
    },
    agentRow,
  ];

  // Only show optional rows when they have something useful to report.
  if (d.githubAuth) {
    rows.push({
      label: 'GitHub uplink',
      detail: '─── authenticated',
      status: 'success',
    });
  }

  if (d.mcpChannels > 0) {
    rows.push({
      label: 'MCP channels',
      detail: `${d.mcpChannels} active ─── online`,
      status: 'success',
    });
  }

  const cloudBridges = [
    d.awsConfigured ? 'AWS' : null,
    d.gcpConfigured ? 'GCP' : null,
  ].filter(Boolean);

  if (cloudBridges.length > 0) {
    rows.push({
      label: 'Cloud bridges',
      detail: `${cloudBridges.join(', ')} ─── standing by`,
      status: 'warning',
    });
  }

  return rows;
}

function defaultScans(): ScanResult[] {
  return [
    { label: 'Operator', detail: '─── standing by', status: 'warning' },
    { label: 'Git', detail: '─── scanning', status: 'warning' },
    { label: 'Runtimes', detail: '─── standing by', status: 'warning' },
    { label: 'AI Agents', detail: '─── scanning', status: 'warning' },
  ];
}

export async function runSystemScans(): Promise<ScanResult[]> {
  try {
    const app = App();
    if (!app?.BootScan) return defaultScans();
    const data: BootScanData = await app.BootScan();
    return data ? formatScans(data) : defaultScans();
  } catch {
    return defaultScans();
  }
}
