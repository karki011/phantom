// Author: Subash Karki

import { createHighlighterCore } from 'shiki/core';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import type { HighlighterCore } from 'shiki/core';

let highlighter: HighlighterCore | null = null;
let initPromise: Promise<HighlighterCore> | null = null;

const LANG_MODULES: Record<string, () => Promise<any>> = {
  typescript: () => import('shiki/langs/typescript.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  ruby: () => import('shiki/langs/ruby.mjs'),
  shell: () => import('shiki/langs/shellscript.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  swift: () => import('shiki/langs/swift.mjs'),
  kotlin: () => import('shiki/langs/kotlin.mjs'),
  lua: () => import('shiki/langs/lua.mjs'),
  dockerfile: () => import('shiki/langs/dockerfile.mjs'),
  graphql: () => import('shiki/langs/graphql.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
  ini: () => import('shiki/langs/ini.mjs'),
  xml: () => import('shiki/langs/xml.mjs'),
  scss: () => import('shiki/langs/scss.mjs'),
  less: () => import('shiki/langs/less.mjs'),
};

export async function getHighlighter(): Promise<HighlighterCore> {
  if (highlighter) return highlighter;
  if (initPromise) return initPromise;

  initPromise = createHighlighterCore({
    themes: [import('shiki/themes/github-dark.mjs')],
    langs: [],
    engine: createOnigurumaEngine(import('shiki/wasm')),
  }).then((h) => {
    highlighter = h;
    return h;
  });

  return initPromise;
}

export async function loadLanguage(lang: string): Promise<string> {
  const h = await getHighlighter();
  const loaded = h.getLoadedLanguages();

  const shikiLang = lang === 'shell' ? 'shellscript' : lang;

  if (loaded.includes(shikiLang)) return shikiLang;

  const loader = LANG_MODULES[lang];
  if (loader) {
    try {
      await h.loadLanguage(await loader());
      return shikiLang;
    } catch {
      return 'plaintext';
    }
  }
  return 'plaintext';
}

export interface HighlightedToken {
  content: string;
  color?: string;
  fontStyle?: string;
}

export interface HighlightedLine {
  tokens: HighlightedToken[];
}

export async function highlightCode(code: string, lang: string): Promise<HighlightedLine[]> {
  const h = await getHighlighter();
  const resolvedLang = await loadLanguage(lang);

  if (resolvedLang === 'plaintext') {
    return code.split('\n').map((line) => ({
      tokens: [{ content: line || ' ' }],
    }));
  }

  const result = h.codeToTokens(code, {
    lang: resolvedLang,
    theme: 'github-dark',
  });

  return result.tokens.map((lineTokens) => ({
    tokens: lineTokens.map((t) => ({
      content: t.content,
      color: t.color,
      fontStyle: t.fontStyle === 1 ? 'italic' : undefined,
    })),
  }));
}
