/**
 * Lazy-loaded Monaco Editor wrappers
 * Loads Monaco from local node_modules instead of CDN (works with strict CSP).
 * @author Subash Karki
 */

// Configure web workers BEFORE Monaco initializes — enables off-main-thread
// syntax highlighting, validation, and IntelliSense via Vite ?worker imports.
import './monaco-workers.js';

import { Suspense, lazy } from 'react';
import type { EditorProps, DiffEditorProps } from '@monaco-editor/react';
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

// Use local Monaco instead of CDN — avoids CSP script-src issues in Electron
loader.config({ monaco });

// Default: disable semantic validation until workspace types are loaded
monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: false,
});
monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: false,
});

/**
 * Configure Monaco's TypeScript from a workspace's tsconfig.json and
 * load type definitions from node_modules/@types. Call once per workspace.
 * Re-enables semantic validation after types are loaded.
 */
export async function configureMonacoForWorkspace(repoPath: string): Promise<void> {
  if (!window.phantomOS?.isDesktop) return;

  const ts = monaco.languages.typescript;

  // Phase 1: Read tsconfig and set compiler options
  const compilerOptions = await window.phantomOS.invoke('phantom:read-tsconfig', repoPath) as Record<string, unknown> | null;

  const moduleResolutionMap: Record<string, number> = {
    node: ts.ModuleResolutionKind.NodeJs,
    node16: ts.ModuleResolutionKind.NodeJs,
    nodenext: ts.ModuleResolutionKind.NodeJs,
    bundler: ts.ModuleResolutionKind.NodeJs,
    classic: ts.ModuleResolutionKind.Classic,
  };

  const jsxMap: Record<string, number> = {
    react: ts.JsxEmit.React,
    'react-jsx': ts.JsxEmit.ReactJSX,
    'react-jsxdev': ts.JsxEmit.ReactJSXDev,
    'react-native': ts.JsxEmit.ReactNative,
    preserve: ts.JsxEmit.Preserve,
  };

  const monacoOptions: monaco.languages.typescript.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.ReactJSX,
    allowJs: true,
    strict: compilerOptions?.strict === true,
    esModuleInterop: true,
    skipLibCheck: true,
    noEmit: true,
    allowNonTsExtensions: true,
  };

  if (compilerOptions) {
    const mr = String(compilerOptions.moduleResolution ?? '').toLowerCase();
    if (mr in moduleResolutionMap) monacoOptions.moduleResolution = moduleResolutionMap[mr];

    const jsx = String(compilerOptions.jsx ?? '').toLowerCase();
    if (jsx in jsxMap) monacoOptions.jsx = jsxMap[jsx];

    if (typeof compilerOptions.baseUrl === 'string') {
      monacoOptions.baseUrl = compilerOptions.baseUrl;
    }
    if (compilerOptions.paths && typeof compilerOptions.paths === 'object') {
      monacoOptions.paths = compilerOptions.paths as Record<string, string[]>;
    }
  }

  ts.typescriptDefaults.setCompilerOptions(monacoOptions);
  ts.javascriptDefaults.setCompilerOptions(monacoOptions);

  // Phase 2: Load type definitions from node_modules
  const types = await window.phantomOS.invoke('phantom:read-types', repoPath) as { filePath: string; content: string }[] | null;

  if (types && types.length > 0) {
    for (const { filePath, content } of types) {
      ts.typescriptDefaults.addExtraLib(content, filePath);
    }

    // Re-enable semantic validation now that types are available
    // Suppress 2307 (module not found) — Monaco can't resolve workspace packages,
    // monorepo internal imports, or complex path aliases. These are false positives
    // in projects that already build. Real import errors are caught by the build toolchain.
    ts.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      diagnosticCodesToIgnore: [2307],
    });
    ts.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      diagnosticCodesToIgnore: [2307],
    });
  }
}

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
