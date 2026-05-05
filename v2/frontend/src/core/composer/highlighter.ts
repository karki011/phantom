// Author: Subash Karki

type HighlightCallback = (blockId: string, html: string) => void

let worker: Worker | null = null
const pending = new Map<string, HighlightCallback>()

const getWorker = (): Worker => {
  if (!worker) {
    worker = new Worker(
      new URL('./highlight-worker.ts', import.meta.url),
      { type: 'module' }
    )
    worker.onmessage = (e) => {
      const { blockId, html } = e.data
      const cb = pending.get(blockId)
      if (cb) {
        cb(blockId, html)
        pending.delete(blockId)
      }
    }
  }
  return worker
}

export const highlightCode = (
  blockId: string,
  code: string,
  language: string | undefined,
  cb: HighlightCallback
) => {
  pending.set(blockId, cb)
  getWorker().postMessage({ blockId, code, language })
}

export const terminateHighlighter = () => {
  worker?.terminate()
  worker = null
  pending.clear()
}
