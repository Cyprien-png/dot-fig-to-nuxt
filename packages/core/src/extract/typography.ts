import type { DesignDocument, TextStyle } from '../design/model.ts'
import { slugify, visitDocument } from '../design/traverse.ts'

export interface FontFamily {
  family: string
  weights: number[]
  italic: boolean
  usage: number
}

export interface TextStyleToken {
  token: string
  /** Name of the shared Figma text style, when the combination has one. */
  name?: string
  fontFamily: string
  fontWeight: number
  fontSize: number
  lineHeight: string
  letterSpacing: string
  italic: boolean
  usage: number
}

export interface Typography {
  families: FontFamily[]
  styles: TextStyleToken[]
}

const signature = (style: Partial<TextStyle>) =>
  [style.fontFamily, style.fontWeight, style.italic, style.fontSize, style.lineHeight, style.letterSpacing].join('|')

export function extractTypography(document: DesignDocument): Typography {
  const families = new Map<string, FontFamily>()
  const styles = new Map<string, TextStyleToken>()
  const styleNames = new Map(document.styles.filter((style) => style.text).map((style) => [style.id, style.name]))

  const use = (style: Partial<TextStyle>, base: TextStyle, name?: string) => {
    const merged = { ...base, ...style }
    const family = families.get(merged.fontFamily) ?? { family: merged.fontFamily, weights: [], italic: false, usage: 0 }
    if (!family.weights.includes(merged.fontWeight)) family.weights.push(merged.fontWeight)
    family.italic ||= merged.italic
    family.usage += 1
    families.set(merged.fontFamily, family)

    const key = signature(merged)
    const token = styles.get(key) ?? {
      token: '',
      fontFamily: merged.fontFamily,
      fontWeight: merged.fontWeight,
      fontSize: merged.fontSize,
      lineHeight: merged.lineHeight,
      letterSpacing: merged.letterSpacing,
      italic: merged.italic,
      usage: 0,
    }
    token.usage += 1
    if (name) token.name ??= name
    styles.set(key, token)
  }

  for (const { node } of visitDocument(document)) {
    if (!node.text || node.visible === false) continue
    use({}, node.text.style, styleNames.get(node.text.styleId ?? ''))
    for (const range of node.text.ranges ?? []) use(range.style, node.text.style)
  }

  const used = new Set<string>()
  const ordered = [...styles.values()].sort((a, b) => b.fontSize - a.fontSize || b.fontWeight - a.fontWeight)
  for (const style of ordered) {
    const base = `text-${style.name ? slugify(style.name) : `${style.fontSize}-${style.fontWeight}`.replace('.', '_')}`
    let token = base
    for (let i = 2; used.has(token); i++) token = `${base}-${i}`
    used.add(token)
    style.token = token
  }

  return {
    families: [...families.values()]
      .map((family) => ({ ...family, weights: family.weights.sort((a, b) => a - b) }))
      .sort((a, b) => b.usage - a.usage),
    styles: ordered,
  }
}
