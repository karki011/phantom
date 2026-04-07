/**
 * Lazy-loaded Monaco Editor wrappers
 * Loads Monaco from local node_modules instead of CDN (works with strict CSP).
 * @author Subash Karki
 */
import { Suspense, lazy } from 'react';
import type { EditorProps, DiffEditorProps } from '@monaco-editor/react';
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

// Use local Monaco instead of CDN — avoids CSP script-src issues in Electron
loader.config({ monaco });

const MonacoEditor = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.Editor }))
);
const MonacoDiffEditor = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.DiffEditor }))
);

const Loading = () => (
  <div style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '100%', color: 'var(--phantom-text-muted)',
  }}>
    Loading editor...
  </div>
);

export const LazyEditor = (props: EditorProps) => (
  <Suspense fallback={<Loading />}>
    <MonacoEditor {...props} />
  </Suspense>
);

export const LazyDiffEditor = (props: DiffEditorProps) => (
  <Suspense fallback={<Loading />}>
    <MonacoDiffEditor {...props} />
  </Suspense>
);
