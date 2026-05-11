// Author: Subash Karki
import { onMount, onCleanup } from 'solid-js'
import { Editor, rootCtx, defaultValueCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { history } from '@milkdown/kit/plugin/history'
import { getMarkdown } from '@milkdown/utils'
import '@milkdown/kit/prose/view/style/prosemirror.css'
import * as styles from './MilkdownEditor.css'

interface MilkdownEditorProps {
  placeholder?: string
  onSubmit: (markdown: string) => void
  onInput?: (markdown: string) => void
  autoFocus?: boolean
  disabled?: boolean
  fontSize?: number
}

export function MilkdownEditor(props: MilkdownEditorProps) {
  let containerRef: HTMLDivElement | undefined
  let editorInstance: Editor | undefined
  // Track latest markdown in a closure so the keymap plugin can read it without
  // requiring a reactive subscription inside a ProseMirror plugin.
  let latestMarkdown = ''

  onMount(async () => {
    if (!containerRef) return

    // Build editor
    editorInstance = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, containerRef!)
        ctx.set(defaultValueCtx, '')
      })
      .config((ctx) => {
        const l = ctx.get(listenerCtx)
        l.markdownUpdated((_ctx, markdown) => {
          latestMarkdown = markdown
          props.onInput?.(markdown)
        })
      })
      .use(commonmark)
      .use(gfm)
      .use(listener)
      .use(clipboard)
      .use(history)
      .create()

    const proseMirrorEl = containerRef.querySelector('.ProseMirror') as HTMLElement | null
    if (proseMirrorEl) {
      proseMirrorEl.addEventListener('keydown', handleKeyDown as EventListener)
      // Set placeholder as a data attribute for CSS ::before content
      const placeholderText = props.placeholder ?? 'Type markdown... (⌘+Enter to send)'
      proseMirrorEl.setAttribute('data-placeholder', placeholderText)
      proseMirrorEl.classList.add(styles.proseMirrorRoot)
    }

    if (props.autoFocus) {
      proseMirrorEl?.focus()
    }
  })

  onCleanup(() => {
    editorInstance?.destroy()
  })

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      const markdown = editorInstance
        ? editorInstance.action(getMarkdown())
        : latestMarkdown
      props.onSubmit(markdown)
    }
  }

  return (
    <div
      ref={containerRef}
      class={styles.editorContainer}
      style={props.fontSize ? { 'font-size': `${props.fontSize}px` } : undefined}
      data-placeholder={props.placeholder ?? 'What should Composer do... (Cmd+Enter to send)'}
    />
  )
}
