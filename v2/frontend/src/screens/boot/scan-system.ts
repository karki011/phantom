export type ScanStatus = 'success' | 'warning' | 'offline';

export interface ScanResult {
  label: string;
  detail: string;
  status: ScanStatus;
}

interface BootScanData {
  operator: string;
  nodeVersion: string;
  bunVersion: string;
  claudeSessions: number;
  claudeProjects: number;
  mcpChannels: number;
  githubAuth: boolean;
  awsConfigured: boolean;
  gcpConfigured: boolean;
}

const App = () => (window as any).go?.['app']?.App;

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

  return [
    {
      label: 'Operator',
      detail: d.operator ? `${d.operator} ─── confirmed` : '─── offline',
      status: d.operator ? 'success' : 'offline',
    },
    {
      label: 'Runtimes',
      detail: runtimes ? `${runtimes} ─── operational` : '─── offline',
      status: runtimes ? 'success' : 'offline',
    },
    {
      label: 'Claude',
      detail:
        d.claudeSessions > 0
          ? `${d.claudeSessions} sessions · ${d.claudeProjects} projects ─── loaded`
          : '─── offline',
      status: d.claudeSessions > 0 ? 'success' : 'offline',
    },
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
    { label: 'Runtimes', detail: '─── standing by', status: 'warning' },
    { label: 'Claude', detail: '─── standing by', status: 'warning' },
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
