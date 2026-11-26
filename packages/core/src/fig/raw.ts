import { compileSchema, decodeBinarySchema } from 'kiwi-schema'
import type { FigContainer } from './container.ts'

/**
 * A node exactly as Figma serialises it. The schema ships inside every file
 * and changes between Figma releases, so it cannot be typed statically: every
 * access in this folder is defensive and nothing raw leaves it.
 */
export type RawNode = Record<string, any>

export interface RawGuid {
  sessionID: number
  localID: number
}

export interface RawDocument {
  root: RawNode
  childrenOf: (node: RawNode) => RawNode[]
  blobs: Uint8Array[]
  all: RawNode[]
}

const NO_GUID = 0xffffffff

export function guidToId(guid: RawGuid | undefined): string | undefined {
  if (!guid || guid.sessionID === NO_GUID) return undefined
  return `${guid.sessionID}:${guid.localID}`
}

/** Decodes the kiwi message and links nodes into an ordered tree. */
export function decodeRawDocument(container: FigContainer): RawDocument {
  const schema = compileSchema(decodeBinarySchema(container.schema))
  const message = schema.decodeMessage(container.message) as { nodeChanges?: RawNode[]; blobs?: { bytes: Uint8Array }[] }

  const all = (message.nodeChanges ?? []).filter((node) => node.phase !== 'REMOVED' && !node.isSoftDeleted)
  const children = new Map<string, RawNode[]>()
  let root: RawNode | undefined

  for (const node of all) {
    if (node.type === 'DOCUMENT') root = node
    const parentId = guidToId(node.parentIndex?.guid)
    if (!parentId) continue
    const siblings = children.get(parentId) ?? []
    siblings.push(node)
    children.set(parentId, siblings)
  }
  if (!root) throw new Error('Figma file has no DOCUMENT node')

  // Sibling order is a fractional index compared byte-wise, not by locale.
  const byPosition = (a: RawNode, b: RawNode) =>
    a.parentIndex.position < b.parentIndex.position ? -1 : a.parentIndex.position > b.parentIndex.position ? 1 : 0
  for (const siblings of children.values()) siblings.sort(byPosition)

  return {
    root,
    all,
    blobs: (message.blobs ?? []).map((blob) => blob.bytes),
    childrenOf: (node) => children.get(guidToId(node.guid) ?? '') ?? [],
  }
}
