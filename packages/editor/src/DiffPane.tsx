/**
 * DiffPane — Monaco diff editor with folded unchanged regions.
 * Modified side is editable for unstaged changes, with Ctrl+S save.
 * @author Subash Karki
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { LazyDiffEditor } from './LazyMonaco.js';

const API_BASE = typeof window !== 'undefined' ? (window as any).__PHANTOM_API_BASE ?? '' : '';

interface DiffPaneProps {
  paneId: string;
  original: string;
  modified: string;
  language?: string;
  filePath?: string;
  worktreeId?: string;
  inline?: boolean;
  /** If true, the modified side is read-only (e.g. staged files) */
  readOnly?: boolean;
}

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

export const DiffPane = ({
  paneId,
  original,
  modified,
  language,
  filePath,
  worktreeId,
  inline,
  readOnly,
}: DiffPaneProps) => {
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const contentRef = useRef(modified);
  const editable = !readOnly && !!worktreeId && !!filePath;

  const handleModifiedChange = useCallback((value: string | undefined) => {
    if (!editable) return;
    contentRef.current = value ?? '';
    setDirty(true);
  }, [editable]);

  const saveFile = useCallback(async () => {
    if (!editable || saving) return;
    setSaving(true);
    try {
      await fetch(`${API_BASE}/api/worktrees/${worktreeId}/file`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content: contentRef.current }),
      });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [worktreeId, filePath, editable, saving]);

  // Ctrl+S / Cmd+S to save
  useEffect(() => {
    if (!editable) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editable, saveFile]);

  const fileName = filePath?.split('/').pop() ?? 'diff';

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }} data-pane-id={paneId}>
      {/* Toolbar */}
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
        <span style={{ color: 'var(--phantom-accent-gold, #f59e0b)', fontWeight: 600 }}>±</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fileName}
        </span>
        {editable && dirty && (
          <span style={{ color: 'var(--phantom-accent-gold, #f59e0b)' }}>
            {saving ? 'Saving...' : 'Modified — Ctrl+S to save'}
          </span>
        )}
        {!editable && (
          <span style={{ opacity: 0.6 }}>read-only</span>
        )}
      </div>

      {/* Diff editor */}
      <LazyDiffEditor
        height="100%"
        original={original}
        modified={modified}
        language={language ?? detectLanguage(filePath)}
        theme="vs-dark"
        onMount={(editor) => {
          // Track changes on the modified editor
          if (editable) {
            const modifiedEditor = editor.getModifiedEditor();
            modifiedEditor.onDidChangeModelContent(() => {
              contentRef.current = modifiedEditor.getValue();
              setDirty(true);
            });
          }
        }}
        options={{
          renderSideBySide: !inline,
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: 'JetBrains Mono, monospace',
          readOnly: !editable,
          originalEditable: false,
          automaticLayout: true,
          scrollBeyondLastLine: false,
          // Fold unchanged regions to focus on changes
          hideUnchangedRegions: {
            enabled: true,
            revealLineCount: 3,
            minimumLineCount: 5,
            contextLineCount: 3,
          },
        }}
      />
    </div>
  );
};
