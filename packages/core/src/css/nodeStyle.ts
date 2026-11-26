import { isMediaPaint, isSolidPaint, type DesignNode, type Effect, type Paint, type TextStyle } from '../design/model.ts'
import { colorWithOpacity, px } from './color.ts'
import { maskDeclarations } from './mask.ts'

export type CssDeclarations = Record<string, string>

export interface StyleOptions {
  /** Resolves a media hash to the URL it is served from. */
  mediaUrl: (hash: string) => string
}

const JUSTIFY: Record<string, string> = {
  MIN: 'flex-start',
  CENTER: 'center',
  MAX: 'flex-end',
  SPACE_BETWEEN: 'space-between',
  SPACE_EVENLY: 'space-evenly',
}
const ALIGN: Record<string, string> = { MIN: 'flex-start', CENTER: 'center', MAX: 'flex-end', STRETCH: 'stretch', BASELINE: 'baseline' }
const TEXT_ALIGN: Record<string, string> = { LEFT: 'left', CENTER: 'center', RIGHT: 'right', JUSTIFIED: 'justify' }
const TEXT_CASE: Record<string, string> = { UPPER: 'uppercase', LOWER: 'lowercase', TITLE: 'capitalize' }
const TEXT_DECORATION: Record<string, string> = { UNDERLINE: 'underline', STRIKETHROUGH: 'line-through' }
const BACKGROUND_SIZE: Record<string, string> = { FILL: 'cover', FIT: 'contain', STRETCH: '100% 100%', TILE: 'auto' }
const HUG = new Set(['RESIZE_TO_FIT', 'RESIZE_TO_FIT_WITH_IMPLICIT_SIZE'])

function paintToCss(paint: Paint, options: StyleOptions): string {
  if (isSolidPaint(paint)) {
    const color = colorWithOpacity(paint.color, paint.opacity)
    return `linear-gradient(${color}, ${color})`
  }
  if (isMediaPaint(paint)) {
    const repeat = paint.scaleMode === 'TILE' ? 'repeat' : 'no-repeat'
    return `url("${options.mediaUrl(paint.hash)}") center / ${BACKGROUND_SIZE[paint.scaleMode] ?? 'cover'} ${repeat}`
  }
  const stops = paint.stops.map((stop) => `${stop.color} ${Math.round(stop.position * 10000) / 100}%`).join(', ')
  if (paint.type === 'GRADIENT_RADIAL' || paint.type === 'GRADIENT_DIAMOND') return `radial-gradient(${stops})`
  if (paint.type === 'GRADIENT_ANGULAR') return `conic-gradient(${stops})`
  return `linear-gradient(${paint.angle}deg, ${stops})`
}

function background(fills: Paint[], options: StyleOptions): CssDeclarations {
  const [only] = fills
  if (fills.length === 1 && only?.type === 'SOLID') return { 'background-color': colorWithOpacity(only.color, only.opacity) }
  // Figma paints bottom-up, CSS lists backgrounds top-down.
  return { background: [...fills].reverse().map((paint) => paintToCss(paint, options)).join(', ') }
}

function shadows(effects: Effect[], text: boolean): CssDeclarations {
  const css: CssDeclarations = {}
  const drop = effects.filter((effect) => effect.type === 'DROP_SHADOW')
  const inner = effects.filter((effect) => effect.type === 'INNER_SHADOW')
  const shadow = (effect: Effect) => `${px(effect.x ?? 0)} ${px(effect.y ?? 0)} ${px(effect.radius)}`
  if (text) {
    if (drop.length) css['text-shadow'] = drop.map((effect) => `${shadow(effect)} ${effect.color}`).join(', ')
  } else if (drop.length || inner.length) {
    css['box-shadow'] = [
      ...drop.map((effect) => `${shadow(effect)} ${px(effect.spread ?? 0)} ${effect.color}`),
      ...inner.map((effect) => `inset ${shadow(effect)} ${px(effect.spread ?? 0)} ${effect.color}`),
    ].join(', ')
  }
  // Figma blur radii are twice the standard deviation CSS expects.
  const layerBlur = effects.find((effect) => effect.type === 'LAYER_BLUR')
  if (layerBlur) css.filter = `blur(${px(layerBlur.radius / 2)})`
  const backgroundBlur = effects.find((effect) => effect.type === 'BACKGROUND_BLUR')
  if (backgroundBlur) css['backdrop-filter'] = `blur(${px(backgroundBlur.radius / 2)})`
  return css
}

function border(node: DesignNode): CssDeclarations {
  const stroke = node.stroke
  const paint = stroke?.paints[0]
  if (!stroke || !paint) return {}
  const color = isSolidPaint(paint) ? colorWithOpacity(paint.color, paint.opacity) : isMediaPaint(paint) ? 'currentColor' : (paint.stops[0]?.color ?? 'currentColor')
  const style = stroke.dashes ? 'dashed' : 'solid'
  if (stroke.weights) {
    return { 'border-style': style, 'border-color': color, 'border-width': stroke.weights.map(px).join(' '), 'box-sizing': 'border-box' }
  }
  // Outlines never take part in layout, exactly like Figma strokes.
  const offset = stroke.align === 'INSIDE' ? -stroke.weight : stroke.align === 'CENTER' ? -stroke.weight / 2 : 0
  return { outline: `${px(stroke.weight)} ${style} ${color}`, 'outline-offset': px(offset) }
}

export function textStyleToCss(style: Partial<TextStyle>): CssDeclarations {
  const css: CssDeclarations = {}
  if (style.fontFamily) css['font-family'] = `"${style.fontFamily}", sans-serif`
  if (style.fontSize !== undefined) css['font-size'] = px(style.fontSize)
  if (style.fontWeight !== undefined) css['font-weight'] = String(style.fontWeight)
  if (style.italic) css['font-style'] = 'italic'
  if (style.lineHeight) css['line-height'] = style.lineHeight
  if (style.letterSpacing && style.letterSpacing !== '0') css['letter-spacing'] = style.letterSpacing
  if (style.textAlign && style.textAlign !== 'LEFT') css['text-align'] = TEXT_ALIGN[style.textAlign] ?? 'left'
  if (style.textCase && TEXT_CASE[style.textCase]) css['text-transform'] = TEXT_CASE[style.textCase]!
  if (style.textDecoration && TEXT_DECORATION[style.textDecoration]) css['text-decoration'] = TEXT_DECORATION[style.textDecoration]!
  return css
}

export function textColor(fills: Paint[] | undefined, options: StyleOptions): CssDeclarations {
  const paint = fills?.[0]
  if (!paint) return {}
  if (isSolidPaint(paint)) return { color: colorWithOpacity(paint.color, paint.opacity) }
  return { background: paintToCss(paint, options), 'background-clip': 'text', color: 'transparent' }
}

/** Size and position of a node inside a flex or grid parent. */
function flowChild(node: DesignNode, parent: DesignNode): CssDeclarations {
  const css: CssDeclarations = {}
  const layout = parent.layout!
  const horizontal = layout.mode === 'HORIZONTAL'
  const grow = (node.layoutChild?.grow ?? 0) > 0
  const stretch = node.layoutChild?.alignSelf === 'STRETCH'
  const hugsText = node.text?.autoResize === 'WIDTH_AND_HEIGHT'
  const hugs = (axis: 'primary' | 'counter') => (node.layout ? HUG.has(node.layout[`${axis}Sizing`]) : false)
  const ownHorizontal = node.layout?.mode === 'HORIZONTAL'
  const hugsWidth = hugsText || hugs(ownHorizontal ? 'primary' : 'counter')
  const hugsHeight = Boolean(node.text && node.text.autoResize !== 'NONE') || hugs(ownHorizontal ? 'counter' : 'primary')

  // Positioned so that paint order follows layer order, even next to absolute siblings.
  css.position = 'relative'
  if (layout.mode === 'GRID') return { ...css, 'min-width': '0' }
  if (grow) css.flex = '1 0 0'
  if (stretch) css['align-self'] = 'stretch'
  if (!hugsWidth && !(horizontal ? grow : stretch)) css.width = px(node.box.width)
  if (!hugsHeight && !(horizontal ? stretch : grow)) css.height = px(node.box.height)
  if (!grow) css['flex-shrink'] = '0'
  return css
}

/** Absolute position derived from the node's constraints. */
function absoluteChild(node: DesignNode, parent: DesignNode): CssDeclarations {
  const css: CssDeclarations = { position: 'absolute' }
  const { box } = node
  const right = parent.box.width - box.x - box.width
  const bottom = parent.box.height - box.y - box.height
  const horizontal = node.constraints?.horizontal ?? 'MIN'
  const vertical = node.constraints?.vertical ?? 'MIN'
  const hugsText = node.text?.autoResize === 'WIDTH_AND_HEIGHT'

  if (horizontal === 'MAX') css.right = px(right)
  else css.left = px(box.x)
  if (horizontal === 'STRETCH') css.right = px(right)
  else if (!hugsText) css.width = px(box.width)

  if (vertical === 'MAX') css.bottom = px(bottom)
  else css.top = px(box.y)
  if (vertical === 'STRETCH') css.bottom = px(bottom)
  else if (!node.text || node.text.autoResize === 'NONE') css.height = px(box.height)
  return css
}

/**
 * CSS reproducing a node. `parent` decides how the node is placed: as a flex
 * item, absolutely, or as a root when omitted.
 */
export function nodeStyle(node: DesignNode, parent: DesignNode | undefined, options: StyleOptions): CssDeclarations {
  const css: CssDeclarations = {}
  const isVector = Boolean(node.fillPaths || node.strokePaths)
  const inFlow = Boolean(parent?.layout) && !node.layoutChild?.absolute

  if (!parent) Object.assign(css, { position: 'relative', width: px(node.box.width), 'min-height': px(node.box.height) })
  else if (inFlow) Object.assign(css, flowChild(node, parent))
  else Object.assign(css, absoluteChild(node, parent))

  if (node.layout) {
    const { layout } = node
    if (layout.mode === 'GRID') {
      css.display = 'grid'
      css['grid-template-columns'] = `repeat(${layout.columns ?? 1}, minmax(0, 1fr))`
      css.gap = `${px(layout.counterGap ?? 0)} ${px(layout.gap)}`
    } else {
      css.display = 'flex'
      css['flex-direction'] = layout.mode === 'HORIZONTAL' ? 'row' : 'column'
      css['justify-content'] = JUSTIFY[layout.primaryAlign] ?? 'flex-start'
      css['align-items'] = ALIGN[layout.counterAlign] ?? 'flex-start'
      if (layout.gap && layout.primaryAlign !== 'SPACE_BETWEEN') css.gap = px(layout.gap)
      if (layout.wrap) {
        css['flex-wrap'] = 'wrap'
        if (layout.counterGap !== undefined) css['row-gap'] = px(layout.counterGap)
      }
    }
    if (layout.padding.some(Boolean)) css.padding = layout.padding.map(px).join(' ')
    css['box-sizing'] = 'border-box'
  }
  if (node.minSize?.width) css['min-width'] = px(node.minSize.width)
  if (node.maxSize?.width) css['max-width'] = px(node.maxSize.width)

  if (node.text) {
    Object.assign(css, textStyleToCss(node.text.style), textColor(node.fills, options))
    css['white-space'] = node.text.autoResize === 'WIDTH_AND_HEIGHT' ? 'pre' : 'pre-wrap'
    const vertical = JUSTIFY[node.text.style.verticalAlign === 'BOTTOM' ? 'MAX' : node.text.style.verticalAlign]
    if (node.text.autoResize === 'NONE' && vertical && vertical !== 'flex-start') {
      Object.assign(css, { display: 'flex', 'flex-direction': 'column', 'justify-content': vertical })
    }
  } else if (!isVector) {
    if (node.fills?.length) Object.assign(css, background(node.fills, options))
    Object.assign(css, border(node))
  }

  if (node.radius) css['border-radius'] = Array.isArray(node.radius) ? node.radius.map(px).join(' ') : px(node.radius)
  if (node.type === 'ELLIPSE' && !isVector) css['border-radius'] = '50%'
  if (node.opacity !== undefined && node.opacity < 1) css.opacity = String(node.opacity)
  if (node.effects?.length) {
    if (isVector) {
      const drop = node.effects.filter((effect) => effect.type === 'DROP_SHADOW')
      if (drop.length) css.filter = drop.map((e) => `drop-shadow(${px(e.x ?? 0)} ${px(e.y ?? 0)} ${px(e.radius)} ${e.color})`).join(' ')
    } else Object.assign(css, shadows(node.effects, Boolean(node.text)))
  }
  if (node.clips) css.overflow = 'hidden'
  Object.assign(css, maskDeclarations(node))
  if (node.blendMode) css['mix-blend-mode'] = node.blendMode.toLowerCase().replace(/_/g, '-')
  if (node.rotation) Object.assign(css, { transform: `rotate(${node.rotation}deg)`, 'transform-origin': '0 0' })
  return css
}

export const toInlineStyle = (css: CssDeclarations) =>
  Object.entries(css)
    .map(([property, value]) => `${property}: ${value}`)
    .join('; ')
