import { sourceIdOf } from '../design/expand.ts'
import { isMediaPaint, type DesignDocument, type DesignNode } from '../design/model.ts'
import { camelCase, slugify, walk, type NodeIndex } from '../design/traverse.ts'

export interface Collection {
  name: string
  /** File name (without extension) under the project's `data/` folder. */
  slug: string
  /** Layer holding the repeated items. */
  sourceNodeId: string
  frame: string
  /** Figma component the items are instances of, when they are. */
  component?: string
  fields: string[]
  items: Record<string, string>[]
}

interface Entry {
  kind: 'text' | 'image'
  name: string
  value: string
}

const MIN_INSTANCES = 2
const MIN_LOOKALIKES = 3
const SHAPE_DEPTH = 4
const GENERIC_NAME = /^(frame|group|rectangle|auto layout|container|content|list|row|column|wrapper)\s*\d*$/i

/** Structural fingerprint: two layers with the same shape are the same "template". */
function shape(node: DesignNode, depth = 0): string {
  if (depth >= SHAPE_DEPTH || !node.children?.length) return node.text ? 'T' : node.type[0]!
  return `${node.type[0]}(${node.children.filter((child) => child.visible !== false).map((child) => shape(child, depth + 1)).join('')})`
}

function entriesOf(item: DesignNode, index: NodeIndex, mediaUrl: (hash: string) => string): Entry[] {
  const entries: Entry[] = []
  walk(item, (node) => {
    if (node.visible === false) return false
    // Derived layers are named after the component layer they come from, which is stable across items.
    const source = index.get(sourceIdOf(node.id)) ?? node
    // Figma names untouched text layers after their content: such a name describes one item, not the field.
    const autoNamed = source.text && slugify(source.name) === slugify(source.text.characters)
    const name = autoNamed || /^\d/.test(source.name) ? '' : source.name
    if (node.text) entries.push({ kind: 'text', name, value: node.text.characters })
    for (const paint of node.fills ?? []) {
      if (isMediaPaint(paint)) entries.push({ kind: 'image', name, value: mediaUrl(paint.hash) })
    }
  })
  return entries
}

/** Turns per-item entries into records sharing the same field names. */
function toRecords(items: Entry[][]): { fields: string[]; items: Record<string, string>[] } {
  const aligned = items.every((entries) => entries.length === items[0]!.length)
  const counters: Record<string, number> = {}
  // When layers are auto-named after their content, names differ per item: fall back to position.
  const positional = (items[0] ?? []).map((entry, position) => {
    const stable = aligned && items.every((entries) => entries[position]!.name === entry.name)
    if (stable && camelCase(entry.name)) return camelCase(entry.name)
    counters[entry.kind] = (counters[entry.kind] ?? 0) + 1
    return counters[entry.kind] === 1 ? entry.kind : `${entry.kind}${counters[entry.kind]}`
  })

  const fields: string[] = []
  const records = items.map((entries) => {
    const record: Record<string, string> = {}
    entries.forEach((entry, position) => {
      const base = (aligned ? positional[position] : camelCase(entry.name)) || entry.kind
      let key = base
      for (let i = 2; key in record; i++) key = `${base}${i}`
      record[key] = entry.value
      if (!fields.includes(key)) fields.push(key)
    })
    return record
  })
  return { fields, items: records }
}

/**
 * Detects repeated content — several instances of one component, or sibling
 * layers sharing the same structure — and turns it into data records, so the
 * site can render a list from JSON instead of hard-coding each item.
 */
export function extractCollections(expanded: DesignDocument, index: NodeIndex, parents: Map<string, string>, mediaUrl: (hash: string) => string): Collection[] {
  const collections: Collection[] = []
  const slugs = new Set<string>()

  const ownerOf = (node: DesignNode) => {
    const component = index.get(node.instance?.componentId ?? '')
    const parent = index.get(parents.get(component?.id ?? '') ?? '')
    return parent?.type === 'COMPONENT_SET' ? parent : component
  }

  const visit = (container: DesignNode, frame: string) => {
    const groups = new Map<string, DesignNode[]>()
    for (const child of container.children ?? []) {
      if (child.visible === false || !child.children?.length) continue
      const owner = ownerOf(child)
      const key = owner ? `component:${owner.id}` : `shape:${shape(child)}`
      groups.set(key, [...(groups.get(key) ?? []), child])
    }

    const consumed = new Set<DesignNode>()
    for (const [key, members] of groups) {
      const isComponent = key.startsWith('component:')
      if (members.length < (isComponent ? MIN_INSTANCES : MIN_LOOKALIKES)) continue
      const { fields, items } = toRecords(members.map((member) => entriesOf(member, index, mediaUrl)))
      if (!fields.length || items.some((item) => !Object.keys(item).length)) continue

      const component = isComponent ? ownerOf(members[0]!)?.name : undefined
      const name = GENERIC_NAME.test(container.name) ? (component ?? members[0]!.name) : container.name
      const base = slugify(name) || 'collection'
      let slug = base
      for (let i = 2; slugs.has(slug); i++) slug = `${base}-${i}`
      slugs.add(slug)
      collections.push({ name, slug, sourceNodeId: container.id, frame, ...(component && { component }), fields, items })
      members.forEach((member) => consumed.add(member))
    }
    for (const child of container.children ?? []) if (!consumed.has(child) && child.visible !== false) visit(child, frame)
  }

  for (const page of expanded.pages) {
    if (page.internal) continue
    for (const frame of page.children) if (frame.type !== 'COMPONENT' && frame.type !== 'COMPONENT_SET') visit(frame, frame.name)
  }
  return collections
}
