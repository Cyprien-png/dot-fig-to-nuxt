import type { MediaAsset } from '../design/model.ts'

export type MediaKind = 'images' | 'videos' | 'audio'

export interface MediaFile {
  hash: string
  kind: MediaKind
  /** Path relative to the project's `media/` folder, e.g. `images/<hash>.png`. */
  path: string
  mime: string
  size: number
}

interface Signature {
  kind: MediaKind
  extension: string
  mime: string
  matches: (bytes: Uint8Array) => boolean
}

const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.subarray(start, start + length))
const magic = (...signature: number[]) => (bytes: Uint8Array) => signature.every((byte, i) => bytes[i] === byte)

const SIGNATURES: Signature[] = [
  { kind: 'images', extension: 'png', mime: 'image/png', matches: magic(0x89, 0x50, 0x4e, 0x47) },
  { kind: 'images', extension: 'jpg', mime: 'image/jpeg', matches: magic(0xff, 0xd8, 0xff) },
  { kind: 'images', extension: 'gif', mime: 'image/gif', matches: magic(0x47, 0x49, 0x46, 0x38) },
  { kind: 'images', extension: 'webp', mime: 'image/webp', matches: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP' },
  { kind: 'images', extension: 'avif', mime: 'image/avif', matches: (b) => ascii(b, 4, 8) === 'ftypavif' },
  { kind: 'audio', extension: 'wav', mime: 'audio/wav', matches: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WAVE' },
  { kind: 'audio', extension: 'mp3', mime: 'audio/mpeg', matches: (b) => ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0) },
  { kind: 'audio', extension: 'ogg', mime: 'audio/ogg', matches: (b) => ascii(b, 0, 4) === 'OggS' },
  { kind: 'audio', extension: 'm4a', mime: 'audio/mp4', matches: (b) => ascii(b, 4, 7) === 'ftypM4A' },
  { kind: 'videos', extension: 'mov', mime: 'video/quicktime', matches: (b) => ascii(b, 4, 6) === 'ftypqt' },
  { kind: 'videos', extension: 'mp4', mime: 'video/mp4', matches: (b) => ascii(b, 4, 4) === 'ftyp' },
  { kind: 'videos', extension: 'webm', mime: 'video/webm', matches: magic(0x1a, 0x45, 0xdf, 0xa3) },
  { kind: 'images', extension: 'svg', mime: 'image/svg+xml', matches: (b) => /^\s*(<\?xml|<svg)/.test(ascii(b, 0, 64)) },
]

const UNKNOWN: Omit<Signature, 'matches'> = { kind: 'images', extension: 'bin', mime: 'application/octet-stream' }

/** Figma stores media without extension: the type is read from the content. */
export function describeMedia(asset: MediaAsset): MediaFile {
  const { kind, extension, mime } = SIGNATURES.find((signature) => signature.matches(asset.bytes)) ?? UNKNOWN
  return { hash: asset.hash, kind, path: `${kind}/${asset.hash}.${extension}`, mime, size: asset.bytes.length }
}
