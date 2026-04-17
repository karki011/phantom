/**
 * ServerLogModal — Tabbed log viewer: Live Logs + Crash Reports
 * @author Subash Karki
 */
import { useEffect, useState } from 'react';
import { ActionIcon, Badge, Group, Modal, ScrollArea, SegmentedControl, Stack, Text, Tooltip } from '@mantine/core';
import { Copy, Trash2 } from 'lucide-react';

interface ServerLogModalProps {
  opened: boolean;
  onClose: () => void;
}

type LogLevel = 'error' | 'warning' | 'info';
type Tab = 'logs' | 'crashes';

interface CrashReport {
  timestamp: string;
  exitCode: number;
  electronVersion: string;
  arch: string;
  osVersion: string;
  appVersion: string;
  stderr: string[];
  nativeModules: Record<string, { found: boolean; nodeFiles: string[] }>;
}

const classifyLine = (line: string): LogLevel => {
  const lower = line.toLowerCase();
  if (lower.includes('fatal') || lower.includes('error') || lower.includes('[stderr]')) return 'error';
  if (lower.includes('warn')) return 'warning';
  return 'info';
};

const levelColor: Record<LogLevel, string> = {
  error: 'var(--phantom-status-error, #ef4444)',
  warning: 'var(--phantom-accent-gold, #f59e0b)',
  info: 'var(--phantom-text-secondary, #8b9ab0)',
};

const LogLine = ({ line }: { line: string }) => {
  const level = classifyLine(line);
  return (
    <Text
      size="xs"
      style={{
        fontFamily: 'monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        color: levelColor[level],
        lineHeight: 1.6,
      }}
    >
      {line}
    </Text>
  );
};

const CrashReportCard = ({ report }: { report: CrashReport }) => {
  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
  };

  return (
    <Stack
      gap={8}
      style={{
        padding: 12,
        border: '1px solid var(--phantom-border-subtle, #2a2a3e)',
        borderRadius: 6,
        marginBottom: 8,
      }}
    >
      <Group justify="space-between">
        <Group gap={8}>
          <Badge color="red" size="sm">Exit {report.exitCode}</Badge>
          <Text size="xs" c="dimmed">{new Date(report.timestamp).toLocaleString()}</Text>
        </Group>
        <Tooltip label="Copy to clipboard">
          <ActionIcon variant="subtle" size="sm" onClick={copyToClipboard}>
            <Copy size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Group gap={16}>
        <Text size="xs" c="dimmed">Electron {report.electronVersion}</Text>
        <Text size="xs" c="dimmed">{report.arch}</Text>
        <Text size="xs" c="dimmed">{report.osVersion}</Text>
        <Text size="xs" c="dimmed">v{report.appVersion}</Text>
      </Group>

      <Text size="xs" fw={600} style={{ color: 'var(--phantom-accent-cyan, #00d4ff)' }}>
        Native Modules
      </Text>
      {Object.entries(report.nativeModules).map(([name, info]) => (
        <Group key={name} gap={8}>
          <Badge color={info.found ? 'green' : 'red'} size="xs">{info.found ? 'FOUND' : 'MISSING'}</Badge>
          <Text size="xs" c="dimmed">{name}</Text>
          {info.nodeFiles.length > 0 && (
            <Text size="xs" c="dimmed">({info.nodeFiles.join(', ')})</Text>
          )}
        </Group>
      ))}

      {report.stderr.length > 0 && (
        <>
          <Text size="xs" fw={600} style={{ color: 'var(--phantom-status-error, #ef4444)' }}>
            stderr
          </Text>
          {report.stderr.map((line, i) => <LogLine key={i} line={line} />)}
        </>
      )}
    </Stack>
  );
};

export const ServerLogModal = ({ opened, onClose }: ServerLogModalProps) => {
  const [tab, setTab] = useState<Tab>('logs');
  const [lines, setLines] = useState<string[]>([]);
  const [logPath, setLogPath] = useState('');
  const [crashes, setCrashes] = useState<CrashReport[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setLoading(true);

    const loadLogs = window.phantomOS?.invoke('phantom:get-server-logs', 200)
      .then((result: { lines: string[]; path: string }) => {
        const filtered = result.lines.filter((l) => {
          const lower = l.toLowerCase();
          return lower.includes('error') || lower.includes('warn') || lower.includes('fatal') || lower.includes('fail') || lower.includes('crash');
        });
        setLines(filtered.length > 0 ? filtered : result.lines);
        setLogPath(result.path);
      })
      .catch(() => setLines(['Failed to read logs']));

    const loadCrashes = window.phantomOS?.invoke('phantom:get-crash-reports')
      .then((result: CrashReport[]) => setCrashes(result))
      .catch(() => setCrashes([]));

    Promise.all([loadLogs, loadCrashes]).finally(() => setLoading(false));
  }, [opened]);

  const clearCrashes = () => {
    window.phantomOS?.invoke('phantom:clear-crash-reports').then(() => setCrashes([]));
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Server Diagnostics"
      size="lg"
      styles={{
        header: { background: 'var(--phantom-surface-secondary, #1a1a2e)' },
        body: { background: 'var(--phantom-surface-primary, #0d0d1a)', padding: 0 },
        content: { border: '1px solid var(--phantom-border-subtle, #2a2a3e)' },
      }}
    >
      <Stack gap={0}>
        <Group justify="space-between" style={{ padding: '8px 16px', borderBottom: '1px solid var(--phantom-border-subtle, #2a2a3e)' }}>
          <SegmentedControl
            size="xs"
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            data={[
              { label: 'Live Logs', value: 'logs' },
              { label: `Crash Reports${crashes.length ? ` (${crashes.length})` : ''}`, value: 'crashes' },
            ]}
          />
          {tab === 'crashes' && crashes.length > 0 && (
            <Tooltip label="Clear all crash reports">
              <ActionIcon variant="subtle" size="sm" color="red" onClick={clearCrashes}>
                <Trash2 size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>

        {tab === 'logs' && (
          <>
            {logPath && (
              <Text size="xs" c="dimmed" style={{ padding: '8px 16px', borderBottom: '1px solid var(--phantom-border-subtle, #2a2a3e)' }}>
                {logPath}
              </Text>
            )}
            <ScrollArea h={400} style={{ padding: '8px 16px' }}>
              {loading && <Text size="sm" c="dimmed">Loading...</Text>}
              {!loading && lines.length === 0 && (
                <Text size="sm" c="dimmed">No logs found. The server may not have started yet.</Text>
              )}
              {lines.map((line, i) => <LogLine key={i} line={line} />)}
            </ScrollArea>
          </>
        )}

        {tab === 'crashes' && (
          <ScrollArea h={400} style={{ padding: '8px 16px' }}>
            {loading && <Text size="sm" c="dimmed">Loading...</Text>}
            {!loading && crashes.length === 0 && (
              <Text size="sm" c="dimmed">No crash reports. The server has not crashed.</Text>
            )}
            {crashes.map((report, i) => <CrashReportCard key={i} report={report} />)}
          </ScrollArea>
        )}
      </Stack>
    </Modal>
  );
};
