import type { DesignDocument, DesignVariable, MediaAsset, NamedStyle } from '../design/model.ts'
import { readFigContainer } from './container.ts'
import { createNormalizer } from './normalize.ts'
import { normalizeEffects, toCssColor, toHex } from './paint.ts'
import { decodeRawDocument, guidToId, type RawDocument, type RawNode } from './raw.ts'

export interface ParsedFig {
  document: DesignDocument
  media: MediaAsset[]
  thumbnail?: Uint8Array
}

const isVariable = (raw: RawNode) => raw.type === 'VARIABLE' || raw.type === 'VARIABLE_SET'
/** Shared styles and variables are stored as hidden nodes: they are tokens, not layers. */
const isDefinition = (raw: RawNode) => Boolean(raw.styleType) || isVariable(raw)

function variableValue(data: RawNode | undefined): DesignVariable['values'][string] | undefined {
  const value = data?.value
  if (!value) return undefined
  const alias = guidToId(value.alias?.guid)
  if (alias) return { alias }
  if (value.colorValue) return value.colorValue.a < 1 ? toCssColor(value.colorValue) : toHex(value.colorValue)
  return value.floatValue ?? value.boolValue ?? value.textValue
}

function readVariables(raw: RawDocument): DesignVariable[] {
  const sets = new Map<string, RawNode>()
  for (const node of raw.all) if (node.type === 'VARIABLE_SET') sets.set(guidToId(node.guid) ?? '', node)

  return raw.all
    .filter((node) => node.type === 'VARIABLE')
    .map((node) => {
      const set = sets.get(guidToId(node.variableSetID?.guid) ?? '')
      const modes = new Map<string, string>(
        (set?.variableSetModes ?? []).map((mode: RawNode) => [guidToId(mode.id) ?? '', mode.name]),
      )
      const values: DesignVariable['values'] = {}
      for (const entry of node.variableDataValues?.entries ?? []) {
        const value = variableValue(entry.variableData)
        if (value !== undefined) values[modes.get(guidToId(entry.modeID) ?? '') ?? 'default'] = value
      }
      return {
        id: guidToId(node.guid) ?? '',
        name: node.name,
        collection: set?.name ?? '',
        type: node.variableResolvedType ?? 'UNKNOWN',
        values,
      }
    })
}

/** Parses a .fig file into the normalised design model. */
export function parseFig(bytes: Uint8Array): ParsedFig {
  const container = readFigContainer(bytes)
  const raw = decodeRawDocument(container)
  const normalizer = createNormalizer(raw, isDefinition)

  const pages = raw
    .childrenOf(raw.root)
    .filter((node) => node.type === 'CANVAS')
    .map((canvas) => ({
      id: guidToId(canvas.guid) ?? '',
      name: canvas.name ?? '',
      ...(canvas.backgroundColor && { background: toHex(canvas.backgroundColor) }),
      internal: canvas.internalOnly === true,
      children: raw
        .childrenOf(canvas)
        .filter((node) => !isDefinition(node))
        .map(normalizer.node),
    }))

  const styles: NamedStyle[] = raw.all
    .filter((node) => node.styleType)
    .map((node) => {
      const normalized = normalizer.node(node)
      return {
        id: normalized.id,
        name: normalized.name,
        type: node.styleType,
        ...(node.styleType === 'FILL' && { fills: normalized.fills ?? [] }),
        ...(node.styleType === 'TEXT' && normalized.text && { text: normalized.text.style }),
        ...(node.styleType === 'EFFECT' && { effects: normalizeEffects(node.effects) }),
      }
    })

  const media: MediaAsset[] = []
  for (const [hash, embedded] of normalizer.media) {
    const content = container.images.get(hash) ?? embedded
    if (content) media.push({ hash, bytes: content })
  }
  media.sort((a, b) => a.hash.localeCompare(b.hash))

  return {
    document: {
      name: container.meta?.file_name ?? raw.root.name ?? 'Untitled',
      figVersion: container.version,
      pages,
      styles,
      variables: readVariables(raw),
    },
    media,
    thumbnail: container.thumbnail,
  }
}
