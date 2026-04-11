/**
 * ChangesView — git staging + commit UI for the active worktree
 * Shows staged and unstaged files with stage/unstage actions and commit input.
 * @author Subash Karki
 */
import { Menu, ScrollArea, Text, Textarea, Tooltip } from '@mantine/core';
import { useAtomValue, useSetAtom } from 'jotai';
import { FilePlus, FileX, FilePen, FileQuestion, RefreshCw, Plus, Minus, Check, ArrowUp, ArrowDown, Undo2, MoreVertical, RotateCcw, Archive, ArchiveRestore, Download, ClipboardCopy, ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { usePaneStore } from '@phantom-os/panes';
import { activeWorktreeAtom } from '../../atoms/worktrees';
import { gitChangesCountAtom } from '../../atoms/fileExplorer';
import type { GitFileChange, GitStatusResult } from '../../lib/api';
import { fetchApi, getGitStatus, gitStage, gitUnstage, gitStageAll, gitCommit, gitPush, gitPull, gitDiscard, gitClean, gitUndoCommit, gitStash, gitStashPop, gitFetch } from '../../lib/api';

const STATUS_CONFIG = {
  modified: { label: 'Modified', icon: FilePen, color: 'var(--phantom-accent-gold, #f59e0b)' },
  added: { label: 'Added', icon: FilePlus, color: 'var(--phantom-status-success, #22c55e)' },
  deleted: { label: 'Deleted', icon: FileX, color: 'var(--phantom-status-error, #ef4444)' },
  renamed: { label: 'Renamed', icon: FilePen, color: 'var(--phantom-accent-cyan, #06b6d4)' },
  untracked: { label: 'Untracked', icon: FileQuestion, color: 'var(--phantom-text-muted, #888)' },
} as const;

function FileRow({ file, worktreeId, onStage, onDiscard }: {
  file: GitFileChange;
  worktreeId: string;
  onStage?: () => void;
  onDiscard?: () => void;
}) {
  const store = usePaneStore();
  const config = STATUS_CONFIG[file.status];
  const Icon = config.icon;
  const fileName = file.path.split('/').pop() ?? file.path;
  const dirPath = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
  const [menuOpened, setMenuOpened] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });

  const handleClick = useCallback(async () => {
    if (file.status === 'deleted') return;
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const langMap: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
      json: 'json', md: 'markdown', yaml: 'yaml', yml: 'yaml',
      py: 'python', css: 'css', html: 'html', sh: 'shell', sql: 'sql',
    };
    const language = langMap[ext] ?? 'plaintext';
    try {
      const { original, modified } = await fetchApi<{ original: string; modified: string }>(
        `/api/worktrees/${worktreeId}/git-diff?path=${encodeURIComponent(file.path)}`,
      );
      store.addPaneAsTab('diff', { original, modified, language, filePath: file.path, worktreeId } as Record<string, unknown>, `${fileName} (diff)`);
    } catch {
      store.addPaneAsTab('editor', { filePath: file.path, worktreeId } as Record<string, unknown>, fileName);
    }
  }, [file, worktreeId, fileName, store]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setMenuPosition({ x: e.clientX, y: e.clientY });
    setMenuOpened(true);
  }, []);

  return (
    <>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px',
          cursor: file.status === 'deleted' ? 'default' : 'pointer',
          borderRadius: 3, transition: 'background-color 100ms ease',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--phantom-surface-elevated, #2a2a2a)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
        onContextMenu={handleContextMenu}
      >
        <Icon size={12} style={{ color: config.color, flexShrink: 0 }} />
        <Text fz="0.73rem" c="var(--phantom-text-primary)" truncate style={{ flex: 1 }} onClick={handleClick}>
          {fileName}
        </Text>
        {dirPath && (
          <Text fz="0.6rem" c="var(--phantom-text-muted)" truncate style={{ maxWidth: 80 }}>
            {dirPath}
          </Text>
        )}
        {onDiscard && (
          <Tooltip label={file.status === 'untracked' ? 'Delete file' : 'Discard changes'} position="top" withArrow fz="xs">
            <div
              onClick={(e) => { e.stopPropagation(); onDiscard(); }}
              style={{ cursor: 'pointer', padding: 2, borderRadius: 3, display: 'flex', alignItems: 'center' }}
            >
              <Undo2 size={12} style={{ color: 'var(--phantom-status-error, #ef4444)' }} />
            </div>
          </Tooltip>
        )}
        {onStage && (
          <Tooltip label={file.staged ? 'Unstage file' : 'Stage file'} position="top" withArrow fz="xs">
            <div
              onClick={(e) => { e.stopPropagation(); onStage(); }}
              style={{ cursor: 'pointer', padding: 2, borderRadius: 3, display: 'flex', alignItems: 'center' }}
            >
              {file.staged
                ? <Minus size={12} style={{ color: 'var(--phantom-status-error, #ef4444)' }} />
                : <Plus size={12} style={{ color: 'var(--phantom-status-success, #22c55e)' }} />}
            </div>
          </Tooltip>
        )}
      </div>

      {/* Right-click context menu */}
      <Menu
        opened={menuOpened}
        onChange={(val) => { if (!val) setMenuOpened(false); }}
        position="right-start"
        withArrow
        styles={{
          dropdown: {
            backgroundColor: 'var(--phantom-surface-card)',
            border: '1px solid var(--phantom-border-subtle)',
            position: 'fixed',
            left: menuPosition.x,
            top: menuPosition.y,
          },
        }}
      >
        <Menu.Target>
          <div style={{ position: 'absolute', width: 0, height: 0 }} />
        </Menu.Target>
        <Menu.Dropdown>
          {file.status !== 'deleted' && (
            <Menu.Item
              fz="0.8rem"
              leftSection={<ExternalLink size={13} />}
              onClick={handleClick}
            >
              Open Diff
            </Menu.Item>
          )}
          <Menu.Item
            fz="0.8rem"
            leftSection={<ClipboardCopy size={13} />}
            onClick={() => navigator.clipboard.writeText(file.path)}
          >
            Copy Path
          </Menu.Item>
          <Menu.Divider />
          {onStage && (
            <Menu.Item
              fz="0.8rem"
              leftSection={file.staged
                ? <Minus size={13} style={{ color: 'var(--phantom-status-error)' }} />
                : <Plus size={13} style={{ color: 'var(--phantom-status-success)' }} />}
              onClick={onStage}
            >
              {file.staged ? 'Unstage File' : 'Stage File'}
            </Menu.Item>
          )}
          {onDiscard && (
            <Menu.Item
              fz="0.8rem"
              leftSection={<Undo2 size={13} />}
              color="red"
              onClick={onDiscard}
            >
              {file.status === 'untracked' ? 'Delete File' : 'Discard Changes'}
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
    </>
  );
}

export function ChangesView() {
  const worktree = useAtomValue(activeWorktreeAtom);
  const setChangesCount = useSetAtom(gitChangesCountAtom);
  const [status, setStatus] = useState<GitStatusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [commitMsg, setCommitMsg] = useState('');
  const [committing, setCommitting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<'success' | 'error' | null>(null);
  const [pullFeedback, setPullFeedback] = useState<'success' | 'error' | null>(null);

  const refresh = useCallback(() => {
    if (!worktree) return;
    setLoading(true);
    getGitStatus(worktree.id)
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, [worktree?.id]);

  // Refresh + sync GitStatusCard on WorktreeHome (only for user actions, not polling)
  const refreshAndSync = useCallback(() => {
    refresh();
    window.dispatchEvent(new Event('phantom:git-refresh'));
  }, [refresh]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 10_000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Background fetch every 60s so ahead/behind counts stay fresh
  useEffect(() => {
    if (!worktree) return;
    // Fetch once on mount, then every 60s
    gitFetch(worktree.id).catch(() => {});
    const fetchInterval = setInterval(() => {
      gitFetch(worktree.id).catch(() => {});
    }, 60_000);
    return () => clearInterval(fetchInterval);
  }, [worktree?.id]);

  const stagedFiles = status?.files.filter((f) => f.staged) ?? [];
  const unstagedFiles = status?.files.filter((f) => !f.staged) ?? [];
  const totalChanges = status?.files.length ?? 0;

  // Sync count to shared atom so tab badge can read it
  useEffect(() => {
    setChangesCount(totalChanges);
  }, [totalChanges, setChangesCount]);

  const handleStage = useCallback(async (path: string) => {
    if (!worktree) return;
    await gitStage(worktree.id, [path]);
    refreshAndSync();
  }, [worktree?.id, refreshAndSync]);

  const handleUnstage = useCallback(async (path: string) => {
    if (!worktree) return;
    await gitUnstage(worktree.id, [path]);
    refreshAndSync();
  }, [worktree?.id, refreshAndSync]);

  const handleDiscard = useCallback(async (path: string, isUntracked: boolean) => {
    if (!worktree) return;
    if (isUntracked) {
      await gitClean(worktree.id, [path]);
    } else {
      await gitDiscard(worktree.id, [path]);
    }
    refreshAndSync();
  }, [worktree?.id, refreshAndSync]);

  const handleStageAll = useCallback(async () => {
    if (!worktree) return;
    await gitStageAll(worktree.id);
    refreshAndSync();
  }, [worktree?.id, refreshAndSync]);

  const handleCommit = useCallback(async () => {
    if (!worktree || !commitMsg.trim() || stagedFiles.length === 0) return;
    setCommitting(true);
    try {
      await gitCommit(worktree.id, commitMsg.trim());
      setCommitMsg('');
      refreshAndSync();
    } catch { /* refresh shows current state */ }
    finally { setCommitting(false); }
  }, [worktree?.id, commitMsg, stagedFiles.length, refreshAndSync]);

  const handlePush = useCallback(async () => {
    if (!worktree || pushing) return;
    setPushing(true);
    setPushFeedback(null);
    try {
      await gitPush(worktree.id);
      setPushFeedback('success');
      refreshAndSync();
    } catch {
      setPushFeedback('error');
    } finally {
      setPushing(false);
      setTimeout(() => setPushFeedback(null), 2500);
    }
  }, [worktree?.id, pushing, refreshAndSync]);

  const handlePull = useCallback(async () => {
    if (!worktree || pulling) return;
    setPulling(true);
    setPullFeedback(null);
    try {
      await gitPull(worktree.id);
      setPullFeedback('success');
      refreshAndSync();
    } catch {
      setPullFeedback('error');
    } finally {
      setPulling(false);
      setTimeout(() => setPullFeedback(null), 2500);
    }
  }, [worktree?.id, pulling, refreshAndSync]);

  const handleUndoCommit = useCallback(async () => {
    if (!worktree) return;
    await gitUndoCommit(worktree.id);
    refreshAndSync();
  }, [worktree?.id, refreshAndSync]);

  const handleStash = useCallback(async () => {
    if (!worktree) return;
    await gitStash(worktree.id);
    refreshAndSync();
  }, [worktree?.id, refreshAndSync]);

  const handleStashPop = useCallback(async () => {
    if (!worktree) return;
    await gitStashPop(worktree.id);
    refreshAndSync();
  }, [worktree?.id, refreshAndSync]);

  const handleFetch = useCallback(async () => {
    if (!worktree) return;
    await gitFetch(worktree.id);
    refreshAndSync();
  }, [worktree?.id, refreshAndSync]);

  if (!worktree) {
    return (
      <Text fz="0.75rem" c="var(--phantom-text-muted)" ta="center" py="xl" px="sm">
        Select a worktree to view changes.
      </Text>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: '1px solid var(--phantom-border-subtle)', flexShrink: 0 }}>
        <Text fz="0.7rem" fw={600} c="var(--phantom-text-secondary)" style={{ flex: 1 }}>
          {worktree.name}
        </Text>
        <Text fz="0.65rem" c="var(--phantom-text-muted)">
          {totalChanges} change{totalChanges !== 1 ? 's' : ''}
        </Text>
        <Tooltip label={pullFeedback === 'success' ? 'Pulled!' : pullFeedback === 'error' ? 'Pull failed' : status?.behind ? `Pull ${status.behind} commit${status.behind !== 1 ? 's' : ''} from remote` : 'Pull from remote'} position="bottom" withArrow fz="xs">
          <div
            onClick={handlePull}
            style={{
              display: 'flex', alignItems: 'center', gap: 2, cursor: pulling ? 'default' : 'pointer',
              color: pullFeedback === 'success' ? 'var(--phantom-status-success, #22c55e)' : pullFeedback === 'error' ? 'var(--phantom-status-error, #ef4444)' : pulling ? 'var(--phantom-accent-cyan)' : status?.behind ? 'var(--phantom-accent-gold, #f59e0b)' : 'var(--phantom-text-muted)',
              padding: '1px 4px', borderRadius: 3, fontSize: '0.6rem', fontWeight: 600,
              transition: 'color 300ms ease',
            }}
          >
            <ArrowDown size={10} />
            {pulling ? 'Pulling...' : pullFeedback === 'success' ? 'Pulled!' : pullFeedback === 'error' ? 'Failed' : status?.behind ? `Pull ${status.behind}` : 'Pull'}
          </div>
        </Tooltip>
        <Tooltip label={pushFeedback === 'success' ? 'Pushed!' : pushFeedback === 'error' ? 'Push failed' : status?.ahead ? `Push ${status.ahead} commit${status.ahead !== 1 ? 's' : ''} to remote` : 'Push to remote'} position="bottom" withArrow fz="xs">
          <div
            onClick={handlePush}
            style={{
              display: 'flex', alignItems: 'center', gap: 2, cursor: pushing ? 'default' : 'pointer',
              color: pushFeedback === 'success' ? 'var(--phantom-status-success, #22c55e)' : pushFeedback === 'error' ? 'var(--phantom-status-error, #ef4444)' : pushing ? 'var(--phantom-accent-cyan)' : status?.ahead ? 'var(--phantom-status-success, #22c55e)' : 'var(--phantom-text-muted)',
              padding: '1px 4px', borderRadius: 3, fontSize: '0.6rem', fontWeight: 600,
              transition: 'color 300ms ease',
            }}
          >
            <ArrowUp size={10} />
            {pushing ? 'Pushing...' : pushFeedback === 'success' ? 'Pushed!' : pushFeedback === 'error' ? 'Failed' : status?.ahead ? `Push ${status.ahead}` : 'Push'}
          </div>
        </Tooltip>
        <Tooltip label="Refresh status" position="bottom" withArrow fz="xs">
          <RefreshCw
            size={11}
            style={{ color: 'var(--phantom-text-muted)', cursor: 'pointer', animation: loading ? 'spin 1s linear infinite' : 'none' }}
            onClick={refresh}
          />
        </Tooltip>
        <Menu position="bottom-end" withArrow shadow="md" width={180}>
          <Menu.Target>
            <div style={{ cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}>
              <MoreVertical size={11} style={{ color: 'var(--phantom-text-muted)' }} />
            </div>
          </Menu.Target>
          <Menu.Dropdown styles={{ dropdown: { backgroundColor: 'var(--phantom-surface-elevated, #2a2a2a)', border: '1px solid var(--phantom-border-subtle)' } }}>
            <Menu.Item
              leftSection={<RotateCcw size={13} />}
              onClick={handleUndoCommit}
              styles={{ item: { fontSize: '0.73rem', color: 'var(--phantom-text-primary)' } }}
            >
              Undo last commit
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              leftSection={<Archive size={13} />}
              onClick={handleStash}
              styles={{ item: { fontSize: '0.73rem', color: 'var(--phantom-text-primary)' } }}
            >
              Stash changes
            </Menu.Item>
            <Menu.Item
              leftSection={<ArchiveRestore size={13} />}
              onClick={handleStashPop}
              styles={{ item: { fontSize: '0.73rem', color: 'var(--phantom-text-primary)' } }}
            >
              Pop stash
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              leftSection={<Download size={13} />}
              onClick={handleFetch}
              styles={{ item: { fontSize: '0.73rem', color: 'var(--phantom-text-primary)' } }}
            >
              Fetch remote
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>

      {/* File list */}
      <ScrollArea style={{ flex: 1 }} scrollbarSize={6}>
        <div style={{ padding: '4px 0' }}>
          {totalChanges === 0 && status ? (
            <Text fz="0.75rem" c="var(--phantom-text-muted)" ta="center" py="xl" px="sm">
              Working tree clean
            </Text>
          ) : (
            <>
              {/* Staged Changes */}
              {stagedFiles.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px' }}>
                    <Text fz="0.65rem" fw={700} tt="uppercase" c="var(--phantom-status-success, #22c55e)" style={{ letterSpacing: '0.05em', flex: 1 }}>
                      Staged ({stagedFiles.length})
                    </Text>
                    <Tooltip label="Unstage all" position="top" withArrow fz="xs">
                      <div
                        onClick={() => { if (worktree) { gitUnstage(worktree.id, stagedFiles.map((f) => f.path)); refreshAndSync(); } }}
                        style={{ cursor: 'pointer', padding: 2 }}
                      >
                        <Minus size={11} style={{ color: 'var(--phantom-text-muted)' }} />
                      </div>
                    </Tooltip>
                  </div>
                  {stagedFiles.map((file) => (
                    <FileRow key={`staged-${file.path}`} file={file} worktreeId={worktree.id} onStage={() => handleUnstage(file.path)} />
                  ))}
                </div>
              )}

              {/* Unstaged Changes */}
              {unstagedFiles.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px' }}>
                    <Text fz="0.65rem" fw={700} tt="uppercase" c="var(--phantom-accent-gold, #f59e0b)" style={{ letterSpacing: '0.05em', flex: 1 }}>
                      Changes ({unstagedFiles.length})
                    </Text>
                    <Tooltip label="Stage all" position="top" withArrow fz="xs">
                      <div onClick={handleStageAll} style={{ cursor: 'pointer', padding: 2 }}>
                        <Plus size={11} style={{ color: 'var(--phantom-text-muted)' }} />
                      </div>
                    </Tooltip>
                  </div>
                  {unstagedFiles.map((file) => (
                    <FileRow
                      key={`unstaged-${file.path}`}
                      file={file}
                      worktreeId={worktree.id}
                      onStage={() => handleStage(file.path)}
                      onDiscard={() => handleDiscard(file.path, file.status === 'untracked')}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>

      {/* Commit area */}
      {stagedFiles.length > 0 && (
        <div style={{ borderTop: '1px solid var(--phantom-border-subtle)', padding: 8, flexShrink: 0 }}>
          <Textarea
            placeholder="Commit message..."
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.currentTarget.value)}
            minRows={2}
            maxRows={4}
            autosize
            styles={{
              input: {
                fontSize: '0.75rem',
                backgroundColor: 'var(--phantom-surface-base, #1a1a1a)',
                border: '1px solid var(--phantom-border-subtle)',
                color: 'var(--phantom-text-primary)',
              },
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleCommit();
              }
            }}
          />
          <div
            onClick={handleCommit}
            style={{
              marginTop: 6,
              padding: '5px 0',
              textAlign: 'center',
              borderRadius: 4,
              cursor: commitMsg.trim() && !committing ? 'pointer' : 'default',
              backgroundColor: commitMsg.trim() && !committing ? 'var(--phantom-status-success, #22c55e)' : 'var(--phantom-surface-elevated, #2a2a2a)',
              color: commitMsg.trim() && !committing ? '#000' : 'var(--phantom-text-muted)',
              fontSize: '0.73rem',
              fontWeight: 600,
              transition: 'all 150ms ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Check size={12} />
            {committing ? 'Committing...' : `Commit (${stagedFiles.length} file${stagedFiles.length !== 1 ? 's' : ''})`}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
