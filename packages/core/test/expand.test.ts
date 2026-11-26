import { describe, expect, it } from 'vitest'
import { expandInstances, sourceIdOf } from '../src/design/expand.ts'
import { indexDocument } from '../src/design/traverse.ts'
import { parseFig } from '../src/index.ts'
import { HASH_B, sampleFig } from './fixtures/sampleDesign.ts'

describe('expandInstances', () => {
  const { document } = parseFig(sampleFig())
  const index = indexDocument(document)
  const cards = expandInstances(index.get('1:32')!, index).children!

  it('materialises the layers of an instance with Figma-style ids', () => {
    expect(cards[0]!.children!.map((layer) => layer.id)).toEqual(['I1:33;1:11', 'I1:33;1:12', 'I1:33;1:13'])
    expect(cards[0]!.children!.every((layer) => layer.derived)).toBe(true)
    expect(sourceIdOf('I1:33;1:12')).toBe('1:12')
  })

  it('applies text and fill overrides', () => {
    expect(cards.map((card) => card.children![1]!.text!.characters)).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(cards[1]!.children![0]!.fills).toMatchObject([{ type: 'IMAGE', hash: HASH_B }])
    expect(cards[0]!.children![1]!.text!.style.fontWeight).toBe(700)
  })

  it('inherits the component appearance and layout', () => {
    expect(cards[0]).toMatchObject({ radius: 16, layout: { mode: 'VERTICAL', gap: 12 }, fills: [{ color: '#ffffff' }] })
  })

  it('leaves the stored document untouched', () => {
    expect(index.get('1:33')!.children).toBeUndefined()
  })
})
