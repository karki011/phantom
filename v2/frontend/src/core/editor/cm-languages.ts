// Author: Subash Karki

import type { Extension } from '@codemirror/state';

type LanguageLoader = () => Promise<Extension>;

/** Lazy loaders keyed by canonical language ID. */
const LANGUAGE_MAP: Record<string, LanguageLoader> = {
  javascript: () =>
    import('@codemirror/lang-javascript').then((m) =>
      m.javascript({ jsx: true, typescript: false }),
    ),
  typescript: () =>
    import('@codemirror/lang-javascript').then((m) =>
      m.javascript({ jsx: true, typescript: true }),
    ),
  jsx: () =>
    import('@codemirror/lang-javascript').then((m) =>
      m.javascript({ jsx: true }),
    ),
  tsx: () =>
    import('@codemirror/lang-javascript').then((m) =>
      m.javascript({ jsx: true, typescript: true }),
    ),
  python: () => import('@codemirror/lang-python').then((m) => m.python()),
  go: () => import('@codemirror/lang-go').then((m) => m.go()),
  rust: () => import('@codemirror/lang-rust').then((m) => m.rust()),
  html: () => import('@codemirror/lang-html').then((m) => m.html()),
  css: () => import('@codemirror/lang-css').then((m) => m.css()),
  json: () => import('@codemirror/lang-json').then((m) => m.json()),
  markdown: () =>
    import('@codemirror/lang-markdown').then((m) => m.markdown()),
  sql: () => import('@codemirror/lang-sql').then((m) => m.sql()),
  java: () => import('@codemirror/lang-java').then((m) => m.java()),
  cpp: () => import('@codemirror/lang-cpp').then((m) => m.cpp()),
  c: () => import('@codemirror/lang-cpp').then((m) => m.cpp()),
  xml: () => import('@codemirror/lang-xml').then((m) => m.xml()),
  yaml: () => import('@codemirror/lang-yaml').then((m) => m.yaml()),
};

/** Maps file extensions to canonical language IDs. */
const EXT_MAP: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  jsx: 'jsx',
  tsx: 'tsx',
  py: 'python',
  pyw: 'python',
  go: 'go',
  rs: 'rust',
  html: 'html',
  htm: 'html',
  svelte: 'html',
  vue: 'html',
  css: 'css',
  scss: 'css',
  less: 'css',
  json: 'json',
  jsonc: 'json',
  md: 'markdown',
  mdx: 'markdown',
  sql: 'sql',
  java: 'java',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hxx: 'cpp',
  h: 'cpp',
  c: 'c',
  xml: 'xml',
  svg: 'xml',
  xsl: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
};

/**
 * Lazily load a CM6 language extension given a language ID, file extension,
 * or full file path (e.g. "typescript", "ts", "src/main.tsx").
 *
 * Returns `null` when no matching language is found.
 */
export async function loadLanguage(
  langOrPath: string,
): Promise<Extension | null> {
  let langId = langOrPath.toLowerCase();

  // If it looks like a file path or has an extension, extract ext
  if (langId.includes('.')) {
    const ext = langId.split('.').pop() ?? '';
    langId = EXT_MAP[ext] ?? ext;
  }

  // Direct language ID lookup
  if (LANGUAGE_MAP[langId]) {
    return LANGUAGE_MAP[langId]();
  }

  // Fallback: extension → language ID
  if (EXT_MAP[langId]) {
    const mapped = EXT_MAP[langId];
    if (LANGUAGE_MAP[mapped]) {
      return LANGUAGE_MAP[mapped]();
    }
  }

  return null;
}
