// Phantom — Language detection from file extension
// Author: Subash Karki

const EXTENSION_MAP: Record<string, string> = {
  // Web
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  json: 'json',
  jsonc: 'json',

  // Go
  go: 'go',
  mod: 'go', // go.mod

  // Systems
  rs: 'rust',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cc: 'cpp',

  // Scripting
  py: 'python',
  rb: 'ruby',
  lua: 'lua',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  ps1: 'powershell',

  // Config
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini', // Monaco doesn't have toml; ini is close
  ini: 'ini',
  env: 'ini',
  xml: 'xml',
  svg: 'xml',

  // Markup
  md: 'markdown',
  mdx: 'markdown',
  tex: 'latex',

  // Data
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  proto: 'protobuf',

  // DevOps
  tf: 'hcl',
  hcl: 'hcl',

  // Misc
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  r: 'r',
  swift: 'swift',
  kt: 'kotlin',
  java: 'java',
  scala: 'scala',
  clj: 'clojure',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  zig: 'zig',
};

/** Well-known filenames that override extension-based detection */
const FILENAME_MAP: Record<string, string> = {
  Dockerfile: 'dockerfile',
  'Dockerfile.dev': 'dockerfile',
  'Dockerfile.prod': 'dockerfile',
  Makefile: 'makefile',
  'Makefile.toml': 'makefile',
  Justfile: 'makefile',
  '.gitignore': 'ignore',
  '.dockerignore': 'ignore',
  '.env': 'ini',
  '.env.local': 'ini',
  '.env.production': 'ini',
  'go.sum': 'plaintext',
  'go.mod': 'go',
  'tsconfig.json': 'json',
  'package.json': 'json',
};

/**
 * Detect the Monaco language ID for a given file path.
 * Uses filename-specific overrides first, then falls back to extension mapping.
 */
export const detectLanguage = (filePath: string): string => {
  const fileName = filePath.split('/').pop() ?? '';

  // Check exact filename match first
  if (FILENAME_MAP[fileName]) {
    return FILENAME_MAP[fileName];
  }

  // Extract extension (handle .css.ts, .test.ts patterns — use last segment)
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_MAP[ext] ?? 'plaintext';
};
