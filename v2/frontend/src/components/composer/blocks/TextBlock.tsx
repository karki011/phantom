// Author: Subash Karki

import { Show, createMemo, createSignal, createEffect, type Component } from 'solid-js';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import 'highlight.js/styles/github-dark-dimmed.min.css';
import type { ContentBlock } from '@/core/composer/types';
import { highlightCode } from '@/core/composer/highlighter';
import * as css from './TextBlock.css';

// Monotonic counter for unique blockIds — Date.now() can collide within a millisecond
let _blockCounter = 0;

// ── File-path linkification (ported from V1 ComposerPane.tsx) ─────────
// Matches relative paths (./foo, ../foo), home-rooted (~/), absolute
// paths under common roots, and well-known project directories followed
// by a file extension. Optional :line:col suffix is preserved.
const FILE_PATH_REGEX = /(?<![a-zA-Z0-9_\-/])(?:\.{1,2}\/[\w.\-/]+|~\/[\w.\-/]+|\/(?:Users|home|tmp|var|opt|etc)\/[\w.\-/]+|(?:src|lib|libs|app|apps|packages|tests?|spec|docs?|scripts?|config|\.ai|\.claude|\.github|\.vscode)\/[\w.\-/]+)(?:\.\w+)(?::\d+(?::\d+)?)?/g;
const FILE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'json', 'yaml', 'yml', 'md', 'mdx', 'css',
  'go', 'mod', 'sum', 'sh', 'bash', 'zsh', 'fish', 'conf', 'cfg', 'ini',
  'py', 'toml', 'html', 'sql', 'env', 'lock', 'mjs', 'cjs',
  'rs', 'rb', 'java', 'c', 'cpp', 'h', 'hpp', 'vue', 'svelte', 'scss',
  'less', 'graphql', 'gql', 'prisma', 'proto', 'xml', 'csv', 'txt',
]);

/**
 * Walk every text node inside `root` (skipping <pre>/<code> blocks which
 * already have their own rendering) and wrap file-path matches in
 * `<a class="file-link" data-file-path="..." data-line="..." data-col="...">`.
 */
const linkifyFilePaths = (root: HTMLElement): void => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      // Skip text inside <pre> blocks (multi-line code). Inline <code>
      // inside prose is fine — we linkify inside those.
      if (parent?.closest('pre')) return NodeFilter.FILTER_REJECT;
      // Already linkified
      if (parent?.tagName === 'A') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }

  for (const textNode of textNodes) {
    const text = textNode.textContent ?? '';
    FILE_PATH_REGEX.lastIndex = 0;
    const matches = [...text.matchAll(FILE_PATH_REGEX)];
    if (matches.length === 0) continue;

    // Validate: at least one match must end in a known extension
    const validMatches = matches.filter((m) => {
      const pathStr = m[0].replace(/:\d+(?::\d+)?$/, '');
      const ext = pathStr.split('.').pop()?.toLowerCase();
      return ext && FILE_EXTENSIONS.has(ext);
    });
    if (validMatches.length === 0) continue;

    const frag = document.createDocumentFragment();
    let lastIdx = 0;
    for (const m of validMatches) {
      const start = m.index!;
      if (start > lastIdx) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx, start)));
      }
      const raw = m[0];
      // Split off optional :line:col suffix
      const colonMatch = raw.match(/:(\d+)(?::(\d+))?$/);
      const filePart = colonMatch ? raw.slice(0, colonMatch.index) : raw;
      const line = colonMatch ? colonMatch[1] : undefined;
      const col = colonMatch ? colonMatch[2] : undefined;

      const a = document.createElement('a');
      a.className = 'file-link';
      a.textContent = raw;
      a.dataset.filePath = filePart;
      if (line) a.dataset.line = line;
      if (col) a.dataset.col = col;
      frag.appendChild(a);

      lastIdx = start + raw.length;
    }
    if (lastIdx < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIdx)));
    }
    textNode.parentNode?.replaceChild(frag, textNode);
  }
};

// ── Post-render enhancements ──────────────────────────────────────────
// After each render, walk the DOM to attach copy buttons to <pre> blocks
// and linkify file paths (DOMPurify strips inline handlers, so we wire
// via addEventListener after the fact).

const enhanceRenderedContent = (root: HTMLElement): void => {
  if (!root) return;

  // ── Copy buttons on <pre> blocks ──
  root.querySelectorAll('pre').forEach((pre) => {
    if (pre.querySelector('.copy-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    pre.style.position = 'relative';
    pre.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
    pre.addEventListener('mouseleave', () => { btn.style.opacity = '0'; });
    btn.addEventListener('click', () => {
      const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? '';
      navigator.clipboard.writeText(code);
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    });
    pre.appendChild(btn);
  });

  // ── Linkify file paths ──
  linkifyFilePaths(root);

  // ── External links -> system browser ──
  root.querySelectorAll('a[href]').forEach((a) => {
    if ((a as HTMLElement).dataset.extWired) return;
    const href = a.getAttribute('href') ?? '';
    if (href.startsWith('http://') || href.startsWith('https://')) {
      (a as HTMLElement).dataset.extWired = '1';
      a.addEventListener('click', (e) => {
        e.preventDefault();
        window.open(href, '_blank');
      });
    }
  });
};

// ── Component ─────────────────────────────────────────────────────────

interface TextBlockProps {
  block: ContentBlock;
  onFileClick?: (absPath: string) => void;
}

const TextBlock: Component<TextBlockProps> = (props) => {
  let ref: HTMLDivElement | undefined;

  // marked.parse is NEVER called during streaming -- one call per finalized block
  const parsedHtml = createMemo(() => {
    if (props.block.status !== 'complete') return '';
    const raw = marked.parse(props.block.text) as string;
    return DOMPurify.sanitize(raw);
  });

  // Signal for final HTML -- starts as parsed markdown, updated when highlights resolve.
  const [displayHtml, setDisplayHtml] = createSignal('');

  // Highlight code blocks off the main thread after markdown is rendered
  createEffect(() => {
    const html = parsedHtml();
    if (!html) {
      setDisplayHtml('');
      return;
    }

    // Parse into a detached DOM fragment to find code blocks
    const template = document.createElement('template');
    template.innerHTML = html;
    const fragment = template.content;

    const codeBlocks = fragment.querySelectorAll('pre code');
    if (codeBlocks.length === 0) {
      setDisplayHtml(html);
      return;
    }

    let pendingCount = codeBlocks.length;

    codeBlocks.forEach((codeEl, index) => {
      const code = codeEl.textContent ?? '';
      if (!code.trim()) {
        pendingCount--;
        if (pendingCount === 0) {
          setDisplayHtml(template.innerHTML);
        }
        return;
      }

      let language: string | undefined;
      const classes = codeEl.className.split(/\s+/);
      for (const cls of classes) {
        if (cls.startsWith('language-')) {
          language = cls.slice('language-'.length);
          break;
        }
      }

      const blockId = `text-code-${index}-${++_blockCounter}`;
      highlightCode(blockId, code, language, (_id, highlighted) => {
        codeEl.innerHTML = highlighted;
        codeEl.classList.add('hljs');

        pendingCount--;
        if (pendingCount === 0) {
          setDisplayHtml(template.innerHTML);
        }
      });
    });

    // Show un-highlighted markdown immediately while highlights are pending
    setDisplayHtml(html);
  });

  // Post-render enhancements (copy buttons, linkify, external links)
  createEffect(() => {
    void displayHtml(); // Track reactivity
    requestAnimationFrame(() => {
      if (ref) enhanceRenderedContent(ref);
    });
  });

  // Wire file-link clicks via event delegation on the container.
  // If onFileClick prop is provided, use it; otherwise open via the editor.
  createEffect(() => {
    void displayHtml();
    if (!ref) return;
    if ((ref as any).__fileLinkDelegated) return;
    (ref as any).__fileLinkDelegated = true;
    ref.addEventListener('click', (e) => {
      const link = (e.target as HTMLElement).closest('a.file-link');
      if (!link) return;
      e.preventDefault();
      const filePath = (link as HTMLElement).dataset.filePath;
      if (!filePath) return;
      const line = (link as HTMLElement).dataset.line;
      const col = (link as HTMLElement).dataset.col;
      if (props.onFileClick) {
        props.onFileClick(filePath);
      } else {
        import('@/core/editor/open-file').then((m) => {
          import('@/core/signals/app').then((app) => {
            m.openFileInEditor({
              workspaceId: app.activeWorktreeId() ?? '',
              filePath,
              line: line ? Number(line) : undefined,
              column: col ? Number(col) : undefined,
            });
          });
        });
      }
    });
  });

  return (
    <>
      <Show when={props.block.status === 'streaming'}>
        <pre class={css.streamingPre}>
          {props.block.text}
        </pre>
      </Show>
      <Show when={props.block.status === 'complete'}>
        <div ref={ref} class={css.assistantText} innerHTML={displayHtml()} />
      </Show>
    </>
  );
};

export default TextBlock;
