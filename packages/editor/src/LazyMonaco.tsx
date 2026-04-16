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

// Disable semantic validation (red squiggles from type-checking) permanently.
// Monaco only loads a subset of project types — incomplete type info produces
// false positives that can't be fixed by ignoring individual error codes.
// IntelliSense, autocomplete, and go-to-definition still work without this.
// Real type errors are caught by the project's build toolchain / VS Code.
monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: false,
});
monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
  noSyntaxValidation: false,
});

/** Track which workspace root owns each model URI, for disposal on switch */
const modelsByWorkspace = new Map<string, Set<string>>();

/** Currently active workspace root */
let activeWorkspaceRoot: string | null = null;

/** Max models to keep from previous workspaces (LRU) */
const MAX_STALE_MODELS = 20;

/**
 * Configure Monaco's TypeScript from a workspace's tsconfig.json and
 * load type definitions from node_modules/@types. Call once per workspace.
 * Types power IntelliSense/autocomplete/go-to-definition (not diagnostics).
 */
export async function configureMonacoForWorkspace(repoPath: string): Promise<void> {
  if (!window.phantomOS?.isDesktop) return;

  // Dispose models from previous workspace, keeping LRU of recent files
  if (activeWorkspaceRoot && activeWorkspaceRoot !== repoPath) {
    const prevModels = modelsByWorkspace.get(activeWorkspaceRoot);
    if (prevModels) {
      const allModels = monaco.editor.getModels();
      // Dispose models owned by the previous workspace
      // Keep up to MAX_STALE_MODELS most recently created models (rough LRU)
      const toDispose = allModels.filter(m => prevModels.has(m.uri.toString()));
      // Keep the most recent ones (last in array = most recently created)
      const disposable = toDispose.slice(0, Math.max(0, toDispose.length - MAX_STALE_MODELS));
      for (const model of disposable) {
        model.dispose();
      }
      const kept = toDispose.length - disposable.length;
      console.log(`[Monaco] Disposed ${disposable.length} models from prev workspace, kept ${kept} LRU`);
      modelsByWorkspace.delete(activeWorkspaceRoot);
    }
  }
  activeWorkspaceRoot = repoPath;

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

    // Semantic validation stays disabled (set at module level) — types are
    // loaded for IntelliSense/autocomplete/go-to-definition, not for diagnostics.
  }

  // Phase 3: Load project source files as models for Go to Definition
  // Cap at 100 models to avoid Monaco listener leak (each model registers internal listeners)
  const MAX_SOURCE_MODELS = 100;
  const sourceFiles = await window.phantomOS.invoke(
    'phantom:scan-source-files', repoPath,
  ) as { path: string; content: string }[] | null;

  if (sourceFiles && sourceFiles.length > 0) {
    const workspaceModels = new Set<string>();
    const capped = sourceFiles.slice(0, MAX_SOURCE_MODELS);
    for (const { path, content } of capped) {
      const uri = monaco.Uri.parse(`file:///${path}`);
      if (!monaco.editor.getModel(uri)) {
        monaco.editor.createModel(content, undefined, uri);
      }
      workspaceModels.add(uri.toString());
    }
    modelsByWorkspace.set(repoPath, workspaceModels);
    console.log(`[Monaco] Loaded ${workspaceModels.size}/${sourceFiles.length} source models (capped at ${MAX_SOURCE_MODELS})`);
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
