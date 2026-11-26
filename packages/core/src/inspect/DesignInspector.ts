import { nodeStyle, type CssDeclarations } from '../css/nodeStyle.ts'
import { expandInstances } from '../design/expand.ts'
import { isMediaPaint, type Box, type DesignDocument, type DesignNode, type Interaction } from '../design/model.ts'
import { indexDocument, parentMap, walk, type NodeIndex } from '../design/traverse.ts'
import type { DesignSummary } from '../extract/analyze.ts'
import { renderFrameHtml } from '../render/html.ts'

export class NodeNotFoundError extends Error {}

export interface InspectedNode {
  id: string
  name: string
  type: string
  box: Box
  /** CSS reproducing the layer inside its parent. */
  css: CssDeclarations
  text?: string
  /** Styled sub-ranges of the text, when it mixes styles. */
  textRanges?: { text: string; css: CssDeclarations; link?: string }[]
  /** Name of the component, for instances. */
  component?: string
  /** Iconify name or exported SVG path, when the layer is a known icon. */
  icon?: string
  media?: string[]
  interactions?: Interaction[]
  children?: InspectedNode[]
  /** Number of children not shown because the depth limit was reached. */
  hiddenChildren?: number
}

export interface SearchHit {
  id: string
  name: string
  type: string
  frame: string
  text?: string
}

const MAX_OUTLINE_LINES = 600
const MAX_SEARCH_HITS = 50

/** Read-only queries over one design version: what an agent needs to write the code. */
export class DesignInspector {
  private readonly index: NodeIndex
  private readonly parents: Map<string, string>
  private readonly icons = new Map<string, string>()
  private readonly mediaPaths: Map<string, string>

  constructor(
    private readonly document: DesignDocument,
    private readonly summary: DesignSummary,
  ) {
    this.index = indexDocument(document)
    this.parents = parentMap(document)
    this.mediaPaths = new Map(summary.media.map((file) => [file.hash, file.path]))
    for (const icon of summary.icons) {
      for (const id of icon.nodeIds) this.icons.set(id, icon.iconify ?? `/media/${icon.file}`)
    }
  }

  readonly mediaUrl = (hash: string) => `/media/${this.mediaPaths.get(hash) ?? `images/${hash}`}`

  /**
   * Finds a layer and its parent. Ids of layers inside instances
   * (`I<instance>;<layer>`) are resolved by expanding the owning instance.
   */
  private locate(id: string): { node: DesignNode; parent: DesignNode | undefined } {
    const ownerId = id.startsWith('I') ? id.slice(1).split(';')[0]! : id
    const owner = this.index.get(ownerId)
    if (!owner) throw new NodeNotFoundError(`No layer with id ${id}`)
    const expanded = expandInstances(owner, this.index)
    const ownerParent = this.index.get(this.parents.get(ownerId) ?? '')
    if (id === ownerId) return { node: expanded, parent: ownerParent }

    let found: { node: DesignNode; parent: DesignNode | undefined } | undefined
    walk(expanded, (node, parent) => {
      if (node.id === id) found = { node, parent }
      return !found
    })
    if (!found) throw new NodeNotFoundError(`No layer with id ${id}`)
    return found
  }

  private componentName(node: DesignNode): string | undefined {
    const component = this.index.get(node.instance?.componentId ?? '')
    const set = this.index.get(this.parents.get(component?.id ?? '') ?? '')
    if (!component) return undefined
    return set?.type === 'COMPONENT_SET' ? `${set.name} (${component.name})` : component.name
  }

  private describe(node: DesignNode, parent: DesignNode | undefined, depth: number): InspectedNode {
    const result: InspectedNode = {
      id: node.id,
      name: node.name,
      type: node.type,
      box: node.box,
      css: nodeStyle(node, parent, { mediaUrl: this.mediaUrl }),
    }
    if (node.text) {
      result.text = node.text.characters
      if (node.text.ranges?.length) {
        result.textRanges = node.text.ranges.map((range) => ({
          text: node.text!.characters.slice(range.start, range.end),
          css: nodeStyle({ ...node, text: { ...node.text!, style: { ...node.text!.style, ...range.style } }, fills: range.fills ?? node.fills }, parent, { mediaUrl: this.mediaUrl }),
          ...(range.link && { link: range.link }),
        }))
      }
    }
    const component = this.componentName(node)
    if (component) result.component = component
    const icon = this.icons.get(node.id)
    if (icon) result.icon = icon
    const media = (node.fills ?? []).filter(isMediaPaint).map((paint) => this.mediaUrl(paint.hash))
    if (media.length) result.media = media
    if (node.interactions?.length) result.interactions = node.interactions

    // Mask layers are folded into the parent's CSS (mask or clip-path).
    const children = (node.children ?? []).filter((child) => child.visible !== false && !child.mask)
    // An icon is used as a whole: its vector layers are noise.
    if (!children.length || icon) return result
    if (depth <= 0) result.hiddenChildren = children.length
    else result.children = children.map((child) => this.describe(child, node, depth - 1))
    return result
  }

  /** Geometry, CSS and content of a layer and its descendants down to `depth`. */
  inspect(id: string, depth = 2): InspectedNode {
    const { node, parent } = this.locate(id)
    return this.describe(node, parent, depth)
  }

  /** Indented one-line-per-layer overview of a subtree, cheap enough to read whole. */
  outline(id: string, depth = 6): string {
    const { node: root } = this.locate(id)
    const lines: string[] = []
    const visit = (node: DesignNode, level: number) => {
      if (node.visible === false || lines.length >= MAX_OUTLINE_LINES) return
      const details = [
        node.mask && 'mask of the next siblings',
        `${Math.round(node.box.width)}×${Math.round(node.box.height)}`,
        node.layout && (node.layout.mode === 'GRID' ? 'grid' : `flex-${node.layout.mode === 'HORIZONTAL' ? 'row' : 'column'} gap ${node.layout.gap}`),
        this.componentName(node) && `instance of "${this.componentName(node)}"`,
        this.icons.get(node.id) && `icon ${this.icons.get(node.id)}`,
        node.interactions?.length && `${node.interactions.length} interaction(s)`,
        node.text && JSON.stringify(node.text.characters.length > 60 ? `${node.text.characters.slice(0, 60)}…` : node.text.characters),
      ].filter(Boolean)
      lines.push(`${'  '.repeat(level)}${node.type} "${node.name}" [${node.id}] ${details.join(' · ')}`)
      if (level < depth && !this.icons.has(node.id)) node.children?.forEach((child) => visit(child, level + 1))
    }
    visit(root, 0)
    if (lines.length >= MAX_OUTLINE_LINES) lines.push(`… truncated at ${MAX_OUTLINE_LINES} layers: outline a deeper layer for the rest`)
    return lines.join('\n')
  }

  /** Standalone HTML reference render of a frame or layer; `mediaBase` is the URL prefix of the media folder. */
  render(id: string, mediaBase = 'media/'): string {
    const { node } = this.locate(id)
    const page = this.document.pages.find((candidate) => candidate.children.some((frame) => frame.id === id))
    return renderFrameHtml(node, {
      mediaUrl: (hash) => mediaBase + this.mediaUrl(hash).slice('/media/'.length),
      fonts: this.summary.typography.families,
      background: page?.background,
    })
  }

  /** Case-insensitive search in layer names and text content of the design pages. */
  search(query: string): SearchHit[] {
    const needle = query.toLowerCase()
    const hits: SearchHit[] = []
    for (const page of this.document.pages) {
      if (page.internal) continue
      for (const frame of page.children) {
        walk(frame, (node) => {
          if (hits.length >= MAX_SEARCH_HITS) return false
          if (node.name.toLowerCase().includes(needle) || node.text?.characters.toLowerCase().includes(needle)) {
            hits.push({ id: node.id, name: node.name, type: node.type, frame: frame.name, ...(node.text && { text: node.text.characters.slice(0, 120) }) })
          }
        })
      }
    }
    return hits
  }
}
