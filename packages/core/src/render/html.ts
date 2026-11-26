import { nodeStyle, textColor, textStyleToCss, toInlineStyle, type StyleOptions } from '../css/nodeStyle.ts'
import type { DesignNode, TextContent } from '../design/model.ts'
import { escapeXml, vectorPaths } from './svg.ts'

/**
 * Reference renderer: draws a frame as plain HTML/CSS straight from the design
 * model. It is the visual ground truth shown in the dashboard and the target an
 * agent compares its Nuxt implementation against. It is not the generated site.
 */

function textHtml(text: TextContent, options: StyleOptions): string {
  const { characters, ranges = [] } = text
  let html = ''
  let cursor = 0
  for (const range of ranges) {
    html += escapeXml(characters.slice(cursor, range.start))
    const style = escapeXml(toInlineStyle({ ...textStyleToCss(range.style), ...textColor(range.fills, options) }))
    const content = escapeXml(characters.slice(range.start, range.end))
    html += range.link ? `<a href="${escapeXml(range.link)}" style="${style}">${content}</a>` : `<span style="${style}">${content}</span>`
    cursor = range.end
  }
  return html + escapeXml(characters.slice(cursor))
}

function renderNode(node: DesignNode, parent: DesignNode | undefined, options: StyleOptions): string {
  if (node.visible === false) return ''
  const style = escapeXml(toInlineStyle(nodeStyle(node, parent, options)))
  const attributes = `data-node-id="${escapeXml(node.id)}" data-name="${escapeXml(node.name)}"`

  if (node.fillPaths || node.strokePaths) {
    const { width, height } = node.box
    return `<svg ${attributes} style="${style}; overflow: visible" viewBox="0 0 ${width} ${height}">${vectorPaths(node)}</svg>`
  }
  if (node.text) return `<div ${attributes} style="${style}">${textHtml(node.text, options)}</div>`
  const children = (node.children ?? []).map((child) => renderNode(child, node, options)).join('')
  return `<div ${attributes} style="${style}">${children}</div>`
}

export interface RenderOptions extends StyleOptions {
  title?: string
  /** Font families to request from Google Fonts so the render matches the design. */
  fonts?: { family: string; weights: number[] }[]
  background?: string
}

/** Renders an expanded frame as a standalone HTML document. */
export function renderFrameHtml(frame: DesignNode, options: RenderOptions): string {
  const fontQuery = (options.fonts ?? [])
    .map(({ family, weights }) => `family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${[...weights].sort((a, b) => a - b).join(';')}`)
    .join('&')
  const fontLink = fontQuery ? `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fontQuery}&display=swap">` : ''
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${Math.round(frame.box.width)}">
<title>${escapeXml(options.title ?? frame.name)}</title>
${fontLink}
<style>*{margin:0;box-sizing:content-box}body{background:${options.background ?? '#fff'};-webkit-font-smoothing:antialiased}a{color:inherit}</style>
</head>
<body>
${renderNode({ ...frame, box: { ...frame.box, x: 0, y: 0 }, rotation: undefined }, undefined, options)}
</body>
</html>
`
}
