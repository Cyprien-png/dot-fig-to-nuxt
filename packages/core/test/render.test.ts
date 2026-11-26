import { describe, expect, it } from 'vitest'
import { nodeStyle } from '../src/css/nodeStyle.ts'
import { expandInstances } from '../src/design/expand.ts'
import { indexDocument } from '../src/design/traverse.ts'
import { parseFig } from '../src/index.ts'
import { renderFrameHtml } from '../src/render/html.ts'
import { nodeToSvg } from '../src/render/svg.ts'
import { sampleFig } from './fixtures/sampleDesign.ts'

const options = { mediaUrl: (hash: string) => `/media/images/${hash}.png` }

describe('nodeStyle', () => {
  const index = indexDocument(parseFig(sampleFig()).document)
  const desktop = index.get('1:30')!
  const mobile = index.get('1:40')!

  it('turns auto layout into flexbox', () => {
    expect(nodeStyle(desktop, undefined, options)).toMatchObject({
      display: 'flex',
      'flex-direction': 'column',
      gap: '32px',
      padding: '64px 64px 64px 64px',
      'background-color': '#ffffff',
      width: '1440px',
    })
  })

  it('keeps flex children in the flow and lets hugging text size itself', () => {
    const headline = nodeStyle(index.get('1:31')!, desktop, options)
    expect(headline).toMatchObject({ 'font-family': '"Inter", sans-serif', 'font-size': '64px', 'font-weight': '700', color: '#111827' })
    expect(headline).not.toHaveProperty('position')
    expect(headline).not.toHaveProperty('width')
  })

  it('positions children of plain frames absolutely', () => {
    expect(nodeStyle(index.get('1:41')!, mobile, options)).toMatchObject({ position: 'absolute', left: '24px', top: '48px' })
  })

  it('maps corner radius and solid fills', () => {
    expect(nodeStyle(index.get('1:36')!, desktop, options)).toMatchObject({ 'border-radius': '8px', 'background-color': '#4f46e5' })
  })
})

describe('renderers', () => {
  const index = indexDocument(parseFig(sampleFig()).document)

  it('renders a frame as standalone html with resolved instances', () => {
    const html = renderFrameHtml(expandInstances(index.get('1:30')!, index), { ...options, fonts: [{ family: 'Inter', weights: [700, 400] }] })
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('family=Inter:wght@400;700')
    expect(html).toContain('data-node-id="I1:34;1:12"')
    expect(html).toContain('>Beta<')
    expect(html).toContain(`url(&quot;/media/images/${'bb'.repeat(20)}.png&quot;)`)
    expect(html).toContain('<path d="M0 8L16 8L8 0Z"')
  })

  it('escapes text content', () => {
    const frame = { ...index.get('1:41')!, text: { ...index.get('1:41')!.text!, characters: '<b>&' } }
    expect(renderFrameHtml(frame, options)).toContain('&lt;b&gt;&amp;')
  })

  it('exports single-colour vectors as tintable svg', () => {
    const svg = nodeToSvg(index.get('1:20')!)
    expect(svg).toContain('viewBox="0 0 24 24"')
    expect(svg).toContain('<g transform="translate(4 4)"><path d="M0 8L16 8L8 0Z" fill="currentColor"')
  })
})
