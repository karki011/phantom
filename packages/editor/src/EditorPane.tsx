/**
 * EditorPane — Monaco editor wired to the workspace file system.
 * Fetches file content on mount, saves on Ctrl+S.
 * @author Subash Karki
 */
import { useEffect, useRef, useState, useCallback } from 'react';
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
  const [loading, setLoading] = useState(!!worktreeId && !!filePath);
  const [editorFontSize, setEditorFontSize] = useState(13);

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

  // Fetch file content from workspace API
  useEffect(() => {
    if (!worktreeId || !filePath) return;
    setLoading(true);
    fetch(`/api/worktrees/${worktreeId}/file?path=${encodeURIComponent(filePath)}`)
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

  // Save file to workspace API
  const saveFile = useCallback(async () => {
    if (!worktreeId || !filePath || saving) return;
    setSaving(true);
    try {
      await fetch(`/api/worktrees/${worktreeId}/file`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content: contentRef.current }),
      });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [worktreeId, filePath, saving]);

  // Ctrl+S / Cmd+S to save
  useEffect(() => {
    if (!worktreeId || !filePath) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [worktreeId, filePath, saveFile]);

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
    </div>
  );
};
