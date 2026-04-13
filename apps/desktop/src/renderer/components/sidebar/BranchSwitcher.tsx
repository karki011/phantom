/**
 * BranchSwitcher — right-click context menu for branch-type worktrees
 * Provides git actions (fetch, pull, push) and branch switching via modal.
 * Follows the same Menu pattern as WorktreeContextMenu.
 *
 * @author Subash Karki
 */
import {
  Button,
  Group,
  Loader,
  Menu,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import {
  Check,
  Clipboard,
  CloudDownload,
  ExternalLink,
  FolderOpen,
  GitBranch,
  GitPullRequest,
  Plus,
  Search,
  Upload,
} from 'lucide-react';
import {
  type PropsWithChildren,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useSetAtom } from 'jotai';

import { type BranchesData, getProjectBranches } from '../../lib/api';
import { checkoutBranchAtom, createBranchAtom } from '../../atoms/worktrees';
import { showSystemNotification } from '../notifications/SystemToast';
import { PhantomModal } from '../PhantomModal';

/** Call Electron IPC if available */
const invoke = async (channel: string, ...args: unknown[]): Promise<void> => {
  try {
    const api = window.phantomOS;
    if (api?.invoke) await api.invoke(channel, ...args);
  } catch (err) {
    console.error(`[IPC] ${channel} failed:`, err);
  }
};

interface BranchSwitcherProps {
  worktreeId: string;
  projectId: string;
  currentBranch: string;
  worktreePath?: string;
  onSwitch?: () => void;
}

export function BranchSwitcher({
  worktreeId,
  projectId,
  currentBranch,
  worktreePath,
  onSwitch,
  children,
}: PropsWithChildren<BranchSwitcherProps>) {
  const checkoutBranch = useSetAtom(checkoutBranchAtom);
  const createBranch = useSetAtom(createBranchAtom);

  // Context menu state
  const [menuOpened, setMenuOpened] = useState(false);
  const menuTargetRef = useRef<HTMLDivElement>(null);

  // Branch picker modal state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [branches, setBranches] = useState<BranchesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [creating, setCreating] = useState(false);
  const createInputRef = useRef<HTMLInputElement>(null);

  // ─── Context menu handlers ──────────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (menuTargetRef.current) {
      menuTargetRef.current.style.left = `${e.clientX}px`;
      menuTargetRef.current.style.top = `${e.clientY}px`;
    }
    setMenuOpened(true);
  }, []);

  const handleGitAction = useCallback(
    async (action: string, label: string) => {
      try {
        const res = await fetch(`/api/worktrees/${worktreeId}/git`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Failed' }));
          throw new Error(err.error || `${label} failed`);
        }
        showSystemNotification('Git', `${label} completed`, 'success');
        window.dispatchEvent(new Event('phantom:git-refresh'));
        onSwitch?.();
      } catch (err) {
        const msg = err instanceof Error ? err.message : `${label} failed`;
        showSystemNotification('Git', msg, 'warning');
      }
    },
    [worktreeId, onSwitch],
  );

  // ─── Branch picker modal handlers ────────────────────────────────────

  useEffect(() => {
    if (!pickerOpen) return;
    setLoading(true);
    setSearch('');
    setShowCreateInput(false);
    setNewBranchName('');

    getProjectBranches(projectId)
      .then(setBranches)
      .catch(() => setBranches(null))
      .finally(() => setLoading(false));
  }, [pickerOpen, projectId]);

  useEffect(() => {
    if (showCreateInput) {
      setTimeout(() => createInputRef.current?.focus(), 50);
    }
  }, [showCreateInput]);

  const filteredBranches = branches
    ? branches.local.filter((b) =>
        b.toLowerCase().includes(search.toLowerCase()),
      )
    : [];

  const handleSwitchBranch = useCallback(
    async (branch: string) => {
      if (branch === currentBranch || switching) return;
      setSwitching(true);
      try {
        await checkoutBranch({ worktreeId, branch });
        showSystemNotification('Branch', `Switched to ${branch}`, 'success');
        setPickerOpen(false);
        onSwitch?.();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to switch branch';
        showSystemNotification('Branch', msg, 'warning');
      } finally {
        setSwitching(false);
      }
    },
    [worktreeId, currentBranch, switching, checkoutBranch, onSwitch],
  );

  const handleCreateBranch = useCallback(async () => {
    const name = newBranchName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      await createBranch({ worktreeId, branch: name, baseBranch: currentBranch });
      showSystemNotification('Branch', `Created and switched to ${name}`, 'success');
      setPickerOpen(false);
      onSwitch?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create branch';
      showSystemNotification('Error', msg, 'warning');
    } finally {
      setCreating(false);
    }
  }, [worktreeId, currentBranch, newBranchName, creating, createBranch, onSwitch]);

  return (
    <>
      {/* Right-click target */}
      <div onContextMenu={handleContextMenu}>{children}</div>

      {/* Context menu */}
      <Menu
        opened={menuOpened}
        onChange={setMenuOpened}
        shadow="md"
        width={200}
        position="bottom-start"
        withinPortal
        middlewares={{ shift: true, flip: true }}
        styles={{
          dropdown: {
            backgroundColor: 'var(--phantom-surface-card)',
            borderColor: 'var(--phantom-border-subtle)',
          },
          item: {
            fontSize: '0.8rem',
            color: 'var(--phantom-text-secondary)',
            padding: '8px 12px',
            cursor: 'pointer',
          },
          separator: {
            borderColor: 'var(--phantom-border-subtle)',
          },
        }}
      >
        <Menu.Target>
          <div ref={menuTargetRef} style={{ position: 'fixed', width: 1, height: 1, pointerEvents: 'none' }} />
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<GitBranch size={14} />}
            onClick={() => setPickerOpen(true)}
          >
            Switch Branch...
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            leftSection={<CloudDownload size={14} />}
            onClick={() => handleGitAction('fetch', 'Fetch')}
          >
            Fetch Latest
          </Menu.Item>
          <Menu.Item
            leftSection={<GitPullRequest size={14} />}
            onClick={() => handleGitAction('pull', 'Pull')}
          >
            Pull
          </Menu.Item>
          <Menu.Item
            leftSection={<Upload size={14} />}
            onClick={() => handleGitAction('push', 'Push')}
          >
            Push
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            leftSection={<FolderOpen size={14} />}
            onClick={() => { if (worktreePath) invoke('phantom:open-in-finder', worktreePath); }}
            disabled={!worktreePath}
          >
            Open in Finder
          </Menu.Item>
          <Menu.Item
            leftSection={<ExternalLink size={14} />}
            onClick={() => { if (worktreePath) invoke('phantom:open-in-editor', worktreePath); }}
            disabled={!worktreePath}
          >
            Open in Editor
          </Menu.Item>
          <Menu.Item
            leftSection={<Clipboard size={14} />}
            onClick={() => { if (worktreePath) navigator.clipboard.writeText(worktreePath); }}
            disabled={!worktreePath}
          >
            Copy Path
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      {/* Branch picker modal */}
      <PhantomModal
        opened={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Switch Branch"
      >
        <Stack gap="md">
          <TextInput
            placeholder="Filter branches..."
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            size="md"
            leftSection={<Search size={14} />}
            autoFocus
          />

          {/* Create new branch */}
          {showCreateInput ? (
            <TextInput
              ref={createInputRef}
              placeholder="new-branch-name"
              description={`Will branch from ${currentBranch}`}
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateBranch();
                if (e.key === 'Escape') { setShowCreateInput(false); setNewBranchName(''); }
              }}
              disabled={creating}
              size="md"
              rightSection={creating ? <Loader size={14} /> : undefined}
            />
          ) : (
            <Button
              variant="subtle"
              size="xs"
              leftSection={<Plus size={12} />}
              onClick={() => setShowCreateInput(true)}
              styles={{ label: { color: 'var(--phantom-accent-cyan)', fontSize: '0.8rem' } }}
            >
              Create new branch...
            </Button>
          )}

          {/* Branch list */}
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {loading && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                <Loader size={20} />
              </div>
            )}

            {!loading && filteredBranches.map((branch) => {
              const isCurrent = branch === currentBranch;
              return (
                <div
                  key={branch}
                  role="button"
                  tabIndex={0}
                  onClick={() => { if (!switching) handleSwitchBranch(branch); }}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && !switching)
                      handleSwitchBranch(branch);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    borderRadius: 6,
                    cursor: isCurrent ? 'default' : switching ? 'wait' : 'pointer',
                    opacity: switching ? 0.6 : 1,
                    transition: 'background-color 100ms ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!switching && !isCurrent)
                      (e.currentTarget as HTMLElement).style.backgroundColor =
                        'var(--phantom-surface-card)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                  }}
                >
                  {isCurrent ? (
                    <Check size={14} style={{ color: 'var(--phantom-accent-glow)', flexShrink: 0 }} />
                  ) : (
                    <GitBranch size={14} style={{ color: 'var(--phantom-text-muted)', flexShrink: 0 }} />
                  )}
                  <Text
                    fz="0.85rem"
                    c={isCurrent ? 'var(--phantom-accent-glow)' : 'var(--phantom-text-primary)'}
                    fw={isCurrent ? 600 : 400}
                    truncate
                    style={{ flex: 1, fontFamily: 'JetBrains Mono, monospace' }}
                  >
                    {branch}
                  </Text>
                </div>
              );
            })}

            {!loading && filteredBranches.length === 0 && search && (
              <Text fz="0.8rem" c="var(--phantom-text-muted)" ta="center" py="md">
                No branches matching &ldquo;{search}&rdquo;
              </Text>
            )}
          </div>

          <Group justify="flex-end" mt="xs">
            <Button variant="subtle" size="md" onClick={() => setPickerOpen(false)}>
              Cancel
            </Button>
          </Group>
        </Stack>
      </PhantomModal>
    </>
  );
}
