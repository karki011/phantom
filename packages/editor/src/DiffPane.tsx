import { LazyDiffEditor } from './LazyMonaco.js';

interface DiffPaneProps {
  paneId: string;
  original: string;
  modified: string;
  language?: string;
  filePath?: string;
  inline?: boolean;
}

export const DiffPane = ({
  paneId,
  original,
  modified,
  language,
  filePath,
  inline,
}: DiffPaneProps) => (
  <div style={{ width: '100%', height: '100%' }} data-pane-id={paneId}>
    <LazyDiffEditor
      height="100%"
      original={original}
      modified={modified}
      language={language ?? 'typescript'}
      theme="vs-dark"
      options={{
        renderSideBySide: !inline,
        minimap: { enabled: false },
        fontSize: 14,
        fontFamily: 'JetBrains Mono, monospace',
        readOnly: true,
        automaticLayout: true,
      }}
    />
  </div>
);
