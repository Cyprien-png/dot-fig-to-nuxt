import type {
  AutoLayout,
  ComponentInfo,
  DesignNode,
  InstanceInfo,
  Interaction,
  NodePatch,
  OverrideMap,
  Stroke,
  VectorPath,
} from '../design/model.ts'
import { blobToSvgPath } from './geometry.ts'
import { normalizeEffects, normalizePaints, round, type MediaSink } from './paint.ts'
import { guidToId, type RawDocument, type RawNode } from './raw.ts'
import { DEFAULT_TEXT_STYLE, textRangesOf, textStyleOf } from './text.ts'

const TYPE_NAMES: Record<string, string> = { SYMBOL: 'COMPONENT', ROUNDED_RECTANGLE: 'RECTANGLE' }
const CONTAINER_TYPES = new Set(['FRAME', 'SYMBOL', 'INSTANCE', 'SECTION'])
const VECTOR_TYPES = new Set(['VECTOR', 'LINE', 'ELLIPSE', 'STAR', 'REGULAR_POLYGON', 'BOOLEAN_OPERATION'])
const TEXT_KEYS = ['textData', 'fontName', 'fontSize', 'lineHeight', 'letterSpacing', 'textAlignHorizontal', 'textCase']
const LAYOUT_MODES = new Set(['HORIZONTAL', 'VERTICAL', 'GRID'])

function typeOf(raw: RawNode): string {
  if (raw.isStateGroup) return 'COMPONENT_SET'
  return TYPE_NAMES[raw.type] ?? raw.type
}

function layoutOf(raw: RawNode): AutoLayout {
  const vertical = raw.stackVerticalPadding ?? raw.stackPadding ?? 0
  const horizontal = raw.stackHorizontalPadding ?? raw.stackPadding ?? 0
  const layout: AutoLayout = {
    mode: raw.stackMode,
    gap: round(raw.stackSpacing ?? 0),
    padding: [
      round(vertical),
      round(raw.stackPaddingRight ?? horizontal),
      round(raw.stackPaddingBottom ?? vertical),
      round(horizontal),
    ],
    primaryAlign: raw.stackPrimaryAlignItems ?? raw.stackJustify ?? 'MIN',
    counterAlign: raw.stackCounterAlignItems ?? raw.stackCounterAlign ?? 'MIN',
    wrap: raw.stackWrap === 'WRAP',
    primarySizing: raw.stackPrimarySizing ?? 'FIXED',
    counterSizing: raw.stackCounterSizing ?? 'FIXED',
  }
  if (raw.stackCounterSpacing !== undefined) layout.counterGap = round(raw.stackCounterSpacing)
  if (raw.stackMode === 'GRID') {
    layout.gap = round(raw.gridColumnGap ?? 0)
    layout.counterGap = round(raw.gridRowGap ?? 0)
    layout.columns = raw.gridColumns?.entries?.length ?? 1
    layout.rows = raw.gridRows?.entries?.length ?? 1
  }
  return layout
}

function radiusOf(raw: RawNode): DesignNode['radius'] {
  const corners = [
    raw.rectangleTopLeftCornerRadius,
    raw.rectangleTopRightCornerRadius,
    raw.rectangleBottomRightCornerRadius,
    raw.rectangleBottomLeftCornerRadius,
  ]
  if (corners.some((corner) => corner !== undefined)) {
    const [tl, tr, br, bl] = corners.map((corner) => round(corner ?? raw.cornerRadius ?? 0)) as [number, number, number, number]
    if (tl !== tr || tr !== br || br !== bl) return [tl, tr, br, bl]
    return tl
  }
  return raw.cornerRadius === undefined ? undefined : round(raw.cornerRadius)
}

function interactionsOf(raw: RawNode): Interaction[] {
  const result: Interaction[] = []
  for (const interaction of raw.prototypeInteractions ?? []) {
    for (const action of interaction.actions ?? []) {
      const entry: Interaction = {
        trigger: interaction.event?.interactionType ?? 'ON_CLICK',
        action: action.connectionType === 'URL' ? 'URL' : (action.navigationType ?? action.connectionType ?? 'NAVIGATE'),
      }
      const destinationId = guidToId(action.transitionNodeID)
      if (destinationId) entry.destinationId = destinationId
      if (action.connectionURL) entry.url = action.connectionURL
      if (action.transitionType) entry.transition = action.transitionType
      if (action.transitionDuration !== undefined) entry.duration = Math.round(action.transitionDuration * 1000)
      if (action.easingType) entry.easing = action.easingType
      if (interaction.event?.transitionTimeout) entry.delay = Math.round(interaction.event.transitionTimeout * 1000)
      result.push(entry)
    }
  }
  return result
}

function componentOf(raw: RawNode): ComponentInfo {
  const info: ComponentInfo = {}
  const key = raw.componentKey ?? raw.key
  if (key) info.key = key
  const description = raw.symbolDescription || raw.description
  if (description) info.description = description
  if (raw.sourceLibraryKey) info.libraryKey = raw.sourceLibraryKey
  if (raw.isStateGroup) info.isSet = true
  if (raw.variantPropSpecs?.length && typeof raw.name === 'string') {
    info.variant = Object.fromEntries(
      raw.name.split(',').map((pair: string) => pair.split('=').map((part) => part.trim()) as [string, string]),
    )
  }
  if (raw.componentPropDefs?.length) {
    info.properties = raw.componentPropDefs.map((def: RawNode) => ({
      id: guidToId(def.id) ?? '',
      name: def.name,
      type: def.type,
    }))
  }
  return info
}

function propValue(assignment: RawNode): string | boolean | undefined {
  const value = assignment.value ?? assignment.varValue?.value
  return value?.boolValue ?? value?.textValue?.characters ?? guidToId(value?.guidValue)
}

/** Drops the values a consumer can assume, keeping the stored document small. */
function stripDefaults(node: DesignNode): DesignNode {
  if (node.opacity === 1) delete node.opacity
  if (node.blendMode === 'PASS_THROUGH' || node.blendMode === 'NORMAL') delete node.blendMode
  if (!node.rotation) delete node.rotation
  if (!node.fills?.length) delete node.fills
  if (!node.stroke?.paints.length) delete node.stroke
  if (!node.effects?.length) delete node.effects
  if (!node.radius) delete node.radius
  if (!node.fillPaths?.length) delete node.fillPaths
  if (!node.strokePaths?.length) delete node.strokePaths
  if (!node.interactions?.length) delete node.interactions
  if (!node.clips) delete node.clips
  return node
}

export interface Normalizer {
  /** Normalises a node and its whole subtree. */
  node: (raw: RawNode) => DesignNode
  /** Hashes of every referenced image, with the bytes when embedded in the stream. */
  media: Map<string, Uint8Array | undefined>
}

export function createNormalizer(document: RawDocument, isSkipped: (raw: RawNode) => boolean): Normalizer {
  const media = new Map<string, Uint8Array | undefined>()
  const onMedia: MediaSink = (hash, bytes) => {
    if (bytes || !media.has(hash)) media.set(hash, bytes ?? media.get(hash))
  }

  const paths = (geometry: RawNode[] | undefined): VectorPath[] =>
    (geometry ?? [])
      .map((entry) => ({
        d: blobToSvgPath(document.blobs[entry.commandsBlob]),
        rule: entry.windingRule === 'ODD' ? ('evenodd' as const) : ('nonzero' as const),
      }))
      .filter((path) => path.d)

  /** Maps the properties present on `raw`; shared by nodes and instance overrides. */
  function patch(raw: RawNode, type: string | undefined): NodePatch {
    const size = { x: raw.size?.x ?? 0, y: raw.size?.y ?? 0 }
    const paints = (list: RawNode[] | undefined) => normalizePaints(list, size, document.blobs, onMedia)
    const result: NodePatch = {}

    if (raw.name !== undefined) result.name = raw.name
    if (raw.visible !== undefined) result.visible = raw.visible
    if (raw.size || raw.transform) {
      result.box = {}
      if (raw.transform) {
        result.box.x = round(raw.transform.m02)
        result.box.y = round(raw.transform.m12)
        result.rotation = round((Math.atan2(raw.transform.m10, raw.transform.m00) * 180) / Math.PI, 2)
      }
      if (raw.size) {
        result.box.width = round(size.x)
        result.box.height = round(size.y)
      }
    }
    if (raw.opacity !== undefined) result.opacity = round(raw.opacity, 3)
    if (raw.blendMode !== undefined) result.blendMode = raw.blendMode
    if (raw.fillPaints) result.fills = paints(raw.fillPaints)
    if (raw.strokePaints) {
      const stroke: Stroke = {
        paints: paints(raw.strokePaints),
        weight: round(raw.strokeWeight ?? 1),
        align: raw.strokeAlign ?? 'INSIDE',
      }
      if (raw.borderStrokeWeightsIndependent) {
        const side = (value: number | undefined) => round(value ?? raw.strokeWeight ?? 0)
        stroke.weights = [side(raw.borderTopWeight), side(raw.borderRightWeight), side(raw.borderBottomWeight), side(raw.borderLeftWeight)]
      }
      if (raw.dashPattern?.length) stroke.dashes = raw.dashPattern.map((dash: number) => round(dash))
      result.stroke = stroke
    }
    const radius = radiusOf(raw)
    if (radius !== undefined) result.radius = radius
    if (raw.effects) result.effects = normalizeEffects(raw.effects)
    if (raw.frameMaskDisabled !== undefined) result.clips = !raw.frameMaskDisabled
    if (raw.mask) result.mask = true
    if (LAYOUT_MODES.has(raw.stackMode)) result.layout = layoutOf(raw)
    if (raw.stackChildPrimaryGrow !== undefined || raw.stackChildAlignSelf !== undefined || raw.stackPositioning !== undefined) {
      result.layoutChild = {
        grow: raw.stackChildPrimaryGrow ?? 0,
        alignSelf: raw.stackChildAlignSelf ?? 'AUTO',
        absolute: raw.stackPositioning === 'ABSOLUTE',
      }
    }
    if (raw.horizontalConstraint || raw.verticalConstraint) {
      result.constraints = { horizontal: raw.horizontalConstraint ?? 'MIN', vertical: raw.verticalConstraint ?? 'MIN' }
    }
    for (const key of ['minSize', 'maxSize'] as const) {
      const value = raw[key]?.value ?? raw[key]
      if (value) result[key] = { width: value.x && round(value.x), height: value.y && round(value.y) }
    }
    if (TEXT_KEYS.some((key) => raw[key] !== undefined)) {
      result.text = { style: textStyleOf(raw) }
      if (raw.textData?.characters !== undefined) result.text.characters = raw.textData.characters
      if (raw.textAutoResize) result.text.autoResize = raw.textAutoResize
      const ranges = textRangesOf(raw.textData, paints)
      if (ranges.length) result.text.ranges = ranges
      const styleId = guidToId(raw.styleIdForText?.guid)
      if (styleId) result.text.styleId = styleId
      if (raw.hyperlink?.url) result.text.link = raw.hyperlink.url
    }
    if (type && VECTOR_TYPES.has(type)) {
      if (raw.fillGeometry) result.fillPaths = paths(raw.fillGeometry)
      if (raw.strokeGeometry) result.strokePaths = paths(raw.strokeGeometry)
    }
    const fillStyleId = guidToId(raw.styleIdForFill?.guid ?? raw.inheritFillStyleID)
    if (fillStyleId) result.fillStyleId = fillStyleId
    if (raw.prototypeInteractions) result.interactions = interactionsOf(raw)
    if (raw.exportSettings?.length) result.exportable = true
    const swapped = guidToId(raw.overriddenSymbolID)
    if (swapped) result.instance = { componentId: swapped }
    if (raw.componentPropRefs?.length) {
      result.propRefs = Object.fromEntries(
        raw.componentPropRefs.map((ref: RawNode) => [ref.componentPropNodeField, guidToId(ref.defID) ?? '']),
      )
    }
    return result
  }

  function instanceOf(raw: RawNode): InstanceInfo | undefined {
    const componentId = guidToId(raw.overriddenSymbolID ?? raw.symbolData?.symbolID)
    if (!componentId) return undefined
    const info: InstanceInfo = { componentId }

    // Derived data is Figma's cached layout of the instance; explicit overrides win over it.
    const overrides: OverrideMap = {}
    for (const entry of [...(raw.derivedSymbolData ?? []), ...(raw.symbolData?.symbolOverrides ?? [])]) {
      const path = (entry.guidPath?.guids ?? []).map(guidToId).join('/')
      if (!path) continue
      const previous = overrides[path]
      const next = patch(entry, undefined)
      overrides[path] = {
        ...previous,
        ...next,
        ...(previous?.box || next.box ? { box: { ...previous?.box, ...next.box } } : {}),
        ...(previous?.text || next.text
          ? { text: { ...previous?.text, ...next.text, style: { ...previous?.text?.style, ...next.text?.style } } }
          : {}),
      }
    }
    if (Object.keys(overrides).length) info.overrides = overrides

    const props: Record<string, string | boolean> = {}
    for (const assignment of raw.componentPropAssignments ?? []) {
      const id = guidToId(assignment.defID)
      const value = propValue(assignment)
      if (id && value !== undefined) props[id] = value
    }
    if (Object.keys(props).length) info.props = props
    return info
  }

  function node(raw: RawNode): DesignNode {
    const type = typeOf(raw)
    const mapped = patch(raw, raw.type)
    const result: DesignNode = {
      id: guidToId(raw.guid) ?? '',
      name: raw.name ?? '',
      type,
      visible: raw.visible !== false,
      ...mapped,
      box: { x: 0, y: 0, width: 0, height: 0, ...mapped.box },
      text: undefined,
      instance: undefined,
    }
    delete result.text
    delete result.instance

    if (raw.type === 'TEXT') {
      result.text = {
        characters: raw.textData?.characters ?? '',
        autoResize: raw.textAutoResize ?? 'NONE',
        ...mapped.text,
        style: { ...DEFAULT_TEXT_STYLE, ...mapped.text?.style },
      }
    }
    // Frames clip their content unless told otherwise; instances inherit it from their component.
    if (CONTAINER_TYPES.has(raw.type) && raw.type !== 'INSTANCE' && raw.frameMaskDisabled === undefined) result.clips = true
    if (raw.type === 'SYMBOL' || raw.isStateGroup) result.component = componentOf(raw)
    if (raw.type === 'INSTANCE') {
      const instance = instanceOf(raw)
      if (instance) result.instance = instance
    }

    const children = document.childrenOf(raw).filter((child) => !isSkipped(child))
    if (children.length) result.children = children.map(node)
    return stripDefaults(result)
  }

  return { node, media }
}
