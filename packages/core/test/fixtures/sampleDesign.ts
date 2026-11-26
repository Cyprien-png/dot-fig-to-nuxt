import { at, buildFig, guid, pathBlob, solid, type FixtureNode } from './buildFig.ts'

const PNG_1X1 = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (char) => char.charCodeAt(0),
)

export const HASH_A = 'aa'.repeat(20)
export const HASH_B = 'bb'.repeat(20)
const hashBytes = (hex: string) => Uint8Array.from(hex.match(/../g)!, (pair) => parseInt(pair, 16))

const image = (hash: string) => ({
  type: 'IMAGE',
  opacity: 1,
  visible: true,
  imageScaleMode: 'FILL',
  image: { hash: hashBytes(hash), name: 'cover' },
})
const font = (style: string) => ({ family: 'Inter', style, postscript: `Inter-${style}` })
const text = (characters: string, style: string, fontSize: number) => ({
  textData: { characters },
  fontName: font(style),
  fontSize,
  lineHeight: { value: fontSize * 1.2, units: 'PIXELS' },
  textAutoResize: 'WIDTH_AND_HEIGHT',
})
const override = (target: number, characters: string) => ({ guidPath: { guids: [guid(target)] }, textData: { characters } })

const WHITE = solid(1, 1, 1)
const INK = solid(0.067, 0.094, 0.153)

export interface SampleOptions {
  /** Second revision: new headline, new brand colour, one card removed, a tagline added. */
  revised?: boolean
  zip?: boolean
}

/** A small landing page with a desktop and a mobile frame, components, an icon and a card list. */
export function sampleFig({ revised = false, zip = true }: SampleOptions = {}): Uint8Array {
  const brand = revised ? solid(0.882, 0.114, 0.282) : solid(0.31, 0.275, 0.898)
  const card = (id: number, title: string, cover?: string): FixtureNode => ({
    id,
    parent: 32,
    type: 'INSTANCE',
    name: 'Card',
    size: { x: 300, y: 200 },
    transform: at((id - 33) * 324, 0),
    symbolData: {
      symbolID: guid(10),
      symbolOverrides: [
        override(12, title),
        override(13, `${title} description`),
        ...(cover ? [{ guidPath: { guids: [guid(11)] }, fillPaints: [image(cover)] }] : []),
      ],
    },
  })

  const nodes: FixtureNode[] = [
    { id: 0, type: 'DOCUMENT', name: 'Document' },
    { id: 1, parent: 0, type: 'CANVAS', name: 'Internal Only Canvas', internalOnly: true },
    { id: 2, parent: 0, type: 'CANVAS', name: 'Design' },
    { id: 50, parent: 1, type: 'RECTANGLE', name: 'Brand/Primary', styleType: 'FILL', fillPaints: [brand] },

    { id: 10, parent: 2, type: 'SYMBOL', name: 'Card', size: { x: 300, y: 200 }, transform: at(2000, 0), fillPaints: [WHITE], cornerRadius: 16, stackMode: 'VERTICAL', stackSpacing: 12 },
    { id: 11, parent: 10, type: 'ROUNDED_RECTANGLE', name: 'Cover', size: { x: 300, y: 120 }, transform: at(0, 0), fillPaints: [image(HASH_A)] },
    { id: 12, parent: 10, type: 'TEXT', name: 'Title', size: { x: 120, y: 24 }, transform: at(0, 132), fillPaints: [INK], ...text('Card title', 'Bold', 20) },
    { id: 13, parent: 10, type: 'TEXT', name: 'Body', size: { x: 200, y: 17 }, transform: at(0, 168), fillPaints: [INK], ...text('Card body', 'Regular', 14) },

    { id: 20, parent: 2, type: 'SYMBOL', name: 'lucide/arrow-right', size: { x: 24, y: 24 }, transform: at(2400, 0) },
    { id: 21, parent: 20, type: 'VECTOR', name: 'Vector', size: { x: 16, y: 16 }, transform: at(4, 4), fillPaints: [INK], fillGeometry: [{ windingRule: 'NONZERO', commandsBlob: 0 }] },

    { id: 30, parent: 2, type: 'FRAME', name: 'Home / Desktop', size: { x: 1440, y: 900 }, transform: at(0, 0), fillPaints: [WHITE], stackMode: 'VERTICAL', stackSpacing: 32, stackHorizontalPadding: 64, stackVerticalPadding: 64 },
    { id: 31, parent: 30, type: 'TEXT', name: 'Headline', size: { x: 600, y: 77 }, transform: at(64, 64), fillPaints: [INK], ...text(revised ? 'Build much faster' : 'Build faster', 'Bold', 64) },
    { id: 32, parent: 30, type: 'FRAME', name: 'Cards', size: { x: 1312, y: 200 }, transform: at(64, 173), stackMode: 'HORIZONTAL', stackSpacing: 24 },
    card(33, 'Alpha'),
    card(34, 'Beta', HASH_B),
    ...(revised ? [] : [card(35, 'Gamma')]),
    {
      id: 36, parent: 30, type: 'FRAME', name: 'Button', size: { x: 160, y: 48 }, transform: at(64, 405), fillPaints: [brand], cornerRadius: 8, stackMode: 'HORIZONTAL', stackSpacing: 8,
      prototypeInteractions: [{ event: { interactionType: 'ON_CLICK' }, actions: [{ transitionNodeID: guid(40), navigationType: 'NAVIGATE', transitionType: 'DISSOLVE', transitionDuration: 0.3, easingType: 'EASE_OUT' }] }],
    },
    { id: 38, parent: 36, type: 'TEXT', name: 'Label', size: { x: 90, y: 19 }, transform: at(16, 14), fillPaints: [WHITE], ...text('Get started', 'Medium', 16) },
    { id: 39, parent: 36, type: 'INSTANCE', name: 'lucide/arrow-right', size: { x: 24, y: 24 }, transform: at(114, 12), symbolData: { symbolID: guid(20) } },
    ...(revised ? [{ id: 37, parent: 30, type: 'TEXT', name: 'Tagline', size: { x: 300, y: 22 }, transform: at(64, 485), fillPaints: [INK], ...text('No design drift', 'Regular', 18) }] : []),

    { id: 40, parent: 2, type: 'FRAME', name: 'Home / Mobile', size: { x: 375, y: 800 }, transform: at(1600, 0), fillPaints: [WHITE] },
    { id: 41, parent: 40, type: 'TEXT', name: 'Headline', size: { x: 300, y: 38 }, transform: at(24, 48), fillPaints: [INK], ...text('Build faster', 'Bold', 32) },
  ]

  return buildFig({
    nodes,
    blobs: [pathBlob([[0, 8], [16, 8], [8, 0]])],
    images: { [HASH_A]: PNG_1X1, [HASH_B]: PNG_1X1 },
    zip,
    fileName: 'Sample landing',
  })
}
