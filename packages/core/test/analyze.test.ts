import { describe, expect, it } from 'vitest'
import { analyzeDesign } from '../src/extract/analyze.ts'
import { describeMedia } from '../src/extract/media.ts'
import { parseFig } from '../src/index.ts'
import { HASH_A, HASH_B, sampleFig } from './fixtures/sampleDesign.ts'

describe('analyzeDesign', () => {
  const { summary, collections, files } = analyzeDesign(parseFig(sampleFig()))

  it('names colours after their Figma style and counts usage', () => {
    expect(summary.colors[0]).toMatchObject({ token: 'color-brand-primary', value: '#4f46e5', name: 'Brand/Primary', source: 'style' })
    const ink = summary.colors.find((color) => color.value === '#111827')!
    expect(ink).toMatchObject({ token: 'color-111827', source: 'usage' })
    expect(ink.roles.text).toBeGreaterThan(0)
  })

  it('collects font families with every weight in use, instances included', () => {
    expect(summary.typography.families).toEqual([{ family: 'Inter', weights: [400, 500, 700], italic: false, usage: 11 }])
    expect(summary.typography.styles[0]).toMatchObject({ token: 'text-64-700', fontSize: 64, lineHeight: '76.8px' })
  })

  it('groups responsive frames into screens', () => {
    expect(summary.screens).toHaveLength(1)
    expect(summary.screens[0]).toMatchObject({ name: 'Home', route: '/' })
    expect(summary.screens[0]!.variants.map((variant) => [variant.breakpoint, variant.width])).toEqual([
      ['desktop', 1440],
      ['mobile', 375],
    ])
    expect(summary.breakpoints).toEqual({ desktop: [1440], mobile: [375] })
  })

  it('identifies the icon library from component names', () => {
    expect(summary.iconLibraries).toMatchObject([{ id: 'lucide', prefix: 'lucide', package: '@iconify-json/lucide', confidence: 'name', icons: 1 }])
    expect(summary.icons).toMatchObject([{ name: 'arrow-right', library: 'lucide', iconify: 'lucide:arrow-right', usage: 1 }])
  })

  it('reports components and interactions', () => {
    expect(summary.components.map((component) => [component.name, component.instances])).toEqual([
      ['Card', 3],
      ['lucide/arrow-right', 1],
    ])
    expect(summary.interactions).toMatchObject([{ nodeName: 'Button', trigger: 'ON_CLICK', destinationId: '1:40', duration: 300 }])
  })

  it('turns repeated instances into a data collection', () => {
    expect(collections).toHaveLength(1)
    expect(collections[0]).toMatchObject({ name: 'Cards', slug: 'cards', component: 'Card', fields: ['cover', 'title', 'body'] })
    expect(collections[0]!.items).toEqual([
      { cover: `/media/images/${HASH_A}.png`, title: 'Alpha', body: 'Alpha description' },
      { cover: `/media/images/${HASH_B}.png`, title: 'Beta', body: 'Beta description' },
      { cover: `/media/images/${HASH_A}.png`, title: 'Gamma', body: 'Gamma description' },
    ])
  })

  it('lists media files with a sniffed extension', () => {
    expect(summary.media.map((file) => file.path)).toEqual([`images/${HASH_A}.png`, `images/${HASH_B}.png`])
    expect(files.map((file) => file.path)).toEqual(summary.media.map((file) => file.path))
  })
})

describe('describeMedia', () => {
  const bytes = (text: string) => new TextEncoder().encode(text)

  it('recognises images, video and audio from their content', () => {
    expect(describeMedia({ hash: 'a', bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]) })).toMatchObject({ kind: 'images', path: 'images/a.jpg' })
    expect(describeMedia({ hash: 'b', bytes: bytes('\0\0\0 ftypisom') })).toMatchObject({ kind: 'videos', path: 'videos/b.mp4' })
    expect(describeMedia({ hash: 'c', bytes: bytes('ID3\x03') })).toMatchObject({ kind: 'audio', path: 'audio/c.mp3' })
    expect(describeMedia({ hash: 'd', bytes: bytes('<svg xmlns="x"/>') })).toMatchObject({ mime: 'image/svg+xml' })
  })
})
