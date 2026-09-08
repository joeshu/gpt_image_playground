import { zipSync } from 'fflate'

type ZipFile = Uint8Array | [Uint8Array, { mtime?: Date; level?: number }]

interface ZipWorkerEntry {
  name: string
  bytes: ArrayBuffer
  mtime?: number
  level: number
}

interface ZipWorkerResponse {
  ok: boolean
  buffer?: ArrayBuffer
  error?: string
}

/**
 * Compresses ZIP entries off the UI thread when Workers are available.
 * The synchronous fallback keeps tests, older WebViews, and unusual native
 * shells functional without changing the public export API.
 */
export async function zipFilesAsync(files: Record<string, ZipFile>, level = 6): Promise<Uint8Array> {
  const entries = Object.entries(files).map(([name, value]): ZipWorkerEntry => {
    const [bytes, options] = Array.isArray(value) ? value : [value, undefined]
    const buffer = bytes.slice().buffer as ArrayBuffer
    return {
      name,
      bytes: buffer,
      mtime: options?.mtime?.getTime(),
      level: options?.level ?? level,
    }
  })

  if (typeof Worker !== 'undefined') {
    try {
      return await zipFilesInWorker(entries)
    } catch (error) {
      console.warn('ZIP Worker unavailable, using synchronous fallback:', error)
    }
  }

  await yieldToEventLoop()
  // Use the caller-owned buffers for fallback: Worker transfer may detach the
  // worker copies before a broken WebView reports its error.
  const result = zipSync(files, { level })
  await yieldToEventLoop()
  return result
}

function zipFilesInWorker(entries: ZipWorkerEntry[]): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./zip.worker.ts', import.meta.url), { type: 'module' })
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      worker.terminate()
      callback()
    }

    worker.onmessage = (event: MessageEvent<ZipWorkerResponse>) => {
      const response = event.data
      if (!response?.ok || !response.buffer) {
        finish(() => reject(new Error(response?.error || 'ZIP Worker 压缩失败')))
        return
      }
      finish(() => resolve(new Uint8Array(response.buffer!)))
    }
    worker.onerror = (event) => finish(() => reject(new Error(event.message || 'ZIP Worker 加载失败')))

    try {
      worker.postMessage({ entries }, entries.map((entry) => entry.bytes))
    } catch (error) {
      finish(() => reject(error instanceof Error ? error : new Error(String(error))))
    }
  })
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
