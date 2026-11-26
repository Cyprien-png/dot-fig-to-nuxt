import type { Paint, TextRange, TextStyle } from '../design/model.ts'
import { round } from './paint.ts'
import type { RawNode } from './raw.ts'

const WEIGHTS: [RegExp, number][] = [
  [/thin|hairline/, 100],
  [/extra\s*light|ultra\s*light/, 200],
  [/semi\s*bold|demi\s*bold/, 600],
  [/extra\s*bold|ultra\s*bold/, 800],
  [/black|heavy/, 900],
  [/light/, 300],
  [/medium/, 500],
  [/bold/, 700],
]

export function fontWeightOf(style: string): number {
  const lower = style.toLowerCase()
  return WEIGHTS.find(([pattern]) => pattern.test(lower))?.[1] ?? 400
}

function lineHeight(value: RawNode | undefined): string | undefined {
  if (!value) return undefined
  if (value.units === 'PIXELS') return `${round(value.value)}px`
  if (value.units === 'RAW') return String(round(value.value, 3))
  // A 100% line height is Figma's "Auto": the font's own metrics.
  return value.value === 100 ? 'normal' : `${round(value.value)}%`
}

function letterSpacing(value: RawNode | undefined): string | undefined {
  if (!value) return undefined
  if (!value.value) return '0'
  return value.units === 'PERCENT' ? `${round(value.value / 100, 4)}em` : `${round(value.value)}px`
}

/** Only returns the properties present on `raw`, so it also serves overrides. */
export function textStyleOf(raw: RawNode): Partial<TextStyle> {
  const style: Partial<TextStyle> = {}
  if (raw.fontName) {
    style.fontFamily = raw.fontName.family
    style.fontStyle = raw.fontName.style
    style.fontWeight = fontWeightOf(raw.fontName.style ?? '')
    style.italic = /italic|oblique/i.test(raw.fontName.style ?? '')
  }
  if (raw.fontSize !== undefined) style.fontSize = round(raw.fontSize)
  const height = lineHeight(raw.lineHeight)
  if (height !== undefined) style.lineHeight = height
  const spacing = letterSpacing(raw.letterSpacing)
  if (spacing !== undefined) style.letterSpacing = spacing
  if (raw.textAlignHorizontal) style.textAlign = raw.textAlignHorizontal
  if (raw.textAlignVertical) style.verticalAlign = raw.textAlignVertical
  if (raw.textCase) style.textCase = raw.textCase
  if (raw.textDecoration) style.textDecoration = raw.textDecoration
  return style
}

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: 'Inter',
  fontStyle: 'Regular',
  fontWeight: 400,
  italic: false,
  fontSize: 12,
  lineHeight: 'normal',
  letterSpacing: '0',
  textAlign: 'LEFT',
  verticalAlign: 'TOP',
  textCase: 'ORIGINAL',
  textDecoration: 'NONE',
}

/** Turns per-character style ids into contiguous styled ranges. */
export function textRangesOf(textData: RawNode | undefined, paints: (raw: RawNode[] | undefined) => Paint[]): TextRange[] {
  const ids: number[] = textData?.characterStyleIDs ?? []
  const table: RawNode[] = textData?.styleOverrideTable ?? []
  const ranges: TextRange[] = []
  let start = 0
  for (let i = 1; i <= ids.length; i++) {
    if (ids[i] === ids[start]) continue
    const override = ids[start] ? table.find((entry) => entry.styleID === ids[start]) : undefined
    if (override) {
      const range: TextRange = { start, end: i, style: textStyleOf(override) }
      if (override.fillPaints) range.fills = paints(override.fillPaints)
      if (override.hyperlink?.url) range.link = override.hyperlink.url
      // Figma keeps table entries that override nothing visible: they are not ranges.
      if (Object.keys(range.style).length || range.fills || range.link) ranges.push(range)
    }
    start = i
  }
  return ranges
}
