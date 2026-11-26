import { expandInstances } from '../design/expand.ts'
import type { DesignDocument } from '../design/model.ts'
import { indexDocument, parentMap, visitDocument } from '../design/traverse.ts'
import type { ParsedFig } from '../fig/parseFig.ts'
import { extractCollections, type Collection } from './collections.ts'
import { extractComponents, extractInteractions, type ComponentUsage, type InteractionUsage } from './components.ts'
import { extractIcons, type DetectedLibrary, type IconUsage } from './icons.ts'
import { describeMedia, type MediaFile } from './media.ts'
import { extractPalette, type ColorToken } from './palette.ts'
import { breakpointWidths, extractScreens, type Breakpoint, type Screen } from './screens.ts'
import { extractTypography, type Typography } from './typography.ts'

export interface ScaleValue {
  value: number
  usage: number
}

/** Everything worth knowing about a design at a glance; stored as `design/summary.json`. */
export interface DesignSummary {
  name: string
  figVersion: number
  stats: { pages: number; screens: number; layers: number; texts: number; components: number; instances: number; media: number }
  colors: ColorToken[]
  typography: Typography
  radii: ScaleValue[]
  spacing: ScaleValue[]
  screens: Screen[]
  breakpoints: Partial<Record<Breakpoint, number[]>>
  components: ComponentUsage[]
  iconLibraries: DetectedLibrary[]
  icons: IconUsage[]
  interactions: InteractionUsage[]
  media: MediaFile[]
  collections: (Omit<Collection, 'items'> & { count: number })[]
}

export interface DesignAnalysis {
  summary: DesignSummary
  collections: Collection[]
  /** Files to write under `media/`, keyed by relative path. */
  files: { path: string; content: Uint8Array | string }[]
}

const MAX_SCALE_VALUES = 16

/** Returns the document with the instances of its design pages expanded. */
export function expandDocument(document: DesignDocument): DesignDocument {
  const index = indexDocument(document)
  return {
    ...document,
    pages: document.pages.map((page) =>
      page.internal ? page : { ...page, children: page.children.map((node) => expandInstances(node, index)) },
    ),
  }
}

function scales(document: DesignDocument): { radii: ScaleValue[]; spacing: ScaleValue[] } {
  const radii = new Map<number, number>()
  const spacing = new Map<number, number>()
  const count = (map: Map<number, number>, value: number) => value > 0 && map.set(value, (map.get(value) ?? 0) + 1)
  for (const { node } of visitDocument(document)) {
    if (typeof node.radius === 'number') count(radii, node.radius)
    if (node.layout) [node.layout.gap, ...node.layout.padding].forEach((value) => count(spacing, value))
  }
  const top = (map: Map<number, number>) =>
    [...map]
      .map(([value, usage]) => ({ value, usage }))
      .sort((a, b) => b.usage - a.usage)
      .slice(0, MAX_SCALE_VALUES)
      .sort((a, b) => a.value - b.value)
  return { radii: top(radii), spacing: top(spacing) }
}

/** Runs every extractor over a parsed file. */
export function analyzeDesign(parsed: ParsedFig): DesignAnalysis {
  const { document } = parsed
  const index = indexDocument(document)
  const parents = parentMap(document)
  const expanded = expandDocument(document)

  const media = parsed.media.map(describeMedia)
  const mediaPaths = new Map(media.map((file) => [file.hash, file.path]))
  const mediaUrl = (hash: string) => `/media/${mediaPaths.get(hash) ?? `images/${hash}`}`

  const screens = extractScreens(document)
  const icons = extractIcons(document, expanded, index, parents)
  const collections = extractCollections(expanded, index, parents, mediaUrl)
  const components = extractComponents(expanded, index, parents)

  let layers = 0
  let texts = 0
  let instances = 0
  for (const { node } of visitDocument(document)) {
    layers += 1
    if (node.text) texts += 1
    if (node.instance) instances += 1
  }

  return {
    summary: {
      name: document.name,
      figVersion: document.figVersion,
      stats: { pages: document.pages.filter((page) => !page.internal).length, screens: screens.length, layers, texts, components: components.length, instances, media: media.length },
      colors: extractPalette(expanded),
      typography: extractTypography(expanded),
      ...scales(expanded),
      screens,
      breakpoints: breakpointWidths(screens),
      components,
      iconLibraries: icons.libraries,
      icons: icons.icons,
      interactions: extractInteractions(expanded),
      media,
      collections: collections.map(({ items, ...collection }) => ({ ...collection, count: items.length })),
    },
    collections,
    files: [
      ...parsed.media.map((asset, i) => ({ path: media[i]!.path, content: asset.bytes })),
      ...icons.files,
    ],
  }
}
