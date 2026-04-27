// PhantomOS v2 — Add custom provider dialog
// Author: Subash Karki

import { createSignal, Show, type Accessor } from 'solid-js';
import { PhantomModal } from '@/shared/PhantomModal/PhantomModal';
import { buttonRecipe } from '@/styles/recipes.css';
import * as settingsStyles from '@/shared/SettingsDialog/SettingsDialog.css';
import * as styles from './AddProviderDialog.css';

interface AddProviderDialogProps {
  open: Accessor<boolean>;
  onOpenChange: (open: boolean) => void;
  onAdd: (yaml: string) => void;
}

export function AddProviderDialog(props: AddProviderDialogProps) {
  const [mode, setMode] = createSignal<'form' | 'yaml'>('form');
  const [name, setName] = createSignal('');
  const [displayName, setDisplayName] = createSignal('');
  const [binary, setBinary] = createSignal('');
  const [sessionsPath, setSessionsPath] = createSignal('');
  const [conversationsPath, setConversationsPath] = createSignal('');
  const [newSessionCmd, setNewSessionCmd] = createSignal('');
  const [rawYaml, setRawYaml] = createSignal('');

  const resetForm = () => {
    setName('');
    setDisplayName('');
    setBinary('');
    setSessionsPath('');
    setConversationsPath('');
    setNewSessionCmd('');
    setRawYaml('');
  };

  const buildYamlFromForm = (): string => {
    const lines: string[] = [
      `${name()}:`,
      `  display_name: "${displayName() || name()}"`,
      `  icon: "${name()}"`,
    ];
    if (binary()) lines.push(`  binary: "${binary()}"`);
    if (newSessionCmd()) {
      lines.push(`  commands:`);
      lines.push(`    new_session: "${newSessionCmd()}"`);
    }
    if (sessionsPath() || conversationsPath()) {
      lines.push(`  paths:`);
      if (sessionsPath()) lines.push(`    sessions: "${sessionsPath()}"`);
      if (conversationsPath()) lines.push(`    conversations: "${conversationsPath()}"`);
    }
    return lines.join('\n');
  };

  const handleAdd = () => {
    const yaml = mode() === 'yaml' ? rawYaml() : buildYamlFromForm();
    if (!yaml.trim()) return;
    props.onAdd(yaml);
    resetForm();
    props.onOpenChange(false);
  };

  const canSubmit = () => {
    if (mode() === 'yaml') return rawYaml().trim().length > 0;
    return name().trim().length > 0;
  };

  return (
    <PhantomModal
      open={props.open}
      onOpenChange={(open) => {
        if (!open) resetForm();
        props.onOpenChange(open);
      }}
      title="Add Custom Provider"
      size="md"
    >
      <div class={styles.form}>
        {/* Mode toggle */}
        <div class={styles.modeToggle}>
          <div class={settingsStyles.segmentedControl}>
            <button
              type="button"
              class={`${settingsStyles.segmentedButton} ${mode() === 'form' ? settingsStyles.segmentedButtonActive : ''}`}
              onClick={() => setMode('form')}
            >
              Form
            </button>
            <button
              type="button"
              class={`${settingsStyles.segmentedButton} ${mode() === 'yaml' ? settingsStyles.segmentedButtonActive : ''}`}
              onClick={() => setMode('yaml')}
            >
              YAML
            </button>
          </div>
        </div>

        <Show when={mode() === 'form'}>
          <div class={styles.fieldGroup}>
            <label class={styles.fieldLabel}>Provider Name *</label>
            <input
              type="text"
              class={styles.fieldInput}
              placeholder="my-provider"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
            />
            <span class={styles.fieldHint}>Unique identifier (lowercase, no spaces)</span>
          </div>

          <div class={styles.fieldGroup}>
            <label class={styles.fieldLabel}>Display Name</label>
            <input
              type="text"
              class={styles.fieldInput}
              placeholder="My Provider"
              value={displayName()}
              onInput={(e) => setDisplayName(e.currentTarget.value)}
            />
          </div>

          <div class={styles.fieldGroup}>
            <label class={styles.fieldLabel}>CLI Binary</label>
            <input
              type="text"
              class={styles.fieldInput}
              placeholder="my-cli"
              value={binary()}
              onInput={(e) => setBinary(e.currentTarget.value)}
            />
            <span class={styles.fieldHint}>Name of the CLI executable</span>
          </div>

          <div class={styles.fieldGroup}>
            <label class={styles.fieldLabel}>Sessions Path</label>
            <input
              type="text"
              class={styles.fieldInput}
              placeholder="~/.my-provider/sessions"
              value={sessionsPath()}
              onInput={(e) => setSessionsPath(e.currentTarget.value)}
            />
          </div>

          <div class={styles.fieldGroup}>
            <label class={styles.fieldLabel}>Conversations Path</label>
            <input
              type="text"
              class={styles.fieldInput}
              placeholder="~/.my-provider/conversations"
              value={conversationsPath()}
              onInput={(e) => setConversationsPath(e.currentTarget.value)}
            />
          </div>

          <div class={styles.fieldGroup}>
            <label class={styles.fieldLabel}>New Session Command</label>
            <input
              type="text"
              class={styles.fieldInput}
              placeholder="my-cli chat"
              value={newSessionCmd()}
              onInput={(e) => setNewSessionCmd(e.currentTarget.value)}
            />
          </div>
        </Show>

        <Show when={mode() === 'yaml'}>
          <div class={styles.fieldGroup}>
            <label class={styles.fieldLabel}>Provider YAML</label>
            <textarea
              class={styles.fieldTextarea}
              placeholder={`my-provider:\n  display_name: "My Provider"\n  binary: "my-cli"\n  commands:\n    new_session: "my-cli chat"\n  paths:\n    sessions: "~/.my-provider/sessions"`}
              value={rawYaml()}
              onInput={(e) => setRawYaml(e.currentTarget.value)}
            />
            <span class={styles.fieldHint}>Paste raw YAML configuration for the provider</span>
          </div>
        </Show>

        <div class={styles.actions}>
          <button
            type="button"
            class={buttonRecipe({ variant: 'ghost', size: 'md' })}
            onClick={() => props.onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            class={buttonRecipe({ variant: 'primary', size: 'md' })}
            onClick={handleAdd}
            disabled={!canSubmit()}
          >
            Add Provider
          </button>
        </div>
      </div>
    </PhantomModal>
  );
}
