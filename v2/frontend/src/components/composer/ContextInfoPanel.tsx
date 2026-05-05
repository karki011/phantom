// Author: Subash Karki
import { createSignal, onMount, For, Show } from 'solid-js'
import {
  X, ChevronRight, ChevronDown, FileText, Globe, BookOpen,
  Zap, Search, Server,
} from 'lucide-solid'
import {
  composerGetMemoryContext,
  composerListSkills,
  type MemoryContextItem,
  type ComposerSkill,
} from '@/core/bindings/composer'
import * as css from './ContextInfoPanel.css'

interface ContextInfoPanelProps {
  cwd: string
  onClose: () => void
  onInvokeSkill?: (skillName: string) => void
}

/** Combined Context Info panel — merges V1's Memory Panel + Skill Browser. */
export default function ContextInfoPanel(props: ContextInfoPanelProps) {
  const [memoryItems, setMemoryItems] = createSignal<MemoryContextItem[]>([])
  const [skills, setSkills] = createSignal<ComposerSkill[]>([])
  const [expandedPaths, setExpandedPaths] = createSignal<Set<string>>(new Set())
  const [skillFilter, setSkillFilter] = createSignal('')

  onMount(async () => {
    const [mem, sk] = await Promise.all([
      composerGetMemoryContext(props.cwd),
      composerListSkills(props.cwd),
    ])
    setMemoryItems(mem)
    setSkills(sk)
  })

  const toggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const isExpanded = (path: string) => expandedPaths().has(path)

  const totalSize = () => memoryItems().reduce((sum, i) => sum + i.size, 0)

  const formatSize = (bytes: number) => {
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`
    return `${bytes}B`
  }

  const basename = (path: string) => {
    const idx = path.lastIndexOf('/')
    return idx >= 0 ? path.slice(idx + 1) : path
  }

  const iconForLevel = (level: string) => {
    switch (level) {
      case 'global':
        return <Globe size={12} />
      case 'rule':
        return <BookOpen size={12} />
      default:
        return <FileText size={12} />
    }
  }

  const filteredSkills = () => {
    const q = skillFilter().toLowerCase()
    if (!q) return skills()
    return skills().filter(
      (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
    )
  }

  // ── Escape key handler ──────────────────────────────────────────────

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') props.onClose()
  }

  return (
    <div class={css.panel} onKeyDown={handleKeyDown} tabIndex={-1}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div class={css.panelHeader}>
        <BookOpen size={12} />
        <span class={css.panelTitle}>Context</span>
        <button class={css.panelClose} type="button" onClick={props.onClose}>
          <X size={12} />
        </button>
      </div>

      <div class={css.panelBody}>
        {/* ── Loaded Context section ───────────────────────────────── */}
        <div class={css.section}>
          <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
            <span class={css.sectionTitle}>Loaded Context</span>
            <span class={css.sectionCount}>{memoryItems().length} files</span>
            <span class={css.sectionCount}>{formatSize(totalSize())}</span>
          </div>

          <Show
            when={memoryItems().length > 0}
            fallback={<div class={css.emptyState}>No context files found</div>}
          >
            <For each={memoryItems()}>
              {(item) => (
                <div class={css.expandableItem}>
                  <div class={css.expandableHeader} onClick={() => toggleExpand(item.path)}>
                    {iconForLevel(item.level)}
                    <Show when={isExpanded(item.path)} fallback={<ChevronRight size={11} />}>
                      <ChevronDown size={11} />
                    </Show>
                    <span class={css.itemName}>{basename(item.path)}</span>
                    <span class={css.itemBadge}>{item.level}</span>
                    <span class={css.itemSize}>{formatSize(item.size)}</span>
                  </div>
                  <Show when={isExpanded(item.path)}>
                    <pre class={css.itemContent}>{item.content}</pre>
                  </Show>
                </div>
              )}
            </For>
          </Show>
        </div>

        {/* ── Skills section ──────────────────────────────────────── */}
        <div class={css.section}>
          <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
            <span class={css.sectionTitle}>Skills</span>
            <span class={css.sectionCount}>{skills().length}</span>
          </div>

          <Show when={skills().length > 0}>
            <div class={css.searchRow}>
              <Search size={11} />
              <input
                class={css.searchInput}
                type="text"
                placeholder="Filter skills..."
                value={skillFilter()}
                onInput={(e) => setSkillFilter(e.currentTarget.value)}
              />
            </div>
          </Show>

          <Show
            when={filteredSkills().length > 0}
            fallback={
              <div class={css.emptyState}>
                {skills().length === 0 ? 'No skills found' : 'No matching skills'}
              </div>
            }
          >
            <For each={filteredSkills()}>
              {(skill) => (
                <div class={css.item}>
                  <Zap size={10} />
                  <span class={css.itemName}>/{skill.name}</span>
                  <Show when={props.onInvokeSkill}>
                    <button
                      class={css.skillInvoke}
                      type="button"
                      onClick={() => props.onInvokeSkill?.(`/${skill.name}`)}
                    >
                      Invoke
                    </button>
                  </Show>
                </div>
              )}
            </For>
          </Show>
        </div>

        {/* ── MCP Servers section (placeholder — populated from system_init) */}
        <div class={css.section}>
          <div style={{ display: 'flex', 'align-items': 'center', gap: '6px' }}>
            <span class={css.sectionTitle}>MCP Servers</span>
          </div>
          <div class={css.emptyState}>
            <Server size={12} style={{ 'margin-bottom': '4px' }} />
            <div>MCP server info appears after session starts</div>
          </div>
        </div>
      </div>
    </div>
  )
}
