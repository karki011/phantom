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

function formatAgentScans(agents: AgentStatus[]): ScanResult[] {
  const installed = agents.filter(a => a.installed);
  if (installed.length === 0) {
    return [{
      label: 'AI Agents',
      detail: '─── none detected',
      status: 'offline' as ScanStatus,
    }];
  }

  return installed.map(agent => {
    const parts: string[] = [];
    if (agent.version) parts.push(agent.version);
    if (agent.detail) parts.push(agent.detail);
    const info = parts.length > 0 ? `${parts.join(' · ')} ─── online` : '─── online';

    return {
      label: agent.name,
      detail: info,
      status: 'success' as ScanStatus,
    };
  });
}

function formatScans(d: BootScanData): ScanResult[] {
  const runtimes = [
    d.nodeVersion ? `Node ${d.nodeVersion}` : null,
    d.bunVersion ? `Bun ${d.bunVersion}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const cloudBridges = [
    d.awsConfigured ? 'AWS' : null,
    d.gcpConfigured ? 'GCP' : null,
  ].filter(Boolean);

  const sessionCount = d.sessions ?? d.claudeSessions;
  const projectCount = d.projects ?? d.claudeProjects;

  const agentRows = d.agents && d.agents.length > 0
    ? formatAgentScans(d.agents)
    : [{
        label: 'AI Agent',
        detail: sessionCount > 0
          ? `${sessionCount} sessions · ${projectCount} projects ─── loaded`
          : '─── offline',
        status: (sessionCount > 0 ? 'success' : 'offline') as ScanStatus,
      }];

  const gitDetail = d.gitInstalled
    ? `${d.gitVersion ?? 'installed'} ─── operational`
    : '─── NOT FOUND (required)';

  return [
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
    ...agentRows,
    {
      label: 'MCP channels',
      detail:
        d.mcpChannels > 0
          ? `${d.mcpChannels} active ─── online`
          : '─── offline',
      status: d.mcpChannels > 0 ? 'success' : 'offline',
    },
    {
      label: 'GitHub uplink',
      detail: d.githubAuth ? '─── authenticated' : '─── offline',
      status: d.githubAuth ? 'success' : 'offline',
    },
    {
      label: 'Cloud bridges',
      detail:
        cloudBridges.length > 0
          ? `${cloudBridges.join(', ')} ─── standing by`
          : '─── offline',
      status: cloudBridges.length > 0 ? 'warning' : 'offline',
    },
  ];
}

function defaultScans(): ScanResult[] {
  return [
    { label: 'Operator', detail: '─── standing by', status: 'warning' },
    { label: 'Git', detail: '─── scanning', status: 'warning' },
    { label: 'Runtimes', detail: '─── standing by', status: 'warning' },
    { label: 'AI Agents', detail: '─── scanning', status: 'warning' },
    { label: 'MCP channels', detail: '─── standing by', status: 'warning' },
    { label: 'GitHub uplink', detail: '─── standing by', status: 'warning' },
    { label: 'Cloud bridges', detail: '─── standing by', status: 'warning' },
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
