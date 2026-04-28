// PhantomOS v2 — Markdown Preview Pane
// Author: Subash Karki

import { createSignal, onMount, Show } from 'solid-js';
import { Marked } from 'marked';
import { readFileContents } from '@/core/bindings';
import * as styles from '@/styles/markdown-preview.css';

const marked = new Marked({ gfm: true, breaks: true });

interface MarkdownPreviewPaneProps {
  filePath?: string;
  workspaceId?: string;
}

export default function MarkdownPreviewPane(props: MarkdownPreviewPaneProps) {
  const [html, setHtml] = createSignal('');
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal('');

  const fileName = () => props.filePath?.split('/').pop() ?? 'Preview';

  onMount(async () => {
    if (!props.workspaceId || !props.filePath) {
      setError('No file specified');
      setLoading(false);
      return;
    }

    try {
      const content = await readFileContents(props.workspaceId, props.filePath);
      if (!content) {
        setError('File is empty or not found');
        setLoading(false);
        return;
      }
      const rendered = await marked.parse(content);
      setHtml(rendered);
    } catch (err) {
      setError('Failed to load file');
    }
    setLoading(false);
  });

  return (
    <div class={styles.previewContainer}>
      <div class={styles.previewHeader}>
        <span class={styles.previewHeaderTitle}>{fileName()}</span>
      </div>

      <Show when={loading()}>
        <div class={styles.loadingState}>Loading...</div>
      </Show>

      <Show when={error()}>
        <div class={styles.errorState}>{error()}</div>
      </Show>

      <Show when={!loading() && !error()}>
        <div class={styles.scrollArea}>
          <div class={styles.markdownProse} innerHTML={html()} />
        </div>
      </Show>
    </div>
  );
}
