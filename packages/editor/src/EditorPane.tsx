/**
 * EditorPane — Monaco editor wired to the workspace file system.
 * Fetches file content on mount, saves on Ctrl+S.
 * @author Subash Karki
 */
import { useEffect, useRef, useState, useCallback, type CSSProperties } from 'react';
import { LazyEditor, configureMonacoForWorkspace } from './LazyMonaco.js';

interface EditorPaneProps {
  paneId: string;
  filePath?: string;
  worktreeId?: string;
  repoPath?: string;
  language?: string;
  value?: string;
  onChange?: (value: string | undefined) => void;
}

/** Track which workspace roots have been configured to avoid re-running */
const configuredRoots = new Set<string>();

/** Detect language from file extension */
const detectLanguage = (path?: string): string => {
  if (!path) return 'plaintext';
  const ext = path.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', md: 'markdown', yaml: 'yaml', yml: 'yaml',
    py: 'python', rs: 'rust', go: 'go', css: 'css', html: 'html',
    sh: 'shell', bash: 'shell', sql: 'sql', toml: 'toml',
  };
  return map[ext ?? ''] ?? 'plaintext';
};

/** Extract filename from path for display */
const getFileName = (path?: string): string => {
  if (!path) return 'untitled';
  return path.split('/').pop() ?? path;
};

export const EditorPane = ({
  paneId,
  filePath,
  worktreeId,
  repoPath,
  language,
  value: initialValue,
  onChange,
}: EditorPaneProps) => {
  const [content, setContent] = useState<string>(initialValue ?? '');
  const [loading, setLoading] = useState(!!filePath);
  const [editorFontSize, setEditorFontSize] = useState(12);

  // Configure Monaco with workspace tsconfig + types (once per workspace root)
  useEffect(() => {
    if (!repoPath || configuredRoots.has(repoPath)) return;
    configuredRoots.add(repoPath);
    configureMonacoForWorkspace(repoPath);
  }, [repoPath]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const contentRef = useRef(content);
  contentRef.current = content;

  // Fetch file content — worktree API or generic file-read API
  useEffect(() => {
    if (!filePath) return;
    setLoading(true);

    const url = worktreeId
      ? `/api/worktrees/${worktreeId}/file?path=${encodeURIComponent(filePath)}`
      : `/api/file-read?path=${encodeURIComponent(filePath)}`;

    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load: ${r.status}`);
        return r.json();
      })
      .then((data: { content: string }) => {
        setContent(data.content);
        setDirty(false);
      })
      .catch(() => {
        setContent(`// Failed to load ${filePath}`);
      })
      .finally(() => setLoading(false));
  }, [worktreeId, filePath]);

  // Handle content changes
  const handleChange = useCallback(
    (val: string | undefined) => {
      const v = val ?? '';
      setContent(v);
      contentRef.current = v;
      setDirty(true);
      onChange?.(val);
    },
    [onChange],
  );

  // Save file — worktree API or generic file-write API
  const saveFile = useCallback(async () => {
    if (!filePath || saving) return;
    setSaving(true);
    try {
      if (worktreeId) {
        await fetch(`/api/worktrees/${worktreeId}/file`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: filePath, content: contentRef.current }),
        });
      } else {
        await fetch('/api/file-write', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: filePath, content: contentRef.current }),
        });
      }
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [worktreeId, filePath, saving]);

  // Ctrl+S / Cmd+S to save
  useEffect(() => {
    if (!filePath) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [worktreeId, filePath, saveFile]);

  // Right-click context menu
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Close context menu on outside click
  useEffect(() => {
    if (!ctxMenu) return;
    const handler = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [ctxMenu]);

  const copyPath = useCallback((relative?: boolean) => {
    if (!filePath) return;
    const path = relative ? filePath : (repoPath ? `${repoPath}/${filePath}` : filePath);
    navigator.clipboard.writeText(path);
    setCtxMenu(null);
  }, [filePath, repoPath]);

  // Unsaved changes confirmation modal
  const [showCloseModal, setShowCloseModal] = useState(false);
  const pendingCloseRef = useRef<CustomEvent | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: CustomEvent) => {
      if (e.detail?.paneId === paneId) {
        e.preventDefault();
        e.stopImmediatePropagation();
        pendingCloseRef.current = e;
        setShowCloseModal(true);
      }
    };
    window.addEventListener('phantom:pane-close' as any, handler);
    return () => window.removeEventListener('phantom:pane-close' as any, handler);
  }, [dirty, paneId]);

  const forceClose = useCallback(() => {
    window.dispatchEvent(new CustomEvent('phantom:pane-force-close', { detail: { paneId } }));
  }, [paneId]);

  const handleCloseDiscard = useCallback(() => {
    setShowCloseModal(false);
    setDirty(false);
    forceClose();
  }, [forceClose]);

  const handleCloseSave = useCallback(async () => {
    await saveFile();
    setShowCloseModal(false);
    setDirty(false);
    forceClose();
  }, [saveFile, forceClose]);

  const handleCloseCancel = useCallback(() => {
    setShowCloseModal(false);
    pendingCloseRef.current = null;
  }, []);

  const ctxMenuStyle: CSSProperties = {
    position: 'fixed',
    left: ctxMenu?.x ?? 0,
    top: ctxMenu?.y ?? 0,
    zIndex: 9999,
    background: 'var(--phantom-surface-card, #1a1a2e)',
    border: '1px solid var(--phantom-border-subtle, rgba(255,255,255,0.12))',
    borderRadius: 6,
    padding: '4px 0',
    minWidth: 180,
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  };

  const ctxItemStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    fontSize: 12,
    cursor: 'pointer',
    color: 'rgba(255,255,255,0.8)',
    background: 'transparent',
    border: 'none',
    width: '100%',
    textAlign: 'left',
  };

  if (loading) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--phantom-text-muted, #666)',
          fontSize: 13,
        }}
      >
        Loading {getFileName(filePath)}...
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }} data-pane-id={paneId}>
      {/* Editor toolbar */}
      <div
        onContextMenu={handleContextMenu}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '2px 8px',
          height: 24,
          flexShrink: 0,
          background: 'var(--phantom-surface-card, #1e1e1e)',
          borderBottom: '1px solid var(--phantom-border-subtle, #333)',
          fontSize: 11,
          color: 'var(--phantom-text-muted, #888)',
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {getFileName(filePath)}
        </span>
        {dirty && <span style={{ color: 'var(--phantom-accent-gold, #f59e0b)' }}>{saving ? 'Saving...' : 'Modified'}</span>}
        <button
          type="button"
          onClick={() => setEditorFontSize((s) => Math.max(8, s - 1))}
          style={{ background: 'none', border: 'none', color: 'var(--phantom-text-muted, #888)', cursor: 'pointer', padding: '0 2px', fontSize: 13, lineHeight: 1 }}
          title="Decrease font size"
        >
          −
        </button>
        <span style={{ minWidth: 20, textAlign: 'center' }}>{editorFontSize}</span>
        <button
          type="button"
          onClick={() => setEditorFontSize((s) => Math.min(28, s + 1))}
          style={{ background: 'none', border: 'none', color: 'var(--phantom-text-muted, #888)', cursor: 'pointer', padding: '0 2px', fontSize: 13, lineHeight: 1 }}
          title="Increase font size"
        >
          +
        </button>
      </div>
      <LazyEditor
        height="100%"
        language={language ?? detectLanguage(filePath)}
        value={content}
        onChange={handleChange}
        theme="vs-dark"
        options={{
          minimap: { enabled: false },
          fontSize: editorFontSize,
          fontFamily: 'JetBrains Mono, monospace',
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          readOnly: !worktreeId && !onChange,
        }}
      />
      {/* Unsaved changes modal */}
      {showCloseModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            background: 'var(--phantom-surface-card, #1a1a2e)',
            border: '1px solid var(--phantom-border-subtle, rgba(255,255,255,0.12))',
            borderRadius: 12,
            padding: '24px 28px',
            maxWidth: 380,
            width: '90%',
            boxShadow: '0 16px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)',
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--phantom-text-primary, #fff)', marginBottom: 8 }}>
              Unsaved Changes
            </div>
            <div style={{ fontSize: 12, color: 'var(--phantom-text-secondary, #aaa)', lineHeight: 1.5, marginBottom: 20 }}>
              <span style={{ color: 'var(--phantom-accent-gold, #f59e0b)', fontFamily: 'JetBrains Mono, monospace' }}>
                {getFileName(filePath)}
              </span>
              {' '}has been modified. Save your changes before closing?
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleCloseCancel}
                style={{
                  padding: '6px 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                  background: 'transparent', border: '1px solid var(--phantom-border-subtle, rgba(255,255,255,0.15))',
                  color: 'var(--phantom-text-secondary, #aaa)',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCloseDiscard}
                style={{
                  padding: '6px 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                  background: 'transparent', border: '1px solid var(--phantom-status-error, #ef4444)',
                  color: 'var(--phantom-status-error, #ef4444)',
                }}
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleCloseSave}
                style={{
                  padding: '6px 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                  background: 'var(--phantom-accent-glow, #06b6d4)', border: 'none',
                  color: 'var(--phantom-surface-bg, #0a0a1a)', fontWeight: 600,
                }}
              >
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <div ref={ctxRef} style={ctxMenuStyle}>
          <button
            type="button"
            style={ctxItemStyle}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
            onClick={() => copyPath(true)}
          >
            Copy relative path
          </button>
          <button
            type="button"
            style={ctxItemStyle}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
            onClick={() => copyPath(false)}
          >
            Copy full path
          </button>
          {dirty && (
            <>
              <div style={{ height: 1, background: 'var(--phantom-border-subtle, rgba(255,255,255,0.08))', margin: '4px 0' }} />
              <button
                type="button"
                style={{ ...ctxItemStyle, color: 'var(--phantom-accent-gold, #f59e0b)' }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.08)'; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
                onClick={() => { saveFile(); setCtxMenu(null); }}
              >
                Save file
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};
