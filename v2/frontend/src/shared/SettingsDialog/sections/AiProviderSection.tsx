// Phantom — Settings > AI Provider section (BYOK)
// Author: Subash Karki

import { createSignal, onMount, Show } from 'solid-js';
import { Key, RefreshCw } from 'lucide-solid';
import {
  hasAnthropicApiKey,
  setAnthropicApiKey,
  clearAnthropicApiKey,
  testAnthropicApiKey,
} from '@/core/bindings/byok';
import { showToast, showWarningToast } from '@/shared/Toast/Toast';
import { buttonRecipe } from '@/styles/recipes.css';
import { vars } from '@/styles/theme.css';
import * as styles from '../SettingsDialog.css';

type Mode = 'subscription' | 'byok';

export default function AiProviderSection() {
  const [mode, setMode] = createSignal<Mode>('subscription');
  const [keyInput, setKeyInput] = createSignal('');
  const [hasStored, setHasStored] = createSignal(false);
  const [busy, setBusy] = createSignal<'save' | 'test' | 'clear' | null>(null);
  const [maskedHint, setMaskedHint] = createSignal('');

  onMount(async () => {
    const stored = await hasAnthropicApiKey();
    setHasStored(stored);
    setMode(stored ? 'byok' : 'subscription');
    if (stored) setMaskedHint('sk-ant-•••••••••••');
  });

  const handleSave = async () => {
    const key = keyInput().trim();
    if (!key) {
      showWarningToast('No API key', 'Paste your Anthropic API key first.');
      return;
    }
    setBusy('save');
    const r = await setAnthropicApiKey(key);
    setBusy(null);
    if (!r.ok) {
      showWarningToast('Save failed', r.error ?? 'Could not write to Keychain');
      return;
    }
    setHasStored(true);
    setMaskedHint(maskKey(key));
    setKeyInput('');
    showToast('API key saved', 'Stored in macOS Keychain');
  };

  const handleTest = async () => {
    const key = keyInput().trim() || ''; // empty key tests stored key by re-reading from Keychain (caller path)
    if (!key) {
      showWarningToast('No API key', 'Paste a key to test, or save first.');
      return;
    }
    setBusy('test');
    const r = await testAnthropicApiKey(key);
    setBusy(null);
    if (r.ok) {
      showToast('Valid API key', 'Anthropic accepted the test request.');
    } else {
      showWarningToast('Invalid API key', r.error ?? 'Anthropic rejected the test request.');
    }
  };

  const handleClear = async () => {
    setBusy('clear');
    const r = await clearAnthropicApiKey();
    setBusy(null);
    if (!r.ok) {
      showWarningToast('Clear failed', r.error ?? 'Could not remove from Keychain');
      return;
    }
    setHasStored(false);
    setMode('subscription');
    setMaskedHint('');
    setKeyInput('');
    showToast('Cleared', 'Reverted to claude subscription.');
  };

  return (
    <div class={styles.sectionRoot}>
      <div class={styles.settingGroup}>
        <span class={styles.settingLabel}>AI Provider</span>
        <div class={styles.settingDescription}>
          Composer and Chat call the <code>claude</code> CLI. By default they use your Claude
          subscription (the same one you sign in to in Terminal). Provide your own Anthropic API
          key to bill against your Anthropic console account instead. The key is stored in the
          macOS Keychain and injected as <code>ANTHROPIC_API_KEY</code> at spawn time only.
        </div>

        <label
          style={{
            display: 'flex',
            'align-items': 'center',
            gap: '8px',
            margin: `${vars.space.xs} 0`,
          }}
        >
          <input
            type="radio"
            name="ai-provider-mode"
            value="subscription"
            checked={mode() === 'subscription'}
            onChange={() => setMode('subscription')}
          />
          <span>Use Claude subscription (default)</span>
        </label>

        <label
          style={{
            display: 'flex',
            'align-items': 'center',
            gap: '8px',
            margin: `${vars.space.xs} 0`,
          }}
        >
          <input
            type="radio"
            name="ai-provider-mode"
            value="byok"
            checked={mode() === 'byok'}
            onChange={() => setMode('byok')}
          />
          <span>Use my own Anthropic API key</span>
        </label>
      </div>

      <Show when={mode() === 'byok'}>
        <div class={styles.settingGroup}>
          <span class={styles.settingLabel}>
            <Key size={12} style={{ 'vertical-align': 'middle', 'margin-right': '4px' }} />
            Anthropic API Key
          </span>

          <Show when={hasStored() && maskedHint()}>
            <div class={styles.settingDescription} style={{ 'font-family': vars.font.mono }}>
              Stored: {maskedHint()}
            </div>
          </Show>

          <input
            type="password"
            placeholder={hasStored() ? 'Replace stored key…' : 'sk-ant-...'}
            value={keyInput()}
            onInput={(e) => setKeyInput(e.currentTarget.value)}
            style={{
              width: '100%',
              padding: '8px',
              'border-radius': vars.radius.sm,
              border: `1px solid ${vars.color.border}`,
              background: vars.color.bgPrimary,
              color: vars.color.textPrimary,
              'font-family': vars.font.mono,
              'font-size': vars.fontSize.sm,
            }}
          />

          <div style={{ display: 'flex', gap: '8px', 'margin-top': vars.space.sm }}>
            <button
              type="button"
              class={buttonRecipe({ variant: 'primary', size: 'sm' })}
              disabled={busy() !== null}
              onClick={handleSave}
            >
              {busy() === 'save' ? <RefreshCw size={12} /> : null} Save
            </button>
            <button
              type="button"
              class={buttonRecipe({ variant: 'outline', size: 'sm' })}
              disabled={busy() !== null}
              onClick={handleTest}
            >
              {busy() === 'test' ? <RefreshCw size={12} /> : null} Test key
            </button>
            <Show when={hasStored()}>
              <button
                type="button"
                class={buttonRecipe({ variant: 'ghost', size: 'sm' })}
                disabled={busy() !== null}
                onClick={handleClear}
              >
                Clear
              </button>
            </Show>
          </div>

          <div class={styles.settingDescription} style={{ 'margin-top': vars.space.sm }}>
            Test runs <code>claude -p "ping"</code> with the candidate key in the env. The key is
            never written to logs.
          </div>
        </div>
      </Show>
    </div>
  );
}

function maskKey(key: string): string {
  if (key.length <= 12) return '•'.repeat(key.length);
  return `${key.slice(0, 7)}${'•'.repeat(11)}${key.slice(-4)}`;
}
