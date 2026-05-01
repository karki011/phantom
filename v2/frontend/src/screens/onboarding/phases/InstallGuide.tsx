// Author: Subash Karki

import { createSignal, For, Show } from 'solid-js';
import { Check, Copy, ExternalLink } from 'lucide-solid';
import * as styles from '../styles/deps-check.css';

interface InstallGuideProps {
  /** Shell commands to display, one per row, each individually copyable. */
  commands: string[];
  /** Optional documentation URL — opens in default browser via Wails. */
  docsUrl?: string;
  /** When true, the guide starts expanded. Use for the recommended path. */
  defaultOpen?: boolean;
}

export function InstallGuide(props: InstallGuideProps) {
  const [open, setOpen] = createSignal(!!props.defaultOpen);
  const [copiedIndex, setCopiedIndex] = createSignal<number | null>(null);

  const handleCopy = async (cmd: string, index: number) => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopiedIndex(index);
      setTimeout(() => {
        if (copiedIndex() === index) setCopiedIndex(null);
      }, 1500);
    } catch {
      // Clipboard API unavailable — silently no-op. Users can select manually.
    }
  };

  const handleOpenDocs = () => {
    if (!props.docsUrl) return;
    // Wails routes window.open for HTTPS URLs to the system browser.
    window.open(props.docsUrl, '_blank');
  };

  return (
    <div class={styles.guideContainer}>
      <button
        class={styles.guideToggle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open()}
      >
        <span class={styles.guideToggleIcon} classList={{ [styles.guideToggleIconOpen]: open() }}>
          ▸
        </span>
        How to install
      </button>

      <Show when={open()}>
        <div class={styles.guideBody}>
          <For each={props.commands}>
            {(cmd, i) => (
              <div class={styles.guideCommand}>
                <code class={styles.guideCommandText}>{cmd}</code>
                <button
                  class={styles.guideCopyBtn}
                  onClick={() => handleCopy(cmd, i())}
                  title="Copy to clipboard"
                  aria-label={`Copy command: ${cmd}`}
                >
                  <Show when={copiedIndex() === i()} fallback={<Copy size={14} />}>
                    <Check size={14} />
                  </Show>
                  <span class={styles.guideCopyLabel}>
                    {copiedIndex() === i() ? 'Copied!' : 'Copy'}
                  </span>
                </button>
              </div>
            )}
          </For>

          <Show when={props.docsUrl}>
            <button class={styles.guideDocsLink} onClick={handleOpenDocs}>
              <ExternalLink size={12} />
              <span>{props.docsUrl}</span>
            </button>
          </Show>
        </div>
      </Show>
    </div>
  );
}
