/**
 * EditorPane — Monaco editor wired to the workspace file system.
 * Fetches file content on mount, saves on Ctrl+S.
 * @author Subash Karki
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { LazyEditor } from './LazyMonaco.js';

interface EditorPaneProps {
  paneId: string;
  filePath?: string;
  workspaceId?: string;
  language?: string;
  value?: string;
  onChange?: (value: string | undefined) => void;
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

/** Extract filename from path for display */
const getFileName = (path?: string): string => {
  if (!path) return 'untitled';
  return path.split('/').pop() ?? path;
};

export const EditorPane = ({
  paneId,
  filePath,
  workspaceId,
  language,
  value: initialValue,
  onChange,
}: EditorPaneProps) => {
  const [content, setContent] = useState<string>(initialValue ?? '');
  const [loading, setLoading] = useState(!!workspaceId && !!filePath);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const contentRef = useRef(content);
  contentRef.current = content;

  // Fetch file content from workspace API
  useEffect(() => {
    if (!workspaceId || !filePath) return;
    setLoading(true);
    fetch(`/api/workspaces/${workspaceId}/file?path=${encodeURIComponent(filePath)}`)
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
  }, [workspaceId, filePath]);

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
    if (!workspaceId || !filePath || saving) return;
    setSaving(true);
    try {
      await fetch(`/api/workspaces/${workspaceId}/file`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath, content: contentRef.current }),
      });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [workspaceId, filePath, saving]);

  // Ctrl+S / Cmd+S to save
  useEffect(() => {
    if (!workspaceId || !filePath) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [workspaceId, filePath, saveFile]);

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
    <div style={{ width: '100%', height: '100%', position: 'relative' }} data-pane-id={paneId}>
      {dirty && (
        <div
          style={{
            position: 'absolute',
            top: 4,
            right: 12,
            zIndex: 10,
            fontSize: 11,
            color: 'var(--phantom-text-muted, #888)',
            background: 'var(--phantom-surface-card, #1e1e1e)',
            padding: '2px 8px',
            borderRadius: 4,
            opacity: 0.8,
          }}
        >
          {saving ? 'Saving...' : 'Modified'}
        </div>
      )}
      <LazyEditor
        height="100%"
        language={language ?? detectLanguage(filePath)}
        value={content}
        onChange={handleChange}
        theme="vs-dark"
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: 'JetBrains Mono, monospace',
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          readOnly: !workspaceId && !onChange,
        }}
      />
    </div>
  );
};
