// PhantomOS v2 — Ward Manager: rule list, creator, presets
// Author: Subash Karki

import { createSignal, createEffect, Show, For } from 'solid-js';
import { Shield, Plus, Trash2, ShieldAlert } from 'lucide-solid';
import { showToast, showWarningToast } from '@/shared/Toast/Toast';
import { getWards, saveWardRule, deleteWardRule, toggleWardRule, getWardPresets, applyWardPreset } from '@/core/bindings/wards';
import type { WardRule, WardPreset } from '@/core/bindings/wards';
import { sessions } from '@/core/signals/sessions';
import * as styles from './WardManager.css';

function levelBadgeClass(level: string): string {
  switch (level) {
    case 'block': return `${styles.ruleLevelBadge} ${styles.levelBlock}`;
    case 'confirm': return `${styles.ruleLevelBadge} ${styles.levelConfirm}`;
    case 'warn': return `${styles.ruleLevelBadge} ${styles.levelWarn}`;
    default: return `${styles.ruleLevelBadge} ${styles.levelLog}`;
  }
}

const emptyRule: WardRule = {
  id: '', name: '', level: 'warn', description: '', tool: '', pattern: '',
  path_pattern: '', message: '', allow_bypass: true, enabled: true, audit: true,
  tags: [], event_type: '', session_ids: [],
};

export function WardManager() {
  const [rules, setRules] = createSignal<WardRule[]>([]);
  const [presets, setPresets] = createSignal<WardPreset[]>([]);
  const [showCreator, setShowCreator] = createSignal(false);
  const [editRule, setEditRule] = createSignal<WardRule>({ ...emptyRule });
  const [scopeToSession, setScopeToSession] = createSignal(false);
  const [selectedSessionId, setSelectedSessionId] = createSignal('');
  const [activePreset, setActivePreset] = createSignal('');

  async function refresh() {
    setRules(await getWards());
    setPresets(await getWardPresets());
  }

  createEffect(() => { refresh(); });

  async function handleToggle(ruleID: string, enabled: boolean) {
    try {
      await toggleWardRule(ruleID, enabled);
      showToast('Rule updated', `${ruleID} ${enabled ? 'enabled' : 'disabled'}`);
      await refresh();
    } catch (e) {
      showWarningToast('Error', String(e));
    }
  }

  async function handleDelete(ruleID: string) {
    try {
      await deleteWardRule(ruleID);
      await refresh();
    } catch (e) {
      showWarningToast('Error', String(e));
    }
  }

  async function handleSave() {
    const rule = editRule();
    if (!rule.id || !rule.name) {
      showWarningToast('Missing fields', 'ID and Name are required');
      return;
    }
    const toSave = { ...rule };
    if (scopeToSession() && selectedSessionId()) {
      toSave.session_ids = [selectedSessionId()];
    } else {
      toSave.session_ids = [];
    }
    try {
      await saveWardRule(toSave);
      showToast('Rule saved', toSave.name);
      setShowCreator(false);
      setEditRule({ ...emptyRule });
      setScopeToSession(false);
      await refresh();
    } catch (e) {
      showWarningToast('Error', String(e));
    }
  }

  async function handlePreset(presetID: string) {
    try {
      await applyWardPreset(presetID);
      setActivePreset(presetID);
      showToast('Preset applied', presetID);
      await refresh();
    } catch (e) {
      showWarningToast('Error', String(e));
    }
  }

  function openCreator() {
    setEditRule({ ...emptyRule });
    setScopeToSession(false);
    setShowCreator(true);
  }

  const activeSessions = () => sessions().filter(s => s.status === 'active' || s.status === 'paused');

  return (
    <div class={styles.container}>
      <div class={styles.stickyTop}>
        <div class={styles.header}>
          <span class={styles.title}>
            <Shield size={14} style={{ 'vertical-align': 'middle', 'margin-right': '6px' }} />
            Ward Rules
          </span>
          <button class={styles.addButton} onClick={openCreator}>
            <Plus size={12} /> New Rule
          </button>
        </div>

        {/* Presets */}
        <div class={styles.presetsRow}>
          <For each={presets()}>
            {(preset) => (
              <div class={`${styles.presetCard} ${activePreset() === preset.id ? styles.presetCardActive : ''}`} onClick={() => handlePreset(preset.id)}>
                <span class={styles.presetName}>{preset.name}</span>
                <span class={styles.presetDesc}>{preset.description}</span>
              </div>
            )}
          </For>
        </div>
      </div>

      {/* Inline creator form — between sticky header and scroll area */}
      <Show when={showCreator()}>
        <div class={styles.inlineForm}>
          <span class={styles.inlineFormTitle}>New Rule</span>

          <div class={styles.formRow}>
            <div class={styles.formField} style={{ flex: '1' }}>
              <label class={styles.formLabel}>ID</label>
              <input class={styles.formInput} value={editRule().id} onInput={(e) => setEditRule(r => ({ ...r, id: e.currentTarget.value }))} placeholder="my-rule-id" />
            </div>
            <div class={styles.formField} style={{ flex: '1' }}>
              <label class={styles.formLabel}>Name</label>
              <input class={styles.formInput} value={editRule().name} onInput={(e) => setEditRule(r => ({ ...r, name: e.currentTarget.value }))} placeholder="My Rule Name" />
            </div>
          </div>

          <div class={styles.formRow}>
            <div class={styles.formField} style={{ flex: '1' }}>
              <label class={styles.formLabel}>Level</label>
              <select class={styles.formSelect} value={editRule().level} onChange={(e) => setEditRule(r => ({ ...r, level: e.currentTarget.value }))}>
                <option value="block">Block (pause session)</option>
                <option value="confirm">Confirm (approval modal)</option>
                <option value="warn">Warn (toast only)</option>
                <option value="log">Log (silent)</option>
              </select>
            </div>
            <div class={styles.formField} style={{ flex: '1' }}>
              <label class={styles.formLabel}>Event Type</label>
              <select class={styles.formSelect} value={editRule().event_type} onChange={(e) => setEditRule(r => ({ ...r, event_type: e.currentTarget.value }))}>
                <option value="">All events</option>
                <option value="tool_use">Tool calls</option>
                <option value="user">User prompts</option>
                <option value="assistant">Claude responses</option>
                <option value="tool_result">Tool results</option>
              </select>
            </div>
          </div>

          <div class={styles.formRow}>
            <div class={styles.formField} style={{ flex: '1' }}>
              <label class={styles.formLabel}>Tool</label>
              <select class={styles.formSelect} value={editRule().tool} onChange={(e) => setEditRule(r => ({ ...r, tool: e.currentTarget.value }))}>
                <option value="">Any tool</option>
                <option value="Bash">Bash</option>
                <option value="Edit">Edit</option>
                <option value="Write">Write</option>
                <option value="Read">Read</option>
              </select>
            </div>
            <div class={styles.formField} style={{ flex: '1' }}>
              <label class={styles.formLabel}>Pattern (regex)</label>
              <input class={styles.formInput} value={editRule().pattern} onInput={(e) => setEditRule(r => ({ ...r, pattern: e.currentTarget.value }))} placeholder="rm\s+-rf|DROP\s+TABLE" />
            </div>
          </div>

          <div class={styles.formField}>
            <label class={styles.formLabel}>Message</label>
            <input class={styles.formInput} value={editRule().message} onInput={(e) => setEditRule(r => ({ ...r, message: e.currentTarget.value }))} placeholder="What to show when this rule triggers" />
          </div>

          <div class={styles.formRow} style={{ 'align-items': 'center' }}>
            <input type="checkbox" checked={scopeToSession()} onChange={(e) => setScopeToSession(e.currentTarget.checked)} />
            <label class={styles.formLabel} style={{ margin: '0', 'text-transform': 'none', 'letter-spacing': '0' }}>Scope to specific session</label>
          </div>

          <Show when={scopeToSession()}>
            <div class={styles.formField}>
              <label class={styles.formLabel}>Session</label>
              <select class={styles.formSelect} value={selectedSessionId()} onChange={(e) => setSelectedSessionId(e.currentTarget.value)}>
                <option value="">Select a session...</option>
                <For each={activeSessions()}>
                  {(s) => <option value={s.id}>{s.first_prompt?.slice(0, 40) || s.name || s.id.slice(0, 12)} ({s.model ?? 'unknown'})</option>}
                </For>
              </select>
            </div>
          </Show>

          <div class={styles.formActions}>
            <button class={styles.saveButton} onClick={handleSave}>Save Rule</button>
            <button class={styles.cancelButton} onClick={() => setShowCreator(false)}>Cancel</button>
          </div>
        </div>
      </Show>

      <div class={styles.scrollArea}>
      {/* Rule list */}
      <Show
        when={rules().length > 0}
        fallback={
          <div class={styles.emptyState}>
            <ShieldAlert size={24} />
            <span>No ward rules defined</span>
            <span>Create rules or apply a preset above</span>
          </div>
        }
      >
        <div class={styles.ruleList}>
          <For each={rules()}>
            {(rule) => (
              <div class={styles.ruleItem}>
                <div class={styles.ruleRow}>
                  <input type="checkbox" checked={rule.enabled} onChange={(e) => handleToggle(rule.id, e.currentTarget.checked)} class={styles.toggleSwitch} />
                  <span class={styles.ruleName}>{rule.name}</span>
                  <span class={levelBadgeClass(rule.level)}>{rule.level}</span>
                  <Show when={rule.event_type}><span class={styles.sessionBadge}>{rule.event_type}</span></Show>
                  <button class={styles.deleteButton} onClick={() => handleDelete(rule.id)}><Trash2 size={12} /></button>
                </div>
                <div class={styles.ruleDesc}>
                  {rule.message || rule.description || rule.pattern}
                  <Show when={rule.session_ids?.length > 0}>{' '}<span class={styles.sessionBadge}>scoped</span></Show>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>
      </div>
    </div>
  );
}
