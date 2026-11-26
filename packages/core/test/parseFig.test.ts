import { describe, expect, it } from 'vitest'
import { FigFormatError, parseFig } from '../src/index.ts'
import { HASH_A, HASH_B, sampleFig } from './fixtures/sampleDesign.ts'

describe('parseFig', () => {
  const { document, media } = parseFig(sampleFig())
  const design = document.pages.find((page) => page.name === 'Design')!
  const desktop = design.children.find((node) => node.name === 'Home / Desktop')!

  it('reads the document name and its pages', () => {
    expect(document.name).toBe('Sample landing')
    expect(document.pages.map((page) => [page.name, page.internal])).toEqual([
      ['Internal Only Canvas', true],
      ['Design', false],
    ])
  })

  it('keeps sibling order and geometry', () => {
    expect(desktop.children!.map((node) => node.name)).toEqual(['Headline', 'Cards', 'Button'])
    expect(desktop.box).toEqual({ x: 0, y: 0, width: 1440, height: 900 })
  })

  it('normalises auto layout, paints and text', () => {
    expect(desktop.layout).toMatchObject({ mode: 'VERTICAL', gap: 32, padding: [64, 64, 64, 64] })
    expect(desktop.fills).toEqual([{ type: 'SOLID', color: '#ffffff', opacity: 1 }])
    const headline = desktop.children![0]!
    expect(headline.text).toMatchObject({
      characters: 'Build faster',
      style: { fontFamily: 'Inter', fontWeight: 700, fontSize: 64, lineHeight: '76.8px' },
    })
  })

  it('renames Figma internals to their public names', () => {
    expect(design.children.find((node) => node.name === 'Card')!.type).toBe('COMPONENT')
    expect(design.children.find((node) => node.name === 'Card')!.children![0]!.type).toBe('RECTANGLE')
  })

  it('captures instance overrides and prototype interactions', () => {
    const [alpha, beta] = desktop.children![1]!.children!
    expect(alpha!.instance).toMatchObject({ componentId: '1:10', overrides: { '1:12': { text: { characters: 'Alpha' } } } })
    expect(beta!.instance!.overrides!['1:11']!.fills).toMatchObject([{ type: 'IMAGE', hash: HASH_B }])
    expect(desktop.children![2]!.interactions).toEqual([
      { trigger: 'ON_CLICK', action: 'NAVIGATE', destinationId: '1:40', transition: 'DISSOLVE', duration: 300, easing: 'EASE_OUT' },
    ])
  })

  it('converts vector geometry to svg paths', () => {
    const icon = design.children.find((node) => node.name === 'lucide/arrow-right')!
    expect(icon.children![0]!.fillPaths).toEqual([{ d: 'M0 8L16 8L8 0Z', rule: 'nonzero' }])
  })

  it('lifts shared styles out of the layer tree', () => {
    expect(document.styles).toEqual([
      { id: '1:50', name: 'Brand/Primary', type: 'FILL', fills: [{ type: 'SOLID', color: '#4f46e5', opacity: 1 }] },
    ])
    expect(document.pages[0]!.children).toEqual([])
  })

  it('collects referenced media', () => {
    expect(media.map((asset) => asset.hash)).toEqual([HASH_A, HASH_B])
  })

  it('reads the legacy unzipped container too', () => {
    expect(parseFig(sampleFig({ zip: false })).document.pages).toHaveLength(2)
  })

  it('is deterministic', () => {
    expect(JSON.stringify(parseFig(sampleFig()).document)).toBe(JSON.stringify(document))
  })

  it('rejects files that are not Figma documents', () => {
    expect(() => parseFig(new TextEncoder().encode('definitely not a fig file'))).toThrow(FigFormatError)
  })
})
