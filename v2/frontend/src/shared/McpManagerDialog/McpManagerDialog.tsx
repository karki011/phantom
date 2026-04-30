// Phantom — MCP Manager dialog: list/toggle MCP servers from ~/.mcp.json.
// Author: Subash Karki

import { createSignal, For, Show } from 'solid-js';
import { TextField } from '@kobalte/core/text-field';
import { Switch as KobalteSwitch } from '@kobalte/core/switch';
import { Plug, Sparkles } from 'lucide-solid';
import { PhantomModal, phantomModalStyles } from '@/shared/PhantomModal/PhantomModal';
import { showToast, showWarningToast } from '@/shared/Toast/Toast';
import {
  mcpManagerOpen,
  closeMcpManager,
  mcpServers,
  refreshMcpServers,
  toggleMcpServer,
} from '@/core/signals/mcp';
import { registerPhantomMCP } from '@/core/bindings/mcp';
import { buttonRecipe } from '@/styles/recipes.css';
import * as switchStyles from '@/shared/SettingsDialog/SettingsDialog.css';
import * as styles from './McpManagerDialog.css';

export function McpManagerDialog() {
  const [filter, setFilter] = createSignal('');
  const [registering, setRegistering] = createSignal(false);

  const filtered = () => {
    const all = mcpServers() ?? [];
    const q = filter().trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.command.toLowerCase().includes(q) ||
        s.args.join(' ').toLowerCase().includes(q),
    );
  };

  async function handleToggle(name: string, next: boolean) {
    const err = await toggleMcpServer(name, next);
    if (err) {
      showWarningToast('Toggle failed', err);
    } else {
      showToast(next ? 'Enabled' : 'Disabled', name);
    }
  }

  async function handleRegisterPhantom() {
    setRegistering(true);
    const err = await registerPhantomMCP();
    setRegistering(false);
    if (err) {
      showWarningToast('Registration failed', err);
      return;
    }
    showToast('phantom-ai registered', 'Restart Claude Code to activate');
    void refreshMcpServers();
  }

  function handleOpenChange(open: boolean) {
    if (!open) closeMcpManager();
  }

  return (
    <PhantomModal
      open={mcpManagerOpen}
      onOpenChange={handleOpenChange}
      title="MCP Servers"
      description="Toggle which Model Context Protocol servers Claude Code activates per session."
      size="lg"
    >
      <div class={styles.form}>
        <TextField class={styles.textFieldRoot} value={filter()} onChange={setFilter}>
          <TextField.Label class={styles.textFieldLabel}>Filter servers</TextField.Label>
          <TextField.Input
            class={styles.textFieldInput}
            placeholder="Type to filter by name, command, or args…"
            autofocus
          />
        </TextField>

        <Show
          when={(mcpServers() ?? []).length > 0}
          fallback={
            <div class={styles.emptyState}>
              <Plug size={28} class={styles.emptyIcon} />
              <div class={styles.emptyTitle}>No MCP servers registered</div>
              <div class={styles.emptyHint}>
                Add a server to <code class={styles.emptyCode}>~/.mcp.json</code> or register
                phantom-ai now to expose graph context to Claude Code.
              </div>
              <button
                type="button"
                class={buttonRecipe({ variant: 'primary', size: 'md' })}
                onClick={handleRegisterPhantom}
                disabled={registering()}
              >
                <Sparkles size={14} />
                {registering() ? 'Registering…' : 'Register phantom-ai'}
              </button>
            </div>
          }
        >
          <div class={styles.serverList}>
            <Show
              when={filtered().length > 0}
              fallback={<div class={styles.noMatch}>No servers match "{filter()}"</div>}
            >
              <For each={filtered()}>
                {(server) => (
                  <div class={styles.serverRow}>
                    <div class={styles.serverInfo}>
                      <div class={styles.serverName}>{server.name}</div>
                      <div class={styles.serverCmd}>
                        <span class={styles.cmdBin}>{server.command || '(no command)'}</span>
                        <Show when={server.args.length > 0}>
                          <span class={styles.cmdArgs}>{' '}{server.args.join(' ')}</span>
                        </Show>
                      </div>
                    </div>
                    <KobalteSwitch
                      class={switchStyles.switchRoot}
                      checked={server.enabled}
                      onChange={(next) => void handleToggle(server.name, next)}
                    >
                      <KobalteSwitch.Input />
                      <KobalteSwitch.Control class={switchStyles.switchControl}>
                        <KobalteSwitch.Thumb class={switchStyles.switchThumb} />
                      </KobalteSwitch.Control>
                    </KobalteSwitch>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </Show>
      </div>

      <div class={phantomModalStyles.actions}>
        <button
          type="button"
          class={buttonRecipe({ variant: 'ghost', size: 'md' })}
          onClick={closeMcpManager}
        >
          Close
        </button>
      </div>
    </PhantomModal>
  );
}
