import { Suspense, lazy } from 'react';
import type { EditorProps, DiffEditorProps } from '@monaco-editor/react';

const MonacoEditor = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.Editor }))
);
const MonacoDiffEditor = lazy(() =>
  import('@monaco-editor/react').then((m) => ({ default: m.DiffEditor }))
);

const Loading = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      color: 'var(--phantom-text-muted)',
    }}
  >
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
