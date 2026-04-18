/**
 * UpdateBanner
 * Shows a floating banner when a new app update has been downloaded
 * and is ready to install on restart.
 *
 * Listens for `updater:status` events from the main process via the
 * preload bridge. Dismissible, with a one-click "Restart" button.
 *
 * @author Subash Karki
 */
import { ActionIcon, Group, Text } from '@mantine/core';
import { Download, RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';

interface UpdateState {
  status: 'idle' | 'downloading' | 'ready';
  version?: string;
}

export const UpdateBanner = () => {
  const [update, setUpdate] = useState<UpdateState>({ status: 'idle' });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const unsub = window.phantomOS?.onUpdaterStatus?.((data) => {
      if (data.status === 'downloading' || data.status === 'ready') {
        setUpdate({ status: data.status as 'downloading' | 'ready', version: data.version });
        setDismissed(false); // re-show if a new status arrives
      }
    });
    return () => { unsub?.(); };
  }, []);

  if (update.status === 'idle' || dismissed) return null;

  const isReady = update.status === 'ready';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 56,
        right: 16,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 16px',
        borderRadius: 10,
        border: '1px solid var(--phantom-border-subtle)',
        background: 'var(--phantom-surface-card)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        animation: 'phantom-update-slidein 0.3s ease-out',
      }}
    >
      <style>{`
        @keyframes phantom-update-slidein {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {isReady ? (
        <Download size={16} style={{ color: 'var(--phantom-status-success)', flexShrink: 0 }} />
      ) : (
        <RefreshCw
          size={16}
          style={{
            color: 'var(--phantom-accent-cyan)',
            flexShrink: 0,
            animation: 'spin 1.5s linear infinite',
          }}
        />
      )}

      <Text fz="0.8rem" c="var(--phantom-text-primary)" style={{ whiteSpace: 'nowrap' }}>
        {isReady
          ? `Update v${update.version} ready`
          : `Downloading v${update.version}...`}
      </Text>

      {isReady && (
        <Group
          gap={0}
          style={{
            cursor: 'pointer',
            padding: '4px 10px',
            borderRadius: 6,
            background: 'var(--phantom-accent-cyan)',
            color: '#000',
            fontWeight: 600,
            fontSize: '0.75rem',
            flexShrink: 0,
          }}
          onClick={() => window.phantomOS?.restartToUpdate()}
        >
          Restart
        </Group>
      )}

      <ActionIcon
        variant="subtle"
        size="xs"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss update banner"
        style={{ color: 'var(--phantom-text-muted)', flexShrink: 0 }}
      >
        <X size={14} />
      </ActionIcon>
    </div>
  );
};
