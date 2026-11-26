import { inflateSync, unzipSync } from 'fflate'
import { decompress as zstdDecompress } from 'fzstd'

/** Raw content of a .fig file, before the kiwi payload is decoded. */
export interface FigContainer {
  version: number
  schema: Uint8Array
  message: Uint8Array
  /** Images stored next to the canvas in zipped files, keyed by hex hash. */
  images: Map<string, Uint8Array>
  thumbnail?: Uint8Array
  meta?: { file_name?: string; exported_at?: string }
}

export class FigFormatError extends Error {}

const MAGIC = ['fig-kiwi', 'fig-jam.', 'fig-deck', 'fig-site']
const PNG = [0x89, 0x50, 0x4e, 0x47]
const ZSTD = [0x28, 0xb5, 0x2f, 0xfd]
const ZIP = [0x50, 0x4b]

const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((byte, i) => bytes[i] === byte)

function decompress(chunk: Uint8Array): Uint8Array {
  return startsWith(chunk, ZSTD) ? zstdDecompress(chunk) : inflateSync(chunk)
}

/** Reads the length-prefixed chunks following the 12-byte fig-kiwi header. */
function readChunks(canvas: Uint8Array): Uint8Array[] {
  const view = new DataView(canvas.buffer, canvas.byteOffset, canvas.byteLength)
  const chunks: Uint8Array[] = []
  let offset = 12
  while (offset + 4 <= canvas.length) {
    const length = view.getUint32(offset, true)
    offset += 4
    if (offset + length > canvas.length) throw new FigFormatError('Truncated .fig file')
    chunks.push(canvas.subarray(offset, offset + length))
    offset += length
  }
  return chunks
}

/**
 * Opens a .fig file. Recent files are zip archives wrapping `canvas.fig`,
 * older ones are the bare fig-kiwi stream.
 */
export function readFigContainer(bytes: Uint8Array): FigContainer {
  const images = new Map<string, Uint8Array>()
  let canvas = bytes
  let thumbnail: Uint8Array | undefined
  let meta: FigContainer['meta']

  if (startsWith(bytes, ZIP)) {
    const entries = unzipSync(bytes)
    const canvasEntry = entries['canvas.fig']
    if (!canvasEntry) throw new FigFormatError('Archive does not contain canvas.fig')
    canvas = canvasEntry
    thumbnail = entries['thumbnail.png']
    if (entries['meta.json']) meta = JSON.parse(new TextDecoder().decode(entries['meta.json']))
    for (const [path, content] of Object.entries(entries)) {
      const [folder, name] = path.split('/')
      if (name && content.length > 0 && (folder === 'images' || folder === 'videos')) images.set(name, content)
    }
  }

  const magic = new TextDecoder().decode(canvas.subarray(0, 8))
  if (!MAGIC.includes(magic)) throw new FigFormatError('Not a Figma file (missing fig-kiwi header)')

  const version = new DataView(canvas.buffer, canvas.byteOffset, canvas.byteLength).getUint32(8, true)
  const [schema, message, ...rest] = readChunks(canvas)
  if (!schema || !message) throw new FigFormatError('Figma file has no schema or no document')
  thumbnail ??= rest.find((chunk) => startsWith(chunk, PNG))

  return { version, schema: decompress(schema), message: decompress(message), images, thumbnail, meta }
}
