import type { DesignDocument, DesignNode } from '../design/model.ts'
import { slugify, visitDocument, walk, type NodeIndex } from '../design/traverse.ts'
import { nodeToSvg } from '../render/svg.ts'
import { ICON_FONTS, ICON_LIBRARIES, type IconLibrary } from './iconLibraries.ts'

export interface IconUsage {
  name: string
  /** `icon` for small square artwork, `vector` for logos and illustrations. */
  kind: 'icon' | 'vector'
  /** Id of the detected library, absent for custom artwork. */
  library?: string
  /** Ready-to-use Iconify name, e.g. `ph:address-book-bold`. */
  iconify?: string
  /** Exported SVG relative to `media/`, for artwork without a known library. */
  file?: string
  width: number
  height: number
  usage: number
  nodeIds: string[]
}

export interface DetectedLibrary {
  id: string
  name: string
  prefix: string
  /** npm package holding the icon data for offline, SSR-safe rendering. */
  package: string
  /** What gave the library away. */
  confidence: 'variants' | 'name' | 'font'
  /** Distinct icons of the library used on the design pages. */
  icons: number
  /** Icon components of the library embedded in the file, used or not. */
  definitions: number
  evidence: string[]
}

export interface IconReport {
  libraries: DetectedLibrary[]
  icons: IconUsage[]
  /** SVG files to write under `media/`. */
  files: { path: string; content: string }[]
}

interface Match {
  library: IconLibrary
  confidence: DetectedLibrary['confidence']
  name: string
  variant?: string
}

const CONTAINERS = new Set(['FRAME', 'GROUP', 'COMPONENT', 'INSTANCE', 'BOOLEAN_OPERATION'])
const MAX_VECTOR_SIZE = 400
const MAX_ICON_SIZE = 96
const MAX_LEAVES = 80
const MAX_NODE_IDS = 5

const isVectorLeaf = (node: DesignNode) => Boolean(node.fillPaths?.length || node.strokePaths?.length)

/** A subtree made only of vector artwork, small enough to be an SVG asset. */
function isVectorArtwork(node: DesignNode): boolean {
  const { width, height } = node.box
  if (node.visible === false || Math.max(width, height) > MAX_VECTOR_SIZE || Math.min(width, height) < 6) return false
  if (!CONTAINERS.has(node.type) && !(node.type === 'VECTOR' && isVectorLeaf(node))) return false
  let leaves = 0
  let pure = true
  walk(node, (child) => {
    if (child.visible === false) return false
    if (child.children?.length) {
      if (child !== node && child.fills?.length) pure = false
    } else if (isVectorLeaf(child)) leaves += 1
    else pure = false
    return pure && leaves <= MAX_LEAVES
  })
  return pure && leaves > 0 && leaves <= MAX_LEAVES
}

const isIconSized = (node: DesignNode) => {
  const { width, height } = node.box
  return Math.max(width, height) <= MAX_ICON_SIZE && width / height > 0.75 && width / height < 1.34
}

/** `Icons/lucide/arrow-right` -> `arrow-right`, `AddressBook` -> `address-book`. */
function iconName(name: string, library?: IconLibrary): string {
  const leaf = name.split(/[/:]/).pop() ?? name
  const cleaned = library ? leaf.replace(library.pattern, '') : leaf
  return slugify(cleaned) || slugify(name)
}

function matchByVariants(set: DesignNode): IconLibrary | undefined {
  const values = new Map<string, Set<string>>()
  for (const variant of set.children ?? []) {
    for (const [property, value] of Object.entries(variant.component?.variant ?? {})) {
      values.set(property, (values.get(property) ?? new Set()).add(value.toLowerCase()))
    }
  }
  return ICON_LIBRARIES.find((library) => {
    const found = library.variants && values.get(library.variants.property)
    const known = library.variants?.values.map((value) => value.toLowerCase())
    return found && found.size > 1 && [...found].every((value) => known!.includes(value))
  })
}

const matchByName = (names: (string | undefined)[]) =>
  ICON_LIBRARIES.find((library) => names.some((name) => name && library.pattern.test(name)))

/** Geometry fingerprint: a detached copy of an icon keeps the exact paths of its source. */
function fingerprint(node: DesignNode): string {
  const paths: string[] = []
  walk(node, (child) => {
    if (child.visible === false) return false
    for (const path of [...(child.fillPaths ?? []), ...(child.strokePaths ?? [])]) paths.push(path.d)
  })
  return paths.join('|')
}

interface Definitions {
  byName: Map<string, Match>
  byShape: Map<string, Match>
  /** Number of icon components each library contributes to the file. */
  counts: Map<string, { library: IconLibrary; confidence: DetectedLibrary['confidence']; count: number }>
}

/** Indexes the icon components of the file so that instances and detached copies can be traced back to their library. */
function indexDefinitions(document: DesignDocument): Definitions {
  const definitions: Definitions = { byName: new Map(), byShape: new Map(), counts: new Map() }
  for (const { node, parent, page, frame } of visitDocument(document, { internal: true })) {
    if (node.type !== 'COMPONENT_SET' && !(node.type === 'COMPONENT' && parent?.type !== 'COMPONENT_SET')) continue
    const variants = node.type === 'COMPONENT_SET' ? (node.children ?? []) : [node]
    const sample = variants[0]
    if (!sample || !isVectorArtwork(sample) || !isIconSized(sample)) continue
    const byVariants = node.type === 'COMPONENT_SET' ? matchByVariants(node) : undefined
    const library = byVariants ?? matchByName([node.name, parent?.name, frame.name, page.internal ? undefined : page.name])
    if (!library) continue

    const match: Match = { library, confidence: byVariants ? 'variants' : 'name', name: iconName(node.name, library) }
    definitions.byName.set(slugify(match.name), match)
    for (const variant of variants) {
      const shape = fingerprint(variant)
      if (shape) definitions.byShape.set(shape, { ...match, variant: Object.values(variant.component?.variant ?? {})[0] })
    }
    const entry = definitions.counts.get(library.id) ?? { library, confidence: match.confidence, count: 0 }
    entry.count += 1
    definitions.counts.set(library.id, entry)
  }
  return definitions
}

/**
 * Finds every icon and vector asset used on the design pages, attributes it to
 * a known icon library when possible, and exports the rest as SVG files.
 * `expanded` must have its instances expanded; `index` covers the raw document.
 */
export function extractIcons(document: DesignDocument, expanded: DesignDocument, index: NodeIndex, parents: Map<string, string>): IconReport {
  const definitions = indexDefinitions(document)
  const icons = new Map<string, IconUsage>()
  const libraries = new Map<string, DetectedLibrary>()
  const files = new Map<string, string>()

  const identify = (node: DesignNode): Match | undefined => {
    const component = index.get(node.instance?.componentId ?? '')
    const set = index.get(parents.get(component?.id ?? '') ?? '')
    const owner = set?.type === 'COMPONENT_SET' ? set : component
    const variant = set?.type === 'COMPONENT_SET' ? Object.values(component?.component?.variant ?? {})[0] : undefined
    const definition = definitions.byName.get(slugify(iconName(owner?.name ?? node.name)))
    if (definition) return { ...definition, variant }
    const lookalike = definitions.byShape.get(fingerprint(node))
    if (lookalike) return lookalike
    const library = matchByName([node.name, owner?.name])
    return library && { library, confidence: 'name', name: iconName(owner?.name ?? node.name, library), variant }
  }

  const record = (node: DesignNode) => {
    const kind = isIconSized(node) ? 'icon' : 'vector'
    const match = kind === 'icon' ? identify(node) : undefined
    const name = match ? match.name + (match.variant ? (match.library.suffix?.(match.variant) ?? '') : '') : iconName(node.name)
    let key = `${match?.library.id ?? 'custom'}:${name}`
    let file: string | undefined

    if (!match) {
      // Unrelated artwork often shares a layer name ("Vector", "icon"): tell copies apart by content.
      const svg = nodeToSvg({ ...node, rotation: undefined })
      let path = `icons/${name || 'icon'}.svg`
      for (let i = 2; files.has(path) && files.get(path) !== svg; i++) path = `icons/${name || 'icon'}-${i}.svg`
      files.set(path, svg)
      file = path
      key = `custom:${path}`
    } else {
      const library = libraries.get(match.library.id) ?? {
        id: match.library.id,
        name: match.library.name,
        prefix: match.library.prefix,
        package: `@iconify-json/${match.library.prefix}`,
        confidence: match.confidence,
        icons: 0,
        definitions: 0,
        evidence: [],
      }
      if (library.evidence.length < MAX_NODE_IDS && !library.evidence.includes(node.name)) library.evidence.push(node.name)
      libraries.set(library.id, library)
    }

    const icon = icons.get(key) ?? {
      name: match ? name : (file!.slice('icons/'.length, -'.svg'.length)),
      kind,
      ...(match && { library: match.library.id, iconify: `${match.library.prefix}:${name}` }),
      ...(file && { file }),
      width: node.box.width,
      height: node.box.height,
      usage: 0,
      nodeIds: [],
    }
    icon.usage += 1
    if (icon.nodeIds.length < MAX_NODE_IDS) icon.nodeIds.push(node.id)
    icons.set(key, icon)
  }

  for (const page of expanded.pages) {
    if (page.internal) continue
    for (const frame of page.children) {
      walk(frame, (node) => {
        if (node.visible === false) return false
        // Definitions are not usages: their artwork is counted through their instances.
        if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') return false
        if (!isVectorArtwork(node)) return true
        record(node)
        return false
      })
    }
  }

  // Icon fonts are libraries too, even though they show up as text layers.
  for (const { node } of visitDocument(expanded)) {
    const font = node.text && ICON_FONTS.find(({ pattern }) => pattern.test(node.text!.style.fontFamily))
    const library = font && ICON_LIBRARIES.find(({ id }) => id === font.library)
    if (library && !libraries.has(library.id)) {
      libraries.set(library.id, { id: library.id, name: library.name, prefix: library.prefix, package: `@iconify-json/${library.prefix}`, confidence: 'font', icons: 0, definitions: 0, evidence: [node.text!.style.fontFamily] })
    }
  }

  // A library shipped in the file without a traceable usage is still worth knowing about:
  // custom-looking icons were most likely drawn from it.
  for (const { library, confidence, count } of definitions.counts.values()) {
    const entry = libraries.get(library.id) ?? { id: library.id, name: library.name, prefix: library.prefix, package: `@iconify-json/${library.prefix}`, confidence, icons: 0, definitions: 0, evidence: [] }
    entry.definitions = count
    libraries.set(library.id, entry)
  }

  const list = [...icons.values()].sort((a, b) => b.usage - a.usage || a.name.localeCompare(b.name))
  for (const library of libraries.values()) library.icons = list.filter((icon) => icon.library === library.id).length
  return {
    libraries: [...libraries.values()].sort((a, b) => b.icons - a.icons),
    icons: list,
    files: [...files].map(([path, content]) => ({ path, content })).sort((a, b) => a.path.localeCompare(b.path)),
  }
}
