import { deflateSync, zipSync } from 'fflate'
import { compileSchema, encodeBinarySchema, parseSchema } from 'kiwi-schema'

/**
 * Builds real .fig files for tests. The schema mirrors the subset of Figma's
 * own field names the parser reads; since every file embeds its schema, the
 * parser cannot tell these files from ones written by Figma.
 */
const SCHEMA = parseSchema(`
struct GUID { uint sessionID; uint localID; }
struct Color { float r; float g; float b; float a; }
struct Vector { float x; float y; }
struct Matrix { float m00; float m01; float m02; float m10; float m11; float m12; }
message ParentIndex { GUID guid = 1; string position = 2; }
message FontName { string family = 1; string style = 2; string postscript = 3; }
message Number { float value = 1; string units = 2; }
message Image { byte[] hash = 1; string name = 2; }
message Paint { string type = 1; Color color = 2; float opacity = 3; bool visible = 4; Image image = 5; string imageScaleMode = 6; }
message TextData { string characters = 1; }
message GUIDPath { GUID[] guids = 1; }
message SymbolOverride { GUIDPath guidPath = 1; TextData textData = 2; Paint[] fillPaints = 3; }
message SymbolData { GUID symbolID = 1; SymbolOverride[] symbolOverrides = 2; }
message Path { string windingRule = 1; uint commandsBlob = 2; }
message Action { GUID transitionNodeID = 1; string navigationType = 2; string transitionType = 3; float transitionDuration = 4; string easingType = 5; }
message Event { string interactionType = 1; }
message Interaction { Event event = 1; Action[] actions = 2; }
message NodeChange {
  GUID guid = 1; string phase = 2; ParentIndex parentIndex = 3; string type = 4; string name = 5;
  bool visible = 6; float opacity = 7; Vector size = 8; Matrix transform = 9; Paint[] fillPaints = 10;
  float cornerRadius = 11; string stackMode = 12; float stackSpacing = 13; float fontSize = 14;
  FontName fontName = 15; TextData textData = 16; SymbolData symbolData = 17; Path[] fillGeometry = 18;
  bool internalOnly = 19; string styleType = 20; Number lineHeight = 21; float stackHorizontalPadding = 22;
  float stackVerticalPadding = 23; Interaction[] prototypeInteractions = 24; string textAutoResize = 25;
}
message Blob { byte[] bytes = 1; }
message Message { string type = 1; NodeChange[] nodeChanges = 2; Blob[] blobs = 3; }
`)

export type FixtureNode = Record<string, unknown> & { id: number; parent?: number; type: string; name: string }

export const guid = (localID: number) => ({ sessionID: 1, localID })
export const solid = (r: number, g: number, b: number) => ({ type: 'SOLID', color: { r, g, b, a: 1 }, opacity: 1, visible: true })
export const at = (x: number, y: number) => ({ m00: 1, m01: 0, m02: x, m10: 0, m11: 1, m12: y })

/** Encodes `M x y L x y … Z` as a Figma path command blob. */
export function pathBlob(points: [number, number][]): Uint8Array {
  const bytes = new Uint8Array(points.length * 9 + 1)
  const view = new DataView(bytes.buffer)
  points.forEach(([x, y], i) => {
    view.setUint8(i * 9, i === 0 ? 1 : 2)
    view.setFloat32(i * 9 + 1, x, true)
    view.setFloat32(i * 9 + 5, y, true)
  })
  return bytes
}

export interface FixtureOptions {
  nodes: FixtureNode[]
  blobs?: Uint8Array[]
  images?: Record<string, Uint8Array>
  /** Wrap the canvas in a zip archive like recent Figma exports. */
  zip?: boolean
  fileName?: string
}

export function buildFig({ nodes, blobs = [], images = {}, zip = true, fileName = 'Fixture' }: FixtureOptions): Uint8Array {
  const order = new Map<number | undefined, number>()
  const nodeChanges = nodes.map(({ id, parent, ...rest }) => {
    const index = order.get(parent) ?? 0
    order.set(parent, index + 1)
    return {
      guid: guid(id),
      phase: 'CREATED',
      ...(parent !== undefined && { parentIndex: { guid: guid(parent), position: String.fromCharCode(33 + index) } }),
      visible: true,
      opacity: 1,
      ...rest,
    }
  })

  const compiled = compileSchema(SCHEMA)
  const message = compiled.encodeMessage({ type: 'NODE_CHANGES', nodeChanges, blobs: blobs.map((bytes) => ({ bytes })) })
  const chunks = [deflateSync(encodeBinarySchema(SCHEMA)), deflateSync(message)]

  const canvas = new Uint8Array(12 + chunks.reduce((total, chunk) => total + 4 + chunk.length, 0))
  const view = new DataView(canvas.buffer)
  canvas.set(new TextEncoder().encode('fig-kiwi'))
  view.setUint32(8, 106, true)
  let offset = 12
  for (const chunk of chunks) {
    view.setUint32(offset, chunk.length, true)
    canvas.set(chunk, offset + 4)
    offset += 4 + chunk.length
  }
  if (!zip) return canvas

  const entries: Record<string, Uint8Array> = {
    'canvas.fig': canvas,
    'meta.json': new TextEncoder().encode(JSON.stringify({ file_name: fileName })),
  }
  for (const [hash, bytes] of Object.entries(images)) entries[`images/${hash}`] = bytes
  return zipSync(entries)
}
