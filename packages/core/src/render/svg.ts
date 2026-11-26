import { colorWithOpacity } from '../css/nodeStyle.ts'
import { isMediaPaint, isSolidPaint, type DesignNode, type Paint } from '../design/model.ts'

const escapeXml = (value: string) => value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!)

function paintColor(paints: Paint[] | undefined): string | undefined {
  const paint = paints?.[0]
  if (!paint) return undefined
  if (isSolidPaint(paint)) return colorWithOpacity(paint.color, paint.opacity)
  return isMediaPaint(paint) ? undefined : paint.stops[0]?.color
}

/** `<path>` elements for a single vector layer, in the layer's own coordinates. */
export function vectorPaths(node: DesignNode, recolor?: (color: string) => string): string {
  const paint = (color: string | undefined) => (color ? (recolor?.(color) ?? color) : undefined)
  const fill = paint(paintColor(node.fills))
  const stroke = paint(paintColor(node.stroke?.paints))
  const parts: string[] = []
  if (fill) for (const path of node.fillPaths ?? []) parts.push(`<path d="${path.d}" fill="${escapeXml(fill)}" fill-rule="${path.rule}"/>`)
  // Stroke geometry is already outlined by Figma, so it is drawn as a fill.
  if (stroke) for (const path of node.strokePaths ?? []) parts.push(`<path d="${path.d}" fill="${escapeXml(stroke)}" fill-rule="${path.rule}"/>`)
  return parts.join('')
}

function collectColors(node: DesignNode, colors: Set<string>): void {
  if (node.visible === false) return
  for (const color of [paintColor(node.fills), paintColor(node.stroke?.paints)]) {
    if (color && (node.fillPaths || node.strokePaths)) colors.add(color)
  }
  node.children?.forEach((child) => collectColors(child, colors))
}

function group(node: DesignNode, recolor: ((color: string) => string) | undefined, root: boolean): string {
  if (node.visible === false) return ''
  const content = vectorPaths(node, recolor) + (node.children ?? []).map((child) => group(child, recolor, false)).join('')
  if (!content || root) return content
  const transforms = [`translate(${node.box.x} ${node.box.y})`]
  if (node.rotation) transforms.push(`rotate(${node.rotation})`)
  const opacity = node.opacity !== undefined && node.opacity < 1 ? ` opacity="${node.opacity}"` : ''
  return `<g transform="${transforms.join(' ')}"${opacity}>${content}</g>`
}

/**
 * Exports a vector subtree (typically an icon) as a standalone SVG. Single
 * colour artwork uses `currentColor` so it can be tinted from CSS.
 */
export function nodeToSvg(node: DesignNode): string {
  const colors = new Set<string>()
  collectColors(node, colors)
  const recolor = colors.size === 1 ? () => 'currentColor' : undefined
  const { width, height } = node.box
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">${group(node, recolor, true)}</svg>\n`
}

export { escapeXml }
