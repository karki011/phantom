// Author: Subash Karki
import { createSignal, createEffect, onCleanup, For, Show } from 'solid-js'
import { getAllOpenFilePaths } from '@/core/editor/open-file-registry'
import { fuzzyFilter } from '@/shared/CommandPalette/fuzzy'
import * as css from './FileMentionMenu.css'

interface FileItem {
  path: string
  name: string
  dir: string
}

interface FileMentionMenuProps {
  query: string
  onSelect: (filePath: string) => void
  onClose: () => void
  visible: boolean
}

const toFileItem = (filePath: string): FileItem => {
  const parts = filePath.split('/')
  return {
    path: filePath,
    name: parts[parts.length - 1] ?? filePath,
    dir: parts.slice(0, -1).join('/'),
  }
}

export const FileMentionMenu = (props: FileMentionMenuProps) => {
  let listRef: HTMLDivElement | undefined
  const [graphFiles, setGraphFiles] = createSignal<string[]>([])
  const [selectedIndex, setSelectedIndex] = createSignal(0)

  // Fetch related files from AI graph (best-effort)
  createEffect(() => {
    if (!props.visible || !props.query) return

    const query = props.query
    try {
      const App = (window as any).go?.app?.App
      if (App?.PhantomGraphRelated) {
        App.PhantomGraphRelated(query)
          .then((result: any) => {
            if (Array.isArray(result)) {
              setGraphFiles(result.filter((f: unknown) => typeof f === 'string'))
            }
          })
          .catch(() => {
            /* best-effort */
          })
      }
    } catch {
      /* graph not available */
    }
  })

  const allFiles = (): FileItem[] => {
    const openPaths = getAllOpenFilePaths()
    const graphPaths = graphFiles()

    // Deduplicate, open files first
    const seen = new Set<string>()
    const result: FileItem[] = []

    for (const p of openPaths) {
      if (!seen.has(p)) {
        seen.add(p)
        result.push(toFileItem(p))
      }
    }
    for (const p of graphPaths) {
      if (!seen.has(p)) {
        seen.add(p)
        result.push(toFileItem(p))
      }
    }

    return result
  }

  const filtered = () => {
    const q = props.query
    const files = allFiles()
    if (!q) return files
    return fuzzyFilter(files, q, (item) => [item.name, item.path]).map((r) => r.item)
  }

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

    const list = filtered()
    const count = list.length

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
      props.onSelect(list[selectedIndex()]?.path ?? '')
    } else if (e.key === 'Escape') {
      e.preventDefault()
      props.onClose()
    } else if (e.key === 'Tab' && count > 0) {
      e.preventDefault()
      props.onSelect(list[selectedIndex()]?.path ?? '')
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
          <For each={filtered()}>
            {(item, index) => (
              <div
                class={css.item}
                role="option"
                data-selected={index() === selectedIndex() ? 'true' : 'false'}
                aria-selected={index() === selectedIndex()}
                onMouseEnter={() => setSelectedIndex(index())}
                onMouseDown={(e) => {
                  e.preventDefault()
                  props.onSelect(item.path)
                }}
              >
                <span class={css.fileName}>{item.name}</span>
                <span class={css.filePath}>{item.dir}</span>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  )
}
