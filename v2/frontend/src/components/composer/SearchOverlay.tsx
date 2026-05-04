// Author: Subash Karki
// In-conversation search overlay (Cmd+F) for Composer V2
// Ported from V1 ComposerPane.tsx — DOM-walking highlight approach

import { createSignal, createEffect, onCleanup, Show, type Component } from 'solid-js'
import { Search, ChevronUp, ChevronDown, X } from 'lucide-solid'
import * as css from './SearchOverlay.css'

interface SearchOverlayProps {
  /** The scrollable container whose text nodes will be searched */
  containerRef: HTMLElement | undefined
  onClose: () => void
}

const SearchOverlay: Component<SearchOverlayProps> = (props) => {
  let inputRef: HTMLInputElement | undefined

  const [query, setQuery] = createSignal('')
  const [matchCount, setMatchCount] = createSignal(0)
  const [activeIndex, setActiveIndex] = createSignal(0)

  // ── Highlight helpers ────────────────────────────────────────────────

  const clearHighlights = () => {
    const container = props.containerRef
    if (!container) return
    container.querySelectorAll('mark.search-hit, mark.search-hit-active').forEach((m) => {
      const parent = m.parentNode
      if (parent) {
        parent.replaceChild(document.createTextNode(m.textContent ?? ''), m)
        parent.normalize()
      }
    })
  }

  const highlightMatches = (q: string): number => {
    clearHighlights()
    const container = props.containerRef
    if (!q || !container) return 0

    const lower = q.toLowerCase()
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const p = node.parentElement
        // Skip code blocks, inputs, and already-marked nodes
        if (
          p?.closest('pre') ||
          p?.closest('textarea') ||
          p?.closest('input') ||
          p?.tagName === 'MARK'
        ) {
          return NodeFilter.FILTER_REJECT
        }
        return node.nodeValue?.toLowerCase().includes(lower)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT
      },
    })

    const nodes: Text[] = []
    let n: Node | null
    while ((n = walker.nextNode())) nodes.push(n as Text)

    let count = 0
    for (const textNode of nodes) {
      const text = textNode.nodeValue ?? ''
      const frag = document.createDocumentFragment()
      let lastIdx = 0
      let idx = text.toLowerCase().indexOf(lower)
      while (idx !== -1) {
        if (idx > lastIdx) {
          frag.appendChild(document.createTextNode(text.slice(lastIdx, idx)))
        }
        const mark = document.createElement('mark')
        mark.className = 'search-hit'
        mark.textContent = text.slice(idx, idx + q.length)
        frag.appendChild(mark)
        count++
        lastIdx = idx + q.length
        idx = text.toLowerCase().indexOf(lower, lastIdx)
      }
      if (lastIdx < text.length) {
        frag.appendChild(document.createTextNode(text.slice(lastIdx)))
      }
      textNode.parentNode?.replaceChild(frag, textNode)
    }

    return count
  }

  const scrollToMatch = (index: number) => {
    const container = props.containerRef
    if (!container) return

    const marks = container.querySelectorAll('mark.search-hit, mark.search-hit-active')
    if (marks.length === 0) return

    // Clear previous active
    marks.forEach((m) => {
      if (m.classList.contains('search-hit-active')) {
        m.classList.remove('search-hit-active')
        m.classList.add('search-hit')
      }
    })

    // Clamp index
    const clamped = ((index % marks.length) + marks.length) % marks.length
    const target = marks[clamped]
    if (target) {
      target.classList.remove('search-hit')
      target.classList.add('search-hit-active')
      target.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }

  // ── Input handler ────────────────────────────────────────────────────

  const handleInput = (value: string) => {
    setQuery(value)
    const count = highlightMatches(value)
    setMatchCount(count)
    setActiveIndex(0)
    if (count > 0) scrollToMatch(0)
  }

  const goNext = () => {
    if (matchCount() === 0) return
    const next = (activeIndex() + 1) % matchCount()
    setActiveIndex(next)
    scrollToMatch(next)
  }

  const goPrev = () => {
    if (matchCount() === 0) return
    const prev = (activeIndex() - 1 + matchCount()) % matchCount()
    setActiveIndex(prev)
    scrollToMatch(prev)
  }

  const close = () => {
    clearHighlights()
    setQuery('')
    setMatchCount(0)
    setActiveIndex(0)
    props.onClose()
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) {
        goPrev()
      } else {
        goNext()
      }
    }
  }

  // Auto-focus on mount
  createEffect(() => {
    requestAnimationFrame(() => {
      inputRef?.focus()
    })
  })

  // Clean up highlights when unmounted
  onCleanup(() => {
    clearHighlights()
  })

  return (
    <div class={css.overlay}>
      <Search size={13} style={{ color: 'inherit', 'flex-shrink': '0' }} />
      <input
        ref={inputRef}
        class={css.input}
        type="text"
        value={query()}
        onInput={(e) => handleInput(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in conversation..."
        aria-label="Search conversation"
        spellcheck={false}
        autocomplete="off"
      />
      <Show when={query()}>
        <span class={css.matchInfo}>
          {matchCount() > 0 ? `${activeIndex() + 1} of ${matchCount()}` : 'No matches'}
        </span>
        <button
          type="button"
          class={css.navBtn}
          onClick={goPrev}
          disabled={matchCount() === 0}
          aria-label="Previous match"
          title="Previous (Shift+Enter)"
        >
          <ChevronUp size={13} />
        </button>
        <button
          type="button"
          class={css.navBtn}
          onClick={goNext}
          disabled={matchCount() === 0}
          aria-label="Next match"
          title="Next (Enter)"
        >
          <ChevronDown size={13} />
        </button>
      </Show>
      <button
        type="button"
        class={css.closeBtn}
        onClick={close}
        aria-label="Close search"
        title="Close (Esc)"
      >
        <X size={13} />
      </button>
    </div>
  )
}

export default SearchOverlay
