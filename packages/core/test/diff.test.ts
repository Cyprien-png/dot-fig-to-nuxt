import { describe, expect, it } from 'vitest'
import { diffDesign } from '../src/diff/diffDesign.ts'
import { analyzeDesign } from '../src/extract/analyze.ts'
import { parseFig } from '../src/index.ts'
import { sampleFig } from './fixtures/sampleDesign.ts'

describe('diffDesign', () => {
  const before = parseFig(sampleFig())
  const after = parseFig(sampleFig({ revised: true }))
  const diff = diffDesign(before.document, after.document, {
    before: analyzeDesign(before).summary,
    after: analyzeDesign(after).summary,
  })
  const desktop = diff.frames.find((frame) => frame.frame === 'Home / Desktop')!
  const layer = (name: string) => desktop.layers.find((change) => change.name === name)!

  it('reports nothing for identical designs', () => {
    expect(diffDesign(before.document, parseFig(sampleFig()).document)).toMatchObject({ identical: true, frames: [] })
  })

  it('only lists the frames that changed', () => {
    expect(diff.identical).toBe(false)
    expect(diff.frames.map((frame) => [frame.frame, frame.status])).toEqual([['Home / Desktop', 'changed']])
    expect(diff.stats).toEqual({ added: 1, removed: 1, changed: 2, moved: 0, frames: 1 })
  })

  it('pinpoints the changed property of a layer', () => {
    expect(layer('Headline')).toMatchObject({
      kind: 'changed',
      path: 'Home / Desktop / Headline',
      changes: [{ property: 'text.characters', before: 'Build faster', after: 'Build much faster' }],
    })
    expect(layer('Button').changes).toEqual([
      { property: 'fills', before: [{ type: 'SOLID', color: '#4f46e5', opacity: 1 }], after: [{ type: 'SOLID', color: '#e11d48', opacity: 1 }] },
    ])
  })

  it('reports added and removed layers once', () => {
    expect(layer('Tagline')).toMatchObject({ kind: 'added', id: '1:37', type: 'TEXT' })
    expect(layer('Card')).toMatchObject({ kind: 'removed', id: '1:35', path: 'Home / Desktop / Cards / Card' })
  })

  it('diffs design tokens', () => {
    expect(diff.tokens.colors).toEqual({ added: ['#e11d48'], removed: ['#4f46e5'] })
    expect(diff.tokens.fonts).toEqual({ added: [], removed: [] })
  })
})
