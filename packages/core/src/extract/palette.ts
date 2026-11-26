import type { DesignDocument, DesignNode, Paint } from '../design/model.ts'
import { slugify, visitDocument } from '../design/traverse.ts'

export interface ColorToken {
  /** CSS custom property name without the leading dashes, e.g. `color-brand-primary`. */
  token: string
  value: string
  /** Name of the Figma style or variable the colour comes from, when it has one. */
  name?: string
  source: 'style' | 'variable' | 'usage'
  usage: number
  roles: { fill: number; text: number; stroke: number }
}

type Role = keyof ColorToken['roles']

function isIconLayer(node: DesignNode): boolean {
  return Boolean(node.fillPaths || node.strokePaths)
}

/**
 * Builds the palette: named colours (styles and variables) first, then every
 * other solid colour actually used, ordered by how often it appears.
 */
export function extractPalette(document: DesignDocument): ColorToken[] {
  const tokens = new Map<string, ColorToken>()
  const named = new Map<string, string>()

  const define = (id: string, name: string, value: string, source: ColorToken['source']) => {
    const key = value.toLowerCase()
    named.set(id, key)
    if (!tokens.has(key)) {
      tokens.set(key, { token: `color-${slugify(name)}`, value: key, name, source, usage: 0, roles: { fill: 0, text: 0, stroke: 0 } })
    }
  }
  for (const style of document.styles) {
    const paint = style.fills?.[0]
    if (style.type === 'FILL' && paint?.type === 'SOLID') define(style.id, style.name, paint.color, 'style')
  }
  for (const variable of document.variables) {
    const value = Object.values(variable.values)[0]
    if (variable.type === 'COLOR' && typeof value === 'string') define(variable.id, variable.name, value, 'variable')
  }

  const count = (paints: Paint[] | undefined, role: Role, styleId?: string) => {
    for (const paint of paints ?? []) {
      if (paint.type !== 'SOLID') continue
      const key = named.get(paint.variable ?? styleId ?? '') ?? paint.color.toLowerCase()
      const token = tokens.get(key) ?? { token: `color-${key.replace(/[^a-z0-9]+/g, '')}`, value: key, source: 'usage' as const, usage: 0, roles: { fill: 0, text: 0, stroke: 0 } }
      token.usage += 1
      token.roles[role] += 1
      tokens.set(key, token)
    }
  }
  for (const { node } of visitDocument(document)) {
    if (node.visible === false || isIconLayer(node)) continue
    count(node.fills, node.text ? 'text' : 'fill', node.fillStyleId)
    count(node.stroke?.paints, 'stroke')
  }

  const unique = new Set<string>()
  return [...tokens.values()]
    .sort((a, b) => Number(b.source !== 'usage') - Number(a.source !== 'usage') || b.usage - a.usage)
    .map((token) => {
      // Two styles may share a slug: keep custom property names unique.
      let name = token.token
      for (let i = 2; unique.has(name); i++) name = `${token.token}-${i}`
      unique.add(name)
      return { ...token, token: name }
    })
}
