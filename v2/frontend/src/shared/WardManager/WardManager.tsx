// Phantom — Ward Manager: rule list, creator, presets
// Author: Subash Karki

import { createSignal, createEffect, Show, For } from 'solid-js';
import { Shield, Plus, Trash2, ShieldAlert, Pencil } from 'lucide-solid';
import { Checkbox } from '@kobalte/core/checkbox';
import { showWarningToast } from '@/shared/Toast/Toast';
import { getWards, saveWardRule, deleteWardRule, toggleWardRule, getWardPresets, applyWardPreset } from '@/core/bindings/wards';
import type { WardRule, WardPreset } from '@/core/bindings/wards';
import { sessions } from '@/core/signals/sessions';
import { onWailsEvent } from '@/core/events';
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
  const [isEditing, setIsEditing] = createSignal(false);

  async function refresh() {
    setRules(await getWards());
    setPresets(await getWardPresets());
  }

  createEffect(() => { refresh(); });
  onWailsEvent('ward:rules_reloaded', () => { refresh(); });

  async function handleToggle(ruleID: string, enabled: boolean) {
    try {
      await toggleWardRule(ruleID, enabled);
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
      setShowCreator(false);
      setIsEditing(false);
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
      await refresh();
    } catch (e) {
      showWarningToast('Error', String(e));
    }
  }

  function openCreator() {
    setEditRule({ ...emptyRule });
    setScopeToSession(false);
    setIsEditing(false);
    setShowCreator(true);
  }

  function openEditor(rule: WardRule) {
    setEditRule({ ...rule });
    setScopeToSession(rule.session_ids?.length > 0);
    if (rule.session_ids?.length > 0) {
      setSelectedSessionId(rule.session_ids[0]);
    }
    setIsEditing(true);
    setShowCreator(true);
  }

  const activeSessions = () => sessions().filter(s => s.status === 'active' || s.status === 'paused');

  return (
    <div class={styles.container}>
      <div class={styles.stickyTop}>
        <div class={styles.header}>
          <span class={styles.title}>
            <Shield size={14} class={styles.shieldIcon} />
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
          <span class={styles.inlineFormTitle}>{isEditing() ? 'Edit Rule' : 'New Rule'}</span>

          <div class={styles.formRow}>
            <div class={styles.formFieldFlex}>
              <label class={styles.formLabel}>ID</label>
              <input class={styles.formInput} value={editRule().id}
                onInput={(e) => setEditRule(r => ({ ...r, id: e.currentTarget.value }))}
                placeholder="my-rule-id"
                readOnly={isEditing()}
                style={isEditing() ? { opacity: '0.6' } : {}} />
            </div>
            <div class={styles.formFieldFlex}>
              <label class={styles.formLabel}>Name</label>
              <input class={styles.formInput} value={editRule().name} onInput={(e) => setEditRule(r => ({ ...r, name: e.currentTarget.value }))} placeholder="My Rule Name" />
            </div>
          </div>

          <div class={styles.formRow}>
            <div class={styles.formFieldFlex}>
              <label class={styles.formLabel}>Level</label>
              <select class={styles.formSelect} value={editRule().level} onChange={(e) => setEditRule(r => ({ ...r, level: e.currentTarget.value }))}>
                <option value="block">Block (pause session)</option>
                <option value="confirm">Confirm (approval modal)</option>
                <option value="warn">Warn (toast only)</option>
                <option value="log">Log (silent)</option>
              </select>
            </div>
            <div class={styles.formFieldFlex}>
              <label class={styles.formLabel}>Event Type</label>
              <select class={styles.formSelect} value={editRule().event_type} onChange={(e) => setEditRule(r => ({ ...r, event_type: e.currentTarget.value }))}>
                <option value="">All events</option>
                <option value="tool_use">Tool calls</option>
                <option value="user">User prompts</option>
                <option value="assistant">AI responses</option>
                <option value="tool_result">Tool results</option>
              </select>
            </div>
          </div>

          <div class={styles.formRow}>
            <div class={styles.formFieldFlex}>
              <label class={styles.formLabel}>Tool</label>
              <select class={styles.formSelect} value={editRule().tool} onChange={(e) => setEditRule(r => ({ ...r, tool: e.currentTarget.value }))}>
                <option value="">Any tool</option>
                <option value="Bash">Bash</option>
                <option value="Edit">Edit</option>
                <option value="Write">Write</option>
                <option value="Read">Read</option>
              </select>
            </div>
            <div class={styles.formFieldFlex}>
              <label class={styles.formLabel}>Pattern (regex)</label>
              <input class={styles.formInput} value={editRule().pattern} onInput={(e) => setEditRule(r => ({ ...r, pattern: e.currentTarget.value }))} placeholder="rm\s+-rf|DROP\s+TABLE" />
            </div>
            <div class={styles.formFieldFlex}>
              <label class={styles.formLabel}>Path Pattern (regex)</label>
              <input class={styles.formInput} value={editRule().path_pattern}
                onInput={(e) => setEditRule(r => ({ ...r, path_pattern: e.currentTarget.value }))}
                placeholder="^/(etc|usr)/" />
            </div>
          </div>

          <div class={styles.formField}>
            <label class={styles.formLabel}>Message</label>
            <input class={styles.formInput} value={editRule().message} onInput={(e) => setEditRule(r => ({ ...r, message: e.currentTarget.value }))} placeholder="What to show when this rule triggers" />
          </div>

          <div class={styles.formField}>
            <label class={styles.formLabel}>Description</label>
            <input class={styles.formInput} value={editRule().description}
              onInput={(e) => setEditRule(r => ({ ...r, description: e.currentTarget.value }))}
              placeholder="Internal note about this rule" />
          </div>

          <div class={styles.formRowCenter}>
            <Checkbox class={styles.checkboxRoot} checked={editRule().allow_bypass} onChange={(checked) => setEditRule(r => ({ ...r, allow_bypass: checked }))}>
              <Checkbox.Input />
              <Checkbox.Control class={styles.checkboxControl}>
                <Checkbox.Indicator class={styles.checkboxIndicator}>✓</Checkbox.Indicator>
              </Checkbox.Control>
              <Checkbox.Label class={styles.checkboxLabelReset}>Allow bypass</Checkbox.Label>
            </Checkbox>
            <Checkbox class={styles.checkboxRoot} checked={editRule().audit} onChange={(checked) => setEditRule(r => ({ ...r, audit: checked }))}>
              <Checkbox.Input />
              <Checkbox.Control class={styles.checkboxControl}>
                <Checkbox.Indicator class={styles.checkboxIndicator}>✓</Checkbox.Indicator>
              </Checkbox.Control>
              <Checkbox.Label class={styles.checkboxLabelReset}>Audit trail</Checkbox.Label>
            </Checkbox>
          </div>

          <div class={styles.formField}>
            <label class={styles.formLabel}>Tags</label>
            <input class={styles.formInput} value={editRule().tags?.join(', ') ?? ''}
              onInput={(e) => setEditRule(r => ({ ...r, tags: e.currentTarget.value.split(',').map(t => t.trim()).filter(Boolean) }))}
              placeholder="filesystem, destructive, git" />
          </div>

          <Checkbox class={styles.checkboxRoot} checked={scopeToSession()} onChange={(checked) => setScopeToSession(checked)}>
            <Checkbox.Input />
            <Checkbox.Control class={styles.checkboxControl}>
              <Checkbox.Indicator class={styles.checkboxIndicator}>✓</Checkbox.Indicator>
            </Checkbox.Control>
            <Checkbox.Label class={styles.checkboxLabelReset}>Scope to specific session</Checkbox.Label>
          </Checkbox>

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
                  <Checkbox class={styles.checkboxRoot} checked={rule.enabled} onChange={(checked) => handleToggle(rule.id, checked)}>
                    <Checkbox.Input />
                    <Checkbox.Control class={styles.checkboxControl}>
                      <Checkbox.Indicator class={styles.checkboxIndicator}>✓</Checkbox.Indicator>
                    </Checkbox.Control>
                  </Checkbox>
                  <span class={styles.ruleName}>{rule.name}</span>
                  <span class={levelBadgeClass(rule.level)}>{rule.level}</span>
                  <Show when={rule.event_type}><span class={styles.sessionBadge}>{rule.event_type}</span></Show>
                  <button class={styles.editButton} onClick={() => openEditor(rule)}><Pencil size={12} /></button>
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
