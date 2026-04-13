/**
 * ChangesView — git staging + commit UI for the active worktree
 * Shows staged and unstaged files with stage/unstage actions and commit input.
 * @author Subash Karki
 */
import { Menu, ScrollArea, Skeleton, Text, Textarea, Tooltip } from '@mantine/core';
import { useAtomValue, useSetAtom, useStore } from 'jotai';
import { FilePlus, FileX, FilePen, FileQuestion, RefreshCw, Plus, Minus, Check, ArrowUp, ArrowDown, Undo2, MoreVertical, RotateCcw, Archive, ArchiveRestore, Download, ClipboardCopy, ExternalLink, Sparkles, RotateCw, PenLine } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePaneStore } from '@phantom-os/panes';
import { aiCommitFamily, addCommitGenAtom } from '../../atoms/aiCommit';
import type { AiCommitState } from '../../atoms/aiCommit';
import { activeWorktreeAtom } from '../../atoms/worktrees';
import { gitStatusAtom, selectedFileAtom } from '../../atoms/fileExplorer';
import type { GitFileChange } from '../../lib/api';
import { fetchApi, gitStage, gitUnstage, gitStageAll, gitCommit, gitPush, gitPull, gitDiscard, gitClean, gitUndoCommit, gitStash, gitStashPop, gitFetch, gitGenerateCommitMsg, gitCancelCommitMsg } from '../../lib/api';
import { showSystemNotification } from '../notifications/SystemToast';

const showCommitError = (msg: string) => {
  const clean = msg.replace(/^git commit failed:\s*/i, '');
  showSystemNotification('Git Error', clean, 'warning');
};

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
  const selectedFile = useAtomValue(selectedFileAtom);
  const isSelected = selectedFile === file.path;
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
          backgroundColor: isSelected ? 'var(--phantom-surface-elevated, #2a2a2a)' : undefined,
          borderLeft: isSelected ? '2px solid var(--phantom-accent-glow)' : '2px solid transparent',
        }}
        onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--phantom-surface-elevated, #2a2a2a)'; }}
        onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
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
  // Git status is polled by RightSidebar (always mounted) and stored in
  // gitStatusAtom. We read it here — no local polling needed.
  const status = useAtomValue(gitStatusAtom);
  const [commitMsg, setCommitMsg] = useState('');
  const [committing, setCommitting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<'success' | 'error' | null>(null);
  const [pullFeedback, setPullFeedback] = useState<'success' | 'error' | null>(null);
  const [commitMode, setCommitMode] = useState<'ai' | 'manual'>('ai');
  const store = useStore();
  const addCommitGen = useSetAtom(addCommitGenAtom);
  const aiCommit: AiCommitState = useAtomValue(
    worktree ? aiCommitFamily(worktree.id) : aiCommitFamily('__none__'),
  );
  const [aiEditMsg, setAiEditMsg] = useState('');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear commit message and AI state when switching worktrees
  useEffect(() => {
    setCommitMsg('');
    setCommitMode('ai');
    setAiEditMsg('');
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, [worktree?.id]);

  // Sync AI-generated message to editable field when ready
  useEffect(() => {
    if (aiCommit.phase === 'ready' && aiCommit.message) {
      setAiEditMsg(aiCommit.message);
    }
  }, [aiCommit.phase, aiCommit.message]);

  // Trigger refresh in the parent poller + WorktreeHome git card
  const refreshAndSync = useCallback(() => {
    window.dispatchEvent(new Event('phantom:git-refresh'));
  }, []);

  const stagedFiles = status?.files.filter((f) => f.staged) ?? [];
  const unstagedFiles = status?.files.filter((f) => !f.staged) ?? [];
  const totalChanges = status?.files.length ?? 0;

  const handleStage = useCallback(async (path: string) => {
    if (!worktree) return;
    try { await gitStage(worktree.id, [path]); } catch (err: any) { showCommitError(err?.message ?? 'Stage failed'); }
    refreshAndSync();
  }, [worktree?.id, refreshAndSync]);

  const handleUnstage = useCallback(async (path: string) => {
    if (!worktree) return;
    try { await gitUnstage(worktree.id, [path]); } catch (err: any) { showCommitError(err?.message ?? 'Unstage failed'); }
    refreshAndSync();
  }, [worktree?.id, refreshAndSync]);

  const handleDiscard = useCallback(async (path: string, isUntracked: boolean) => {
    if (!worktree) return;
    try {
      if (isUntracked) { await gitClean(worktree.id, [path]); }
      else { await gitDiscard(worktree.id, [path]); }
    } catch (err: any) { showCommitError(err?.message ?? 'Discard failed'); }
    refreshAndSync();
  }, [worktree?.id, refreshAndSync]);

  const handleStageAll = useCallback(async () => {
    if (!worktree) return;
    try { await gitStageAll(worktree.id); } catch (err: any) { showCommitError(err?.message ?? 'Stage all failed'); }
    refreshAndSync();
  }, [worktree?.id, refreshAndSync]);

  const handleCommit = useCallback(async () => {
    if (!worktree || !commitMsg.trim() || stagedFiles.length === 0) return;
    setCommitting(true);
    try {
      await gitCommit(worktree.id, commitMsg.trim());
      setCommitMsg('');
      refreshAndSync();
    } catch (err: any) {
      showCommitError(err?.message ?? 'Commit failed');
    } finally { setCommitting(false); }
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
    try { await gitUndoCommit(worktree.id); } catch (err: any) { showCommitError(err?.message ?? 'Undo failed'); }
    refreshAndSync();
  }, [worktree?.id, refreshAndSync]);

  const handleStash = useCallback(async () => {
    if (!worktree) return;
    try { await gitStash(worktree.id); } catch (err: any) { showCommitError(err?.message ?? 'Stash failed'); }
    refreshAndSync();
  }, [worktree?.id, refreshAndSync]);

  const handleStashPop = useCallback(async () => {
    if (!worktree) return;
    try { await gitStashPop(worktree.id); } catch (err: any) { showCommitError(err?.message ?? 'Stash pop failed'); }
    refreshAndSync();
  }, [worktree?.id, refreshAndSync]);

  const handleFetch = useCallback(async () => {
    if (!worktree) return;
    await gitFetch(worktree.id);
    refreshAndSync();
  }, [worktree?.id, refreshAndSync]);

  const handleGenerateMsg = useCallback(async () => {
    if (!worktree) return;
    // Set atom to generating state
    store.set(aiCommitFamily(worktree.id), { phase: 'generating', message: null, error: null });
    addCommitGen(worktree.id);
    setAiEditMsg('');

    // Client-side timeout (45s fallback)
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const current = store.get(aiCommitFamily(worktree.id));
      if (current.phase === 'generating') {
        store.set(aiCommitFamily(worktree.id), { phase: 'error', message: null, error: 'Generation timed out' });
      }
    }, 45_000);

    try {
      await gitGenerateCommitMsg(worktree.id);
    } catch (err: any) {
      store.set(aiCommitFamily(worktree.id), { phase: 'error', message: null, error: err?.message ?? 'Failed to start generation' });
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
  }, [worktree?.id, store, addCommitGen]);

  const handleAiCommit = useCallback(async () => {
    if (!worktree || !aiEditMsg.trim() || stagedFiles.length === 0) return;
    setCommitting(true);
    try {
      await gitCommit(worktree.id, aiEditMsg.trim());
      setAiEditMsg('');
      store.set(aiCommitFamily(worktree.id), { phase: 'idle', message: null, error: null });
      refreshAndSync();
    } catch (err: any) {
      showCommitError(err?.message ?? 'Commit failed');
    } finally { setCommitting(false); }
  }, [worktree?.id, aiEditMsg, stagedFiles.length, refreshAndSync, store]);

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: '1px solid var(--phantom-border-subtle)', flexShrink: 0, minWidth: 0 }}>
        <Text fz="0.7rem" fw={600} c="var(--phantom-text-secondary)" truncate style={{ flex: 1, minWidth: 0 }}>
          {worktree.name}
        </Text>
        <Text fz="0.65rem" c="var(--phantom-text-muted)" style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
          {totalChanges} change{totalChanges !== 1 ? 's' : ''}
        </Text>
        <Tooltip label={pullFeedback === 'success' ? 'Pulled!' : pullFeedback === 'error' ? 'Pull failed' : status?.behind ? `Pull ${status.behind} commit${status.behind !== 1 ? 's' : ''} from remote` : 'Pull from remote'} position="bottom" withArrow fz="xs">
          <div
            onClick={handlePull}
            style={{
              display: 'flex', alignItems: 'center', gap: 2, cursor: pulling ? 'default' : 'pointer',
              color: pullFeedback === 'success' ? 'var(--phantom-status-success, #22c55e)' : pullFeedback === 'error' ? 'var(--phantom-status-error, #ef4444)' : pulling ? 'var(--phantom-accent-cyan)' : status?.behind ? 'var(--phantom-accent-gold, #f59e0b)' : 'var(--phantom-text-muted)',
              padding: '1px 4px', borderRadius: 3, fontSize: '0.6rem', fontWeight: 600,
              transition: 'color 300ms ease', flexShrink: 0, whiteSpace: 'nowrap',
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
              transition: 'color 300ms ease', flexShrink: 0, whiteSpace: 'nowrap',
            }}
          >
            <ArrowUp size={10} />
            {pushing ? 'Pushing...' : pushFeedback === 'success' ? 'Pushed!' : pushFeedback === 'error' ? 'Failed' : status?.ahead ? `Push ${status.ahead}` : 'Push'}
          </div>
        </Tooltip>
        <Tooltip label="Refresh status" position="bottom" withArrow fz="xs">
          <RefreshCw
            size={11}
            style={{ color: 'var(--phantom-text-muted)', cursor: 'pointer' }}
            onClick={refreshAndSync}
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
          {!status ? (
            <div style={{ padding: '8px 12px' }}>
              <Skeleton height={12} width="40%" mb={10} />
              <Skeleton height={14} mb={6} />
              <Skeleton height={14} mb={6} />
              <Skeleton height={14} mb={6} />
              <Skeleton height={12} width="40%" mb={10} mt={12} />
              <Skeleton height={14} mb={6} />
              <Skeleton height={14} mb={6} />
            </div>
          ) : totalChanges === 0 ? (
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

          {/* ── AI Mode: Idle ── */}
          {commitMode === 'ai' && aiCommit.phase === 'idle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div
                onClick={handleGenerateMsg}
                style={{
                  padding: '7px 0',
                  textAlign: 'center',
                  borderRadius: 4,
                  cursor: 'pointer',
                  background: 'linear-gradient(135deg, var(--phantom-accent-cyan, #00d4ff) 0%, #0891b2 100%)',
                  color: '#000',
                  fontSize: '0.73rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  transition: 'opacity 150ms ease',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.85'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
              >
                <Sparkles size={13} />
                AI Commit
              </div>
              <Text
                fz="0.65rem"
                c="var(--phantom-text-muted)"
                ta="center"
                style={{ cursor: 'pointer' }}
                onClick={() => setCommitMode('manual')}
              >
                or write manually
              </Text>
            </div>
          )}

          {/* ── AI Mode: Generating ── */}
          {commitMode === 'ai' && aiCommit.phase === 'generating' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, animation: 'ai-fadein 300ms ease-out' }}>
              {/* Shimmer bar */}
              <div style={{
                height: 3,
                borderRadius: 2,
                overflow: 'hidden',
                backgroundColor: 'var(--phantom-surface-elevated, #2a2a2a)',
              }}>
                <div style={{
                  height: '100%',
                  width: '40%',
                  borderRadius: 2,
                  background: 'linear-gradient(90deg, transparent, var(--phantom-accent-cyan, #00d4ff), transparent)',
                  animation: 'ai-shimmer 1.5s ease-in-out infinite',
                }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Sparkles size={12} style={{ color: 'var(--phantom-accent-cyan, #00d4ff)', animation: 'ai-breathe 2s ease-in-out infinite' }} />
                <Text fz="0.72rem" c="var(--phantom-accent-cyan, #00d4ff)" fw={500}>
                  Generating commit message...
                </Text>
              </div>
              <Text
                fz="0.6rem"
                c="var(--phantom-text-muted)"
                ta="center"
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  if (worktree) {
                    gitCancelCommitMsg(worktree.id).catch(() => {});
                    store.set(aiCommitFamily(worktree.id), { phase: 'idle', message: null, error: null });
                  }
                  if (timeoutRef.current) clearTimeout(timeoutRef.current);
                }}
              >
                Cancel
              </Text>
            </div>
          )}

          {/* ── AI Mode: Ready ── */}
          {commitMode === 'ai' && aiCommit.phase === 'ready' && (
            <div style={{ animation: 'ai-fadein 400ms ease-out' }}>
              <Textarea
                placeholder="Edit commit message..."
                value={aiEditMsg}
                onChange={(e) => setAiEditMsg(e.currentTarget.value)}
                minRows={6}
                maxRows={16}
                autosize
                styles={{
                  input: {
                    fontSize: '0.75rem',
                    backgroundColor: 'var(--phantom-surface-base, #1a1a1a)',
                    border: '1px solid var(--phantom-accent-cyan, #00d4ff)',
                    color: 'var(--phantom-text-primary)',
                    boxShadow: '0 0 6px rgba(0, 212, 255, 0.15)',
                    resize: 'vertical',
                  },
                }}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleAiCommit();
                  }
                }}
              />
              <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                <div
                  onClick={handleAiCommit}
                  style={{
                    flex: 1,
                    padding: '5px 0',
                    textAlign: 'center',
                    borderRadius: 4,
                    cursor: aiEditMsg.trim() && !committing ? 'pointer' : 'default',
                    backgroundColor: aiEditMsg.trim() && !committing ? 'var(--phantom-status-success, #22c55e)' : 'var(--phantom-surface-elevated, #2a2a2a)',
                    color: aiEditMsg.trim() && !committing ? '#000' : 'var(--phantom-text-muted)',
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
                  {committing ? 'Committing...' : `Commit (${stagedFiles.length})`}
                </div>
                <Tooltip label="Regenerate" position="top" withArrow fz="xs">
                  <div
                    onClick={handleGenerateMsg}
                    style={{
                      padding: '5px 8px',
                      borderRadius: 4,
                      cursor: 'pointer',
                      backgroundColor: 'var(--phantom-surface-elevated, #2a2a2a)',
                      display: 'flex',
                      alignItems: 'center',
                      transition: 'background-color 150ms ease',
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--phantom-surface-card, #333)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--phantom-surface-elevated, #2a2a2a)'; }}
                  >
                    <RotateCw size={12} style={{ color: 'var(--phantom-accent-cyan, #00d4ff)' }} />
                  </div>
                </Tooltip>
              </div>
            </div>
          )}

          {/* ── AI Mode: Error ── */}
          {commitMode === 'ai' && aiCommit.phase === 'error' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, animation: 'ai-fadein 300ms ease-out' }}>
              <Text fz="0.7rem" c="var(--phantom-status-error, #ef4444)" ta="center">
                {aiCommit.error ?? 'Generation failed'}
              </Text>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <Text
                  fz="0.65rem"
                  c="var(--phantom-accent-cyan, #00d4ff)"
                  style={{ cursor: 'pointer' }}
                  onClick={handleGenerateMsg}
                >
                  Retry
                </Text>
                <Text fz="0.65rem" c="var(--phantom-text-muted)">|</Text>
                <Text
                  fz="0.65rem"
                  c="var(--phantom-text-muted)"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setCommitMode('manual')}
                >
                  Write manually
                </Text>
              </div>
            </div>
          )}

          {/* ── Manual Mode ── */}
          {commitMode === 'manual' && (
            <>
              <Textarea
                placeholder="Commit message..."
                value={commitMsg}
                onChange={(e) => setCommitMsg(e.currentTarget.value)}
                minRows={6}
                maxRows={16}
                autosize
                styles={{
                  input: {
                    fontSize: '0.75rem',
                    backgroundColor: 'var(--phantom-surface-base, #1a1a1a)',
                    border: '1px solid var(--phantom-border-subtle)',
                    color: 'var(--phantom-text-primary)',
                    resize: 'vertical',
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
              <Text
                fz="0.65rem"
                c="var(--phantom-accent-cyan, #00d4ff)"
                ta="center"
                mt={4}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                onClick={() => { setCommitMode('ai'); if (worktree) store.set(aiCommitFamily(worktree.id), { phase: 'idle', message: null, error: null }); }}
              >
                <Sparkles size={10} />
                Use AI instead
              </Text>
            </>
          )}
        </div>
      )}


      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes ai-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
        @keyframes ai-breathe {
          0%, 100% { opacity: 0.5; filter: drop-shadow(0 0 2px var(--phantom-accent-cyan, #00d4ff)); }
          50% { opacity: 1; filter: drop-shadow(0 0 8px var(--phantom-accent-cyan, #00d4ff)); }
        }
        @keyframes ai-fadein {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
