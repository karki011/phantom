// Author: Subash Karki
import { createSignal, createEffect, onCleanup, For, Show } from 'solid-js'
import { composerListCommands, composerListSkills } from '@/core/bindings/composer'
import type { ComposerCommand, ComposerSkill } from '@/core/bindings/composer'
import { fuzzyFilter } from '@/shared/CommandPalette/fuzzy'
import * as css from './SlashCommandMenu.css'

interface SlashMenuItem {
  name: string
  description: string
  argumentHint: string
  source: string
  kind: 'command' | 'skill'
}

interface SlashCommandMenuProps {
  query: string
  cwd: string
  onSelect: (command: string) => void
  onClose: () => void
  visible: boolean
}

/** Extract the prefix before the first ':' — returns '' for standalone commands */
const getPrefix = (name: string): string => {
  const idx = name.indexOf(':')
  return idx > 0 ? name.slice(0, idx) : ''
}

/** Format source for display when no description exists */
const formatSource = (source: string): string => {
  if (source === 'skill') return '(skill)'
  if (source === 'global') return '(global)'
  if (source === 'project') return '(project)'
  if (source.startsWith('plugin:')) return `(${source})`
  return `(${source})`
}

interface GroupedEntry {
  type: 'header'
  prefix: string
}

interface ItemEntry {
  type: 'item'
  item: SlashMenuItem
  /** Index within the selectable-only items (skipping headers) */
  selectableIndex: number
  /** Whether this item belongs to a group (should be indented) */
  grouped: boolean
}

type MenuEntry = GroupedEntry | ItemEntry

export const SlashCommandMenu = (props: SlashCommandMenuProps) => {
  let listRef: HTMLDivElement | undefined
  const [items, setItems] = createSignal<SlashMenuItem[]>([])
  const [selectedIndex, setSelectedIndex] = createSignal(0)

  // Fetch commands + skills when visible
  createEffect(() => {
    if (!props.visible) return

    const cwd = props.cwd
    Promise.all([
      composerListCommands(cwd),
      composerListSkills(cwd),
    ]).then(([commands, skills]) => {
      const merged: SlashMenuItem[] = [
        ...commands.map((c: ComposerCommand) => ({
          name: c.name,
          description: c.description,
          argumentHint: c.argument_hint,
          source: c.source,
          kind: 'command' as const,
        })),
        ...skills.map((s: ComposerSkill) => ({
          name: s.name,
          description: s.description,
          argumentHint: '',
          source: 'skill',
          kind: 'skill' as const,
        })),
      ]
      setItems(merged)
    })
  })

  const filtered = () => {
    const q = props.query
    if (!q) return items()
    return fuzzyFilter(items(), q, (item) => [item.name, item.description, item.argumentHint]).map((r) => r.item)
  }

  /** Build grouped entries: header rows + item rows with selectable indices */
  const entries = (): MenuEntry[] => {
    const list = filtered()
    if (list.length === 0) return []

    // Group items by prefix
    const groups = new Map<string, SlashMenuItem[]>()
    const order: string[] = []
    for (const item of list) {
      const prefix = getPrefix(item.name)
      if (!groups.has(prefix)) {
        groups.set(prefix, [])
        order.push(prefix)
      }
      groups.get(prefix)!.push(item)
    }

    const result: MenuEntry[] = []
    let selectableIdx = 0

    for (const prefix of order) {
      const groupItems = groups.get(prefix)!
      const showHeader = prefix !== '' && groupItems.length > 1

      if (showHeader) {
        result.push({ type: 'header', prefix })
      }

      for (const item of groupItems) {
        result.push({
          type: 'item',
          item,
          selectableIndex: selectableIdx,
          grouped: showHeader,
        })
        selectableIdx++
      }
    }

    return result
  }

  const selectableCount = () => filtered().length

  // Reset selected index when query changes
  createEffect(() => {
    props.query // track
    setSelectedIndex(0)
  })

  const scrollSelectedIntoView = () => {
    requestAnimationFrame(() => {
      listRef?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' })
    })
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!props.visible) return

    const count = selectableCount()

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => (i + 1) % Math.max(count, 1))
      scrollSelectedIntoView()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => (i - 1 + Math.max(count, 1)) % Math.max(count, 1))
      scrollSelectedIntoView()
    } else if (e.key === 'Enter' && count > 0) {
      e.preventDefault()
      const list = filtered()
      props.onSelect(list[selectedIndex()]?.name ?? '')
    } else if (e.key === 'Escape') {
      e.preventDefault()
      props.onClose()
    } else if (e.key === 'Tab' && count > 0) {
      e.preventDefault()
      const list = filtered()
      props.onSelect(list[selectedIndex()]?.name ?? '')
    }
  }

  createEffect(() => {
    if (props.visible) {
      document.addEventListener('keydown', handleKeyDown, true)
    } else {
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  })

  onCleanup(() => {
    document.removeEventListener('keydown', handleKeyDown, true)
  })

  return (
    <Show when={props.visible && filtered().length > 0}>
      <div class={css.overlay}>
        <div class={css.menu} ref={listRef} role="listbox">
          <For each={entries()}>
            {(entry) => {
              if (entry.type === 'header') {
                return (
                  <div class={css.groupHeader} role="separator" aria-hidden="true">
                    <span class={css.groupHeaderLabel}>{entry.prefix}</span>
                    <span class={css.groupHeaderLine} />
                  </div>
                )
              }
              const { item, selectableIndex, grouped } = entry
              return (
                <div
                  class={grouped ? css.groupedItem : css.item}
                  role="option"
                  data-selected={selectableIndex === selectedIndex() ? 'true' : 'false'}
                  aria-selected={selectableIndex === selectedIndex()}
                  onMouseEnter={() => setSelectedIndex(selectableIndex)}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    props.onSelect(item.name)
                  }}
                >
                  <span class={css.itemName}>/{item.name}</span>
                  <span class={css.itemDesc}>
                    {item.description || item.argumentHint || formatSource(item.source)}
                  </span>
                  <span class={css.sourceBadge}>{item.source}</span>
                </div>
              )
            }}
          </For>
        </div>
      </div>
    </Show>
  )
}
