import { LazyEditor } from './LazyMonaco.js';

interface EditorPaneProps {
  paneId: string;
  filePath?: string;
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

export const EditorPane = ({
  paneId,
  filePath,
  language,
  value,
  onChange,
}: EditorPaneProps) => (
  <div style={{ width: '100%', height: '100%' }} data-pane-id={paneId}>
    <LazyEditor
      height="100%"
      language={language ?? detectLanguage(filePath)}
      value={value ?? `// ${filePath ?? 'untitled'}`}
      onChange={onChange}
      theme="vs-dark"
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        fontFamily: 'JetBrains Mono, monospace',
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        readOnly: !onChange,
      }}
    />
  </div>
);
