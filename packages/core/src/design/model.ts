/**
 * Normalised, JSON-safe design model.
 *
 * It is the only shape the rest of the code base knows about: the kiwi-encoded
 * Figma schema stays confined to the `fig/` folder. Field order is stable and
 * numbers are rounded so the serialised document diffs cleanly in git.
 */

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export interface GradientStop {
  color: string
  position: number
}

export interface SolidPaint {
  type: 'SOLID'
  color: string
  opacity: number
  /** Id of the variable the colour is bound to. */
  variable?: string
}

export interface GradientPaint {
  type: 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'GRADIENT_DIAMOND'
  stops: GradientStop[]
  opacity: number
  /** CSS angle in degrees, only meaningful for linear gradients. */
  angle: number
}

export interface MediaPaint {
  type: 'IMAGE' | 'VIDEO'
  hash: string
  scaleMode: string
  opacity: number
  alt?: string
}

export type Paint = SolidPaint | GradientPaint | MediaPaint

export const isSolidPaint = (paint: Paint): paint is SolidPaint => paint.type === 'SOLID'
export const isMediaPaint = (paint: Paint): paint is MediaPaint => paint.type === 'IMAGE' || paint.type === 'VIDEO'

export interface Stroke {
  paints: Paint[]
  weight: number
  /** Per-side weights `[top, right, bottom, left]` when they differ. */
  weights?: [number, number, number, number]
  align: 'INSIDE' | 'OUTSIDE' | 'CENTER'
  dashes?: number[]
}

export interface Effect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR'
  color?: string
  x?: number
  y?: number
  radius: number
  spread?: number
}

export interface AutoLayout {
  mode: 'HORIZONTAL' | 'VERTICAL' | 'GRID'
  gap: number
  counterGap?: number
  /** `[top, right, bottom, left]` */
  padding: [number, number, number, number]
  primaryAlign: string
  counterAlign: string
  wrap: boolean
  primarySizing: string
  counterSizing: string
  /** Grid track counts, only for `GRID`. */
  columns?: number
  rows?: number
}

export interface LayoutChild {
  grow: number
  alignSelf: string
  absolute: boolean
}

export interface TextStyle {
  fontFamily: string
  fontStyle: string
  fontWeight: number
  italic: boolean
  fontSize: number
  /** CSS-ready value, e.g. `"24px"`, `"140%"` or `"normal"`. */
  lineHeight: string
  /** CSS-ready value, e.g. `"-0.5px"` or `"0.02em"`. */
  letterSpacing: string
  textAlign: string
  verticalAlign: string
  textCase: string
  textDecoration: string
}

export interface TextRange {
  start: number
  end: number
  style: Partial<TextStyle>
  fills?: Paint[]
  link?: string
}

export interface TextContent {
  characters: string
  style: TextStyle
  autoResize: string
  ranges?: TextRange[]
  /** Id of the shared text style, when one is applied. */
  styleId?: string
  link?: string
}

export interface VectorPath {
  d: string
  rule: 'nonzero' | 'evenodd'
}

export interface Interaction {
  trigger: string
  action: string
  destinationId?: string
  url?: string
  transition?: string
  duration?: number
  easing?: string
  delay?: number
}

export interface ComponentInfo {
  key?: string
  description?: string
  /** Remote library the component was published from. */
  libraryKey?: string
  /** `true` for a variant set (Figma "component set"). */
  isSet?: boolean
  /** Variant values of a component living in a set, e.g. `{ Weight: "Bold" }`. */
  variant?: Record<string, string>
  /** Properties declared by a component or component set. */
  properties?: { id: string; name: string; type: string }[]
}

/** A partial node: what an instance changes on a layer of its component. */
export type NodePatch = Omit<Partial<DesignNode>, 'box' | 'text' | 'instance'> & {
  box?: Partial<Box>
  text?: Partial<Omit<TextContent, 'style'>> & { style?: Partial<TextStyle> }
  instance?: Partial<InstanceInfo>
}

/** Patches keyed by the `/`-joined path of ids leading to the overridden layer. */
export type OverrideMap = Record<string, NodePatch>

export interface InstanceInfo {
  componentId: string
  overrides?: OverrideMap
  /** Component property assignments keyed by property id. */
  props?: Record<string, string | boolean>
}

export interface DesignNode {
  id: string
  name: string
  type: string
  visible: boolean
  box: Box
  rotation?: number
  opacity?: number
  blendMode?: string
  fills?: Paint[]
  stroke?: Stroke
  /** Uniform radius or `[topLeft, topRight, bottomRight, bottomLeft]`. */
  radius?: number | [number, number, number, number]
  effects?: Effect[]
  clips?: boolean
  mask?: boolean
  layout?: AutoLayout
  layoutChild?: LayoutChild
  constraints?: { horizontal: string; vertical: string }
  minSize?: { width?: number; height?: number }
  maxSize?: { width?: number; height?: number }
  text?: TextContent
  fillPaths?: VectorPath[]
  strokePaths?: VectorPath[]
  component?: ComponentInfo
  instance?: InstanceInfo
  /** Component property bindings: node field -> property id. */
  propRefs?: Record<string, string>
  interactions?: Interaction[]
  /** Id of the shared fill style, when one is applied. */
  fillStyleId?: string
  exportable?: boolean
  /** `true` when the node only exists through an expanded instance. */
  derived?: boolean
  children?: DesignNode[]
}

export interface DesignPage {
  id: string
  name: string
  background?: string
  /** Figma's hidden page holding styles and copies of library components. */
  internal: boolean
  children: DesignNode[]
}

export interface NamedStyle {
  id: string
  name: string
  type: 'FILL' | 'TEXT' | 'EFFECT' | 'GRID'
  fills?: Paint[]
  text?: TextStyle
  effects?: Effect[]
}

export interface DesignVariable {
  id: string
  name: string
  collection: string
  type: string
  /** Values per mode name. Colours are CSS strings, aliases are `{ alias: id }`. */
  values: Record<string, string | number | boolean | { alias: string }>
}

export interface DesignDocument {
  name: string
  /** Version of the fig-kiwi container the document was read from. */
  figVersion: number
  pages: DesignPage[]
  styles: NamedStyle[]
  variables: DesignVariable[]
}

export interface MediaAsset {
  hash: string
  bytes: Uint8Array
}
