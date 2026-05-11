// Author: Subash Karki
import { createSignal, Show, For } from 'solid-js'
import { MilkdownEditor } from '@/shared/MilkdownEditor/MilkdownEditor'
import { Select } from '@kobalte/core/select'
import {
  Send, Square, Paperclip, X, GlobeLock, FolderOpen, ChevronDown,
  ShieldCheck, ShieldOff, ShieldAlert, Brain, Type, BookOpen, ListTodo,
} from 'lucide-solid'
import type { ComposerMode, PermissionMode, EffortLevel, EditorContext } from '@/core/composer/types'
import { showWarningToast } from '@/shared/Toast/Toast'
import { Tip } from '@/shared/Tip/Tip'
import { ModeToggle } from './ModeToggle'
import { ModelSelector } from './ModelSelector'
import { ContextChips } from './ContextChips'
import { SlashCommandMenu } from './SlashCommandMenu'
import { FileMentionMenu } from './FileMentionMenu'
import * as css from './ComposerInput.css'

// ── Permission mode config ────────────────────────────────────────────

const PERMISSION_MODES: { value: PermissionMode; label: string; desc: string; Icon: typeof ShieldCheck }[] = [
  { value: 'default', label: 'Default', desc: 'Asks before file writes, commands, and MCP tools', Icon: ShieldCheck },
  { value: 'acceptEdits', label: 'Accept Edits', desc: 'Auto-approves file edits, asks for commands', Icon: ShieldCheck },
  { value: 'auto', label: 'Auto', desc: 'Auto-approves safe operations, asks for risky ones', Icon: ShieldOff },
  { value: 'plan', label: 'Plan', desc: 'Read-only — analyzes without making changes', Icon: ListTodo },
  { value: 'bypassPermissions', label: 'Bypass', desc: 'Skips ALL permission checks (dangerous)', Icon: ShieldAlert },
  { value: 'dontAsk', label: "Don't Ask", desc: 'Denies anything that requires permission', Icon: ShieldOff },
]

const findPermission = (value: string) =>
  PERMISSION_MODES.find((p) => p.value === value)

// ── Effort level config ──────────────────────────────────────────────

const EFFORT_LEVELS: { value: EffortLevel; label: string; desc: string }[] = [
  { value: 'low', label: 'Low', desc: 'Fastest, cheapest' },
  { value: 'medium', label: 'Medium', desc: 'Balanced' },
  { value: 'high', label: 'High', desc: 'Default quality' },
  { value: 'xhigh', label: 'X-High', desc: 'Deep reasoning' },
  { value: 'max', label: 'Max', desc: 'Maximum thinking (this session only)' },
]

const findEffort = (value: string) =>
  EFFORT_LEVELS.find((e) => e.value === value)

// ── Font sizes ────────────────────────────────────────────────────────

const FONT_SIZES = [11, 12, 13, 14, 15, 16] as const

// ── Props ─────────────────────────────────────────────────────────────

interface ComposerInputProps {
  isStreaming: boolean
  isPermissionPending: boolean
  mode: ComposerMode
  model: string
  permissionMode: PermissionMode
  effortLevel: EffortLevel
  fontSize: number
  editorContext: EditorContext | null
  cwd?: string
  noContext: boolean
  showContextPanel?: boolean
  onSend: (text: string) => void
  onStop: () => void
  onModeChange: (mode: ComposerMode) => void
  onModelChange: (model: string) => void
  onPermissionModeChange: (mode: PermissionMode) => void
  onEffortLevelChange: (level: EffortLevel) => void
  onFontSizeChange: (size: number) => void
  onNoContextChange: (noContext: boolean) => void
  onDismissContext?: () => void
  onToggleContextPanel?: () => void
}

/** Rough char-to-token estimate (same heuristic V1 uses). */
const estimateTokens = (text: string): number => Math.ceil(text.length / 4)

/** Format token count for display. */
const formatTokens = (n: number): string => {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export const ComposerInput = (props: ComposerInputProps) => {
  const [text, setText] = createSignal('')
  const [showSlashMenu, setShowSlashMenu] = createSignal(false)
  const [slashQuery, setSlashQuery] = createSignal('')
  const [showFileMenu, setShowFileMenu] = createSignal(false)
  const [fileQuery, setFileQuery] = createSignal('')
  const [mentions, setMentions] = createSignal<string[]>([])
  const [dragOver, setDragOver] = createSignal(false)
  // milkdown editor — no direct DOM ref needed; submit is wired via onSubmit prop

  // ── Mention helpers ──────────────────────────────────────────────────

  const addMention = (path: string) => {
    const trimmed = path.trim()
    if (!trimmed) return
    setMentions((prev) => [...prev, trimmed])
  }

  const removeMention = (idx: number) => {
    setMentions((prev) => prev.filter((_, i) => i !== idx))
  }

  // ── Image paste ──────────────────────────────────────────────────────

  const handlePaste = (e: ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items ?? [])
    const imageItem = items.find((it) => it.type.startsWith('image/'))
    if (!imageItem) return
    e.preventDefault()
    const blob = imageItem.getAsFile()
    if (!blob) return

    blob.arrayBuffer().then(async (buf) => {
      const ext = (imageItem.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
      const name = `phantom-paste-${Date.now()}.${ext}`
      const path = `/tmp/${name}`
      try {
        const App = (window as any).go?.app?.App
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
        if (typeof App?.WriteTempFileBase64 === 'function') {
          await App.WriteTempFileBase64(path, b64)
        } else {
          showWarningToast('Paste', 'Image paste needs WriteTempFileBase64 binding')
          return
        }
        addMention(path)
      } catch (err) {
        showWarningToast('Paste', `Image save failed: ${(err as Error).message}`)
      }
    })
  }

  // ── Drag & drop ──────────────────────────────────────────────────────

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)

    const phantomPath = e.dataTransfer?.getData('text/phantom-path')
    if (phantomPath) {
      addMention(phantomPath)
      return
    }

    const files = Array.from(e.dataTransfer?.files ?? [])
    for (const file of files) {
      const path = (file as unknown as { path?: string }).path
      if (path) addMention(path)
    }
  }

  // ── Attach button (file picker) ─────────────────────────────────────

  const handleAttachClick = () => {
    const fi = document.createElement('input')
    fi.type = 'file'
    fi.multiple = true
    fi.style.display = 'none'
    fi.onchange = () => {
      const files = Array.from(fi.files ?? [])
      for (const f of files) {
        const path = (f as unknown as { path?: string }).path
        if (path) addMention(path)
      }
      fi.remove()
    }
    document.body.appendChild(fi)
    fi.click()
  }

  const handleSend = () => {
    const value = text().trim()
    const currentMentions = mentions()
    if (!value && currentMentions.length === 0) return
    if (props.isPermissionPending) return

    const mentionPrefix = currentMentions.map((p) => `@${p}`).join(' ')
    const fullText = mentionPrefix ? `${mentionPrefix} ${value}` : value

    props.onSend(fullText)
    setText('')
    setMentions([])
    setShowSlashMenu(false)
    setShowFileMenu(false)
  }

  const detectMenuTriggers = (value: string) => {
    if (value.startsWith('/')) {
      const query = value.slice(1).split(' ')[0] ?? ''
      if (!value.includes(' ')) {
        setShowSlashMenu(true)
        setSlashQuery(query)
      } else {
        setShowSlashMenu(false)
      }
    } else {
      setShowSlashMenu(false)
    }

    const atIndex = value.lastIndexOf('@')
    if (atIndex >= 0) {
      const afterAt = value.slice(atIndex + 1)
      if (!afterAt.includes(' ')) {
        setShowFileMenu(true)
        setFileQuery(afterAt)
      } else {
        setShowFileMenu(false)
      }
    } else {
      setShowFileMenu(false)
    }
  }

  const handleSlashSelect = (command: string) => {
    setText(`/${command} `)
    setShowSlashMenu(false)
  }

  const handleFileSelect = (filePath: string) => {
    const current = text()
    const atIndex = current.lastIndexOf('@')
    if (atIndex >= 0) {
      const before = current.slice(0, atIndex)
      setText(`${before}@${filePath} `)
    }
    setShowFileMenu(false)
  }

  const placeholder = () => {
    if (props.isPermissionPending) return 'Waiting for permission approval...'
    if (props.isStreaming) return 'Claude is responding... (send to queue)'
    if (props.mode === 'plan') return 'Describe what you want to plan...'
    return 'What should Composer do... (Cmd+Enter to send)'
  }

  const isDisabled = () => props.isPermissionPending

  // autoFocus is handled inside MilkdownEditor itself via its autoFocus prop

  return (
    <div
      class={`${css.composerArea} ${dragOver() ? css.composerAreaDragOver : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      {/* Context chips */}
      <ContextChips
        editorContext={props.editorContext}
        onDismiss={() => props.onDismissContext?.()}
      />

      {/* Attachment mention chips */}
      <Show when={mentions().length > 0}>
        <div class={css.mentionRow}>
          <For each={mentions()}>
            {(path, i) => (
              <span class={css.mentionChip}>
                @{path}
                <button
                  class={css.mentionRemove}
                  type="button"
                  onClick={() => removeMention(i())}
                  aria-label={`Remove mention ${path}`}
                >
                  <X size={10} />
                </button>
              </span>
            )}
          </For>
        </div>
      </Show>

      {/* Toolbar — above textarea */}
      <div class={css.composerToolbar} role="toolbar" aria-label="Composer actions">

        {/* ── Group 1: Attach ──────────────────────────────────── */}
        <Tip label="Attach file or paste image" placement="top">
          <button
            class={css.attachBtn}
            type="button"
            onClick={handleAttachClick}
            aria-label="Attach file or paste image"
          >
            <Paperclip size={12} />
          </button>
        </Tip>

        <span class={css.toolbarDivider} />

        {/* ── Group 2: Mode pills (Normal / Plan) ─────────────── */}
        <ModeToggle mode={props.mode} onChange={props.onModeChange} disabled={props.isStreaming} />

        <span class={css.toolbarDivider} />

        {/* ── Group 3: Permission mode dropdown ───────────────── */}
        <Select<string>
          value={props.permissionMode}
          onChange={(val) => { if (val !== null) props.onPermissionModeChange(val as PermissionMode) }}
          options={PERMISSION_MODES.map((p) => p.value)}
          itemComponent={(itemProps) => {
            const entry = findPermission(itemProps.item.rawValue)
            const isDanger = itemProps.item.rawValue === 'bypassPermissions'
            return (
              <Select.Item item={itemProps.item} class={css.modelSelectItem}>
                <Select.ItemLabel class={css.modelSelectItemLabel}>
                  {entry ? <entry.Icon size={10} style={isDanger ? { color: 'var(--color-danger)' } : undefined} /> : null}
                  <span style={isDanger ? { color: 'var(--color-danger)' } : undefined}>
                    {entry?.label ?? itemProps.item.rawValue}
                  </span>
                </Select.ItemLabel>
              </Select.Item>
            )
          }}
        >
          <Select.Trigger
            class={`${css.modelSelectTrigger} ${props.permissionMode === 'bypassPermissions' ? css.modePillDanger : ''}`}
            title="Permission mode"
            aria-label="Select permission mode"
            disabled={props.isStreaming}
          >
            <Select.Value<string> class={css.modelSelectValue}>
              {(state) => {
                const entry = findPermission(state.selectedOption())
                return (
                  <span class={css.modelSelectValueInner}>
                    {entry ? <entry.Icon size={10} /> : null}
                    {entry?.label ?? state.selectedOption()}
                  </span>
                )
              }}
            </Select.Value>
            <Select.Icon class={css.modelSelectIcon}>
              <ChevronDown size={10} />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content class={css.modelSelectContent}>
              <Select.Listbox class={css.modelSelectListbox} />
            </Select.Content>
          </Select.Portal>
        </Select>

        {/* ── Group 4: Effort level dropdown ──────────────────── */}
        <Select<string>
          value={props.effortLevel}
          onChange={(val) => { if (val !== null) props.onEffortLevelChange(val as EffortLevel) }}
          options={EFFORT_LEVELS.map((e) => e.value)}
          itemComponent={(itemProps) => {
            const entry = findEffort(itemProps.item.rawValue)
            return (
              <Select.Item item={itemProps.item} class={css.modelSelectItem}>
                <Select.ItemLabel class={css.modelSelectItemLabel}>
                  {entry?.label ?? itemProps.item.rawValue}
                  {entry?.desc ? <span style={{ opacity: 0.5, 'margin-left': '6px', 'font-size': '10px' }}>{entry.desc}</span> : null}
                </Select.ItemLabel>
              </Select.Item>
            )
          }}
        >
          <Select.Trigger
            class={css.modelSelectTrigger}
            title="Effort level"
            aria-label="Select effort level"
            disabled={props.isStreaming}
          >
            <Select.Value<string> class={css.modelSelectValue}>
              {(state) => {
                const entry = findEffort(state.selectedOption())
                return (
                  <span class={css.modelSelectValueInner}>
                    <Brain size={10} />
                    {entry?.label ?? state.selectedOption()}
                  </span>
                )
              }}
            </Select.Value>
            <Select.Icon class={css.modelSelectIcon}>
              <ChevronDown size={10} />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content class={css.modelSelectContent}>
              <Select.Listbox class={css.modelSelectListbox} />
            </Select.Content>
          </Select.Portal>
        </Select>

        <span class={css.toolbarDivider} />

        {/* ── Group 5: Model selector ─────────────────────────── */}
        <ModelSelector model={props.model} onChange={props.onModelChange} disabled={props.isStreaming} />

        {/* ── Group 6: Font size dropdown ─────────────────────── */}
        <Select<string>
          value={String(props.fontSize)}
          onChange={(val) => {
            if (val === null) return
            props.onFontSizeChange(Number(val))
          }}
          options={FONT_SIZES.map(String)}
          itemComponent={(itemProps) => (
            <Select.Item item={itemProps.item} class={css.modelSelectItem}>
              <Select.ItemLabel class={css.modelSelectItemLabel}>
                {itemProps.item.rawValue}px
              </Select.ItemLabel>
            </Select.Item>
          )}
        >
          <Select.Trigger
            class={css.modelSelectTrigger}
            title="Composer font size"
            aria-label="Select font size"
            disabled={props.isStreaming}
          >
            <Select.Value<string> class={css.modelSelectValue}>
              {(state) => (
                <span class={css.modelSelectValueInner}>
                  <Type size={10} />
                  {state.selectedOption()}px
                </span>
              )}
            </Select.Value>
            <Select.Icon class={css.modelSelectIcon}>
              <ChevronDown size={10} />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content class={css.modelSelectContent}>
              <Select.Listbox class={css.modelSelectListbox} />
            </Select.Content>
          </Select.Portal>
        </Select>

        <span class={css.toolbarDivider} />

        {/* ── Group 7: No Context toggle ──────────────────────── */}
        <Tip label={props.noContext ? 'Project context off — CLAUDE.md, hooks, skills stripped' : 'Click to disable project context'} placement="top" openDelay={400}>
          <button
            class={`${css.modePill} ${props.noContext ? css.modePillActive : ''}`}
            type="button"
            onClick={() => props.onNoContextChange(!props.noContext)}
            disabled={props.isStreaming}
            aria-pressed={props.noContext}
          >
            {props.noContext ? <GlobeLock size={11} /> : <FolderOpen size={11} />}
            {props.noContext ? 'No Context' : 'Context'}
          </button>
        </Tip>

        {/* ── Group 8: Context info panel trigger ─────────────── */}
        <Tip label="View loaded context, skills, and MCP servers" placement="top" openDelay={400}>
          <button
            class={`${css.contextInfoBtn} ${props.showContextPanel ? css.contextInfoBtnActive : ''}`}
            type="button"
            onClick={() => props.onToggleContextPanel?.()}
            aria-pressed={props.showContextPanel ?? false}
            aria-label="Toggle context info panel"
          >
            <BookOpen size={11} />
          </button>
        </Tip>
      </div>

      {/* Textarea wrapper — menus anchor relative to the textarea, not the composerArea */}
      <div style={{ position: 'relative' }}>
        {/* Slash command palette */}
        <SlashCommandMenu
          query={slashQuery()}
          cwd={props.cwd ?? ''}
          onSelect={handleSlashSelect}
          onClose={() => setShowSlashMenu(false)}
          visible={showSlashMenu()}
        />

        {/* File mention menu */}
        <FileMentionMenu
          query={fileQuery()}
          onSelect={handleFileSelect}
          onClose={() => setShowFileMenu(false)}
          visible={showFileMenu()}
        />

        <MilkdownEditor
          placeholder={placeholder()}
          disabled={isDisabled()}
          fontSize={props.fontSize}
          autoFocus
          onInput={(markdown) => {
            setText(markdown)
            detectMenuTriggers(markdown)
          }}
          onSubmit={(markdown) => {
            setText(markdown)
            handleSend()
          }}
        />
      </div>

      {/* Send row — below textarea */}
      <div class={css.sendRow}>
        {/* Token estimate (left side) */}
        <Show when={text().length > 0}>
          <span class={css.tokenEstimate}>
            ~{formatTokens(estimateTokens(text()))} tokens
          </span>
        </Show>

        {/* Spacer */}
        <span class={css.grow} />

        {/* Right side: send hint + button, or stop button */}
        <Show
          when={props.isStreaming}
          fallback={
            <>
              <span class={css.sendHint}>{'⌘'}{'↵'} to send</span>
              <button
                class={css.sendButton}
                disabled={!text().trim() && mentions().length === 0 || isDisabled()}
                onClick={handleSend}
                title="Send"
              >
                <Send size={12} />
                Send
              </button>
            </>
          }
        >
          <button
            class={css.stopBtn}
            type="button"
            onClick={() => props.onStop()}
            aria-label="Stop generation"
          >
            <Square size={10} style={{ fill: 'currentColor' }} />
            Stop
          </button>
        </Show>
      </div>
    </div>
  )
}
