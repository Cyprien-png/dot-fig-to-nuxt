import type { DesignDocument, DesignNode } from '../design/model.ts'
import type { DesignSummary } from '../extract/analyze.ts'

export interface PropertyChange {
  /** Dotted path of the changed property, e.g. `text.characters` or `layout.gap`. */
  property: string
  before: unknown
  after: unknown
}

export interface LayerChange {
  kind: 'added' | 'removed' | 'changed' | 'moved'
  id: string
  name: string
  type: string
  /** Layer names from the frame down to the layer. */
  path: string
  /** Property changes, for `changed` and `moved` layers. */
  changes?: PropertyChange[]
  /** Number of layers below an added or removed layer. */
  descendants?: number
}

export interface FrameDiff {
  page: string
  frameId: string
  frame: string
  /** Design width of the frame, i.e. the viewport to render it at. */
  width: number
  status: 'added' | 'removed' | 'changed'
  layers: LayerChange[]
}

export interface SetDiff<T> {
  added: T[]
  removed: T[]
}

export interface DesignDiff {
  identical: boolean
  stats: { added: number; removed: number; changed: number; moved: number; frames: number }
  frames: FrameDiff[]
  tokens: {
    colors: SetDiff<string>
    fonts: SetDiff<string>
    media: SetDiff<string>
    screens: SetDiff<string>
    iconLibraries: SetDiff<string>
  }
}

interface Entry {
  node: DesignNode
  parentId: string | undefined
  page: string
  frame: DesignNode
  path: string
}

const FLATTEN_DEPTH = 2

function flatten(document: DesignDocument): Map<string, Entry> {
  const entries = new Map<string, Entry>()
  const add = (node: DesignNode, parentId: string | undefined, page: string, frame: DesignNode, path: string) => {
    entries.set(node.id, { node, parentId, page, frame, path })
    for (const child of node.children ?? []) add(child, node.id, page, frame, `${path} / ${child.name}`)
  }
  for (const page of document.pages) {
    // The internal page only mirrors library content; what matters is how the design pages use it.
    if (page.internal) continue
    for (const frame of page.children) add(frame, undefined, page.name, frame, frame.name)
  }
  return entries
}

const countDescendants = (node: DesignNode): number =>
  (node.children ?? []).reduce((total, child) => total + 1 + countDescendants(child), 0)

function compareValues(property: string, before: unknown, after: unknown, depth: number, out: PropertyChange[]): void {
  if (JSON.stringify(before) === JSON.stringify(after)) return
  const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
  if (depth < FLATTEN_DEPTH && isRecord(before) && isRecord(after)) {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      compareValues(`${property}.${key}`, before[key], after[key], depth + 1, out)
    }
    return
  }
  out.push({ property, before, after })
}

function compareNodes(before: DesignNode, after: DesignNode): PropertyChange[] {
  const changes: PropertyChange[] = []
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]) as Set<keyof DesignNode>
  for (const key of keys) {
    if (key === 'children' || key === 'id') continue
    compareValues(key, before[key], after[key], 0, changes)
  }
  // Reordering matters: it is the z-order, and the visual order inside auto layouts.
  const surviving = (node: DesignNode, other: DesignNode) => {
    const ids = new Set((other.children ?? []).map((child) => child.id))
    return (node.children ?? []).map((child) => child.id).filter((id) => ids.has(id))
  }
  const [orderBefore, orderAfter] = [surviving(before, after), surviving(after, before)]
  if (orderBefore.join() !== orderAfter.join()) changes.push({ property: 'childOrder', before: orderBefore, after: orderAfter })
  return changes
}

function diffSets(before: string[] = [], after: string[] = []): SetDiff<string> {
  const [a, b] = [new Set(before), new Set(after)]
  return { added: after.filter((value) => !a.has(value)), removed: before.filter((value) => !b.has(value)) }
}

function diffTokens(before?: DesignSummary, after?: DesignSummary): DesignDiff['tokens'] {
  const fonts = (summary?: DesignSummary) => summary?.typography.families.flatMap((family) => family.weights.map((weight) => `${family.family} ${weight}`))
  return {
    colors: diffSets(before?.colors.map((color) => color.value), after?.colors.map((color) => color.value)),
    fonts: diffSets(fonts(before), fonts(after)),
    media: diffSets(before?.media.map((file) => file.path), after?.media.map((file) => file.path)),
    screens: diffSets(before?.screens.map((screen) => screen.name), after?.screens.map((screen) => screen.name)),
    iconLibraries: diffSets(before?.iconLibraries.map((library) => library.id), after?.iconLibraries.map((library) => library.id)),
  }
}

/**
 * Computes what changed between two versions of a design, layer by layer.
 * Layers are matched by their Figma id, which is stable across saves, so a
 * renamed or restyled layer is reported as changed rather than replaced.
 */
export function diffDesign(
  before: DesignDocument,
  after: DesignDocument,
  summaries: { before?: DesignSummary; after?: DesignSummary } = {},
): DesignDiff {
  const [old, next] = [flatten(before), flatten(after)]
  const frames = new Map<string, FrameDiff>()
  const stats = { added: 0, removed: 0, changed: 0, moved: 0, frames: 0 }

  const frameDiff = (entry: Entry, status: FrameDiff['status']) => {
    const diff = frames.get(entry.frame.id) ?? { page: entry.page, frameId: entry.frame.id, frame: entry.frame.name, width: entry.frame.box.width, status, layers: [] }
    frames.set(entry.frame.id, diff)
    return diff
  }
  const describe = ({ node, path }: Entry) => ({ id: node.id, name: node.name, type: node.type, path })

  for (const [id, entry] of next) {
    const previous = old.get(id)
    if (!previous) {
      // Report the root of an added subtree once, not each of its layers.
      if (entry.parentId && !old.has(entry.parentId)) continue
      stats.added += 1
      frameDiff(entry, entry.parentId ? 'changed' : 'added').layers.push({ kind: 'added', ...describe(entry), descendants: countDescendants(entry.node) })
      continue
    }
    const changes = compareNodes(previous.node, entry.node)
    const moved = previous.parentId !== entry.parentId
    if (!changes.length && !moved) continue
    stats[moved ? 'moved' : 'changed'] += 1
    frameDiff(entry, 'changed').layers.push({ kind: moved ? 'moved' : 'changed', ...describe(entry), changes })
  }
  for (const [id, entry] of old) {
    if (next.has(id) || (entry.parentId && !next.has(entry.parentId))) continue
    stats.removed += 1
    frameDiff(entry, entry.parentId ? 'changed' : 'removed').layers.push({ kind: 'removed', ...describe(entry), descendants: countDescendants(entry.node) })
  }

  const tokens = diffTokens(summaries.before, summaries.after)
  stats.frames = frames.size
  return {
    identical: frames.size === 0 && Object.values(tokens).every((set) => !set.added.length && !set.removed.length),
    stats,
    frames: [...frames.values()],
    tokens,
  }
}
