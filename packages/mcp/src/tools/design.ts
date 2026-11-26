import type { DesignSummary } from '@fig2nuxt/core'
import { z } from 'zod'
import { defineTool, project, type ToolContext } from '../toolkit.ts'

const SECTIONS = ['overview', 'colors', 'typography', 'screens', 'components', 'icons', 'interactions', 'media', 'collections'] as const
const MAX_LAYERS_PER_FRAME = 150

const nodeId = z.string().describe('Layer id, e.g. "12:345" or "I12:345;6:78" for a layer inside an instance')
const version = z.number().int().positive().optional().describe('Design version; defaults to the latest')

function section(summary: DesignSummary, name: (typeof SECTIONS)[number]): unknown {
  switch (name) {
    case 'colors':
      return summary.colors
    case 'typography':
      return summary.typography
    case 'screens':
      return { screens: summary.screens, breakpoints: summary.breakpoints }
    case 'components':
      return summary.components
    case 'icons':
      return { libraries: summary.iconLibraries, icons: summary.icons }
    case 'interactions':
      return summary.interactions
    case 'media':
      return summary.media
    case 'collections':
      return summary.collections
    default:
      // Everything small enough to read at once; the long lists are fetched by section.
      return {
        name: summary.name,
        stats: summary.stats,
        screens: summary.screens,
        breakpoints: summary.breakpoints,
        colors: summary.colors.slice(0, 24),
        fonts: summary.typography.families,
        textStyles: summary.typography.styles.slice(0, 24),
        radii: summary.radii,
        spacing: summary.spacing,
        components: summary.components.slice(0, 30),
        iconLibraries: summary.iconLibraries,
        collections: summary.collections.map(({ name, slug, count, fields }) => ({ name, file: `data/${slug}.json`, count, fields })),
        counts: { icons: summary.icons.length, interactions: summary.interactions.length, media: summary.media.length },
      }
  }
}

export function registerDesignTools(context: ToolContext): void {
  const { workspace } = context

  defineTool(context, 'get_design_summary', {
    title: 'Get design summary',
    description:
      'Returns what was extracted from the design: screens and breakpoints, palette, fonts, text styles, components, icon libraries (with ready-to-use Iconify names), interactions, media and data collections. Start here, then outline each screen.',
    input: { project, section: z.enum(SECTIONS).default('overview').describe('"overview" for the essentials, or one full section'), version },
    readOnly: true,
  }, async ({ project, section: name, version }) => section(await workspace.projects.summary(project, version), name))

  defineTool(context, 'get_frame_outline', {
    title: 'Outline a frame',
    description:
      'Returns an indented one-line-per-layer tree of a frame or layer: type, name, id, size, layout mode, component, icon and text. Use it to plan pages and components before inspecting layers in detail.',
    input: { project, nodeId, depth: z.number().int().min(1).max(20).default(6).describe('How many levels to descend'), version },
    readOnly: true,
  }, async ({ project, nodeId, depth, version }) => (await workspace.inspector(project, version)).outline(nodeId, depth))

  defineTool(context, 'inspect_node', {
    title: 'Inspect a layer',
    description:
      'Returns the exact geometry, CSS, text, media and interactions of a layer and its descendants. The CSS is computed from the design (flexbox for auto layout, absolute otherwise) and is the reference for a pixel-accurate implementation.',
    input: { project, nodeId, depth: z.number().int().min(0).max(8).default(2).describe('Levels of children to include'), version },
    readOnly: true,
  }, async ({ project, nodeId, depth, version }) => (await workspace.inspector(project, version)).inspect(nodeId, depth))

  defineTool(context, 'search_layers', {
    title: 'Search layers',
    description: 'Finds layers by name or text content (case-insensitive). Returns ids usable with inspect_node.',
    input: { project, query: z.string().min(1), version },
    readOnly: true,
  }, async ({ project, query, version }) => (await workspace.inspector(project, version)).search(query))

  defineTool(context, 'render_frame', {
    title: 'Render a frame',
    description:
      'Writes a standalone HTML reference render of a frame under design/.renders/ in the project and returns its path. Open or screenshot it to compare with the Nuxt build. It is a visual reference, not code to copy.',
    input: { project, nodeId, version },
  }, async ({ project, nodeId, version }) => {
    const inspector = await workspace.inspector(project, version)
    const path = `design/.renders/${nodeId.replace(/[^a-zA-Z0-9]+/g, '-')}.html`
    const files = workspace.projects.files(project)
    await files.write(path, inspector.render(nodeId, '../../media/'))
    return { path, absolutePath: files.resolve(path) }
  })

  defineTool(context, 'get_design_diff', {
    title: 'Get design diff',
    description:
      'Returns what changed between two design versions, frame by frame and layer by layer (added, removed, moved, and the exact properties changed), plus token changes. Defaults to "implemented version → latest version": the precise list of changes left to implement.',
    input: {
      project,
      from: z.number().int().min(0).optional().describe('Base version; defaults to the implemented version (0 = nothing implemented)'),
      to: z.number().int().positive().optional().describe('Target version; defaults to the latest'),
      frame: z.string().optional().describe('Only return the changes of this frame (id or name)'),
    },
    readOnly: true,
  }, async ({ project, from, to, frame }) => {
    const result = await workspace.projects.diff(project, from, to)
    const frames = result.diff.frames
      .filter((entry) => !frame || entry.frameId === frame || entry.frame === frame)
      .map((entry) => ({
        ...entry,
        layers: entry.layers.slice(0, MAX_LAYERS_PER_FRAME),
        ...(entry.layers.length > MAX_LAYERS_PER_FRAME && { truncated: `${entry.layers.length - MAX_LAYERS_PER_FRAME} more layers: use the "frame" filter or inspect the frame` }),
      }))
    return { from: result.from, to: result.to, identical: result.diff.identical, stats: result.diff.stats, tokens: result.diff.tokens, frames }
  })
}
