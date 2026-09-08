import { zipSync } from 'fflate'

type CompressionLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

interface ZipWorkerEntry {
  name: string
  bytes: ArrayBuffer
  mtime?: number
  level: CompressionLevel
}

interface ZipWorkerRequest {
  entries: ZipWorkerEntry[]
}

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<ZipWorkerRequest>) => void) | null
  postMessage(message: unknown, transfer?: Transferable[]): void
}

workerScope.onmessage = (event: MessageEvent<ZipWorkerRequest>) => {
  try {
    const files: Record<string, Uint8Array | [Uint8Array, { mtime?: Date; level: CompressionLevel }]> = {}
    for (const entry of event.data.entries) {
      const bytes = new Uint8Array(entry.bytes)
      files[entry.name] = entry.mtime == null
        ? [bytes, { level: entry.level }]
        : [bytes, { mtime: new Date(entry.mtime), level: entry.level }]
    }
    const zipped = zipSync(files)
    const output = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer
    workerScope.postMessage({ ok: true, buffer: output }, [output])
  } catch (error) {
    workerScope.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
