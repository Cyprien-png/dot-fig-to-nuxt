import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorkspace } from '@fig2nuxt/core'
import type { Hono } from 'hono'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { HASH_A, sampleFig } from '../../core/test/fixtures/sampleDesign.ts'
import { createApp } from '../src/app.ts'

Object.assign(process.env, {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
})

const upload = (fields: Record<string, string>, fig?: Uint8Array) => {
  const body = new FormData()
  for (const [key, value] of Object.entries(fields)) body.set(key, value)
  if (fig) body.set('fig', new File([Buffer.from(fig)], 'design.fig'))
  return { method: 'POST', body }
}

describe('dashboard API', () => {
  let root: string
  let app: Hono
  // Responses are asserted field by field: a loose type keeps the tests readable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getJson = async (path: string): Promise<any> => (await app.request(path)).json()

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'fig2nuxt-api-'))
    app = createApp(createWorkspace(root))
  })
  afterAll(() => rm(root, { recursive: true, force: true }))

  it('creates a project from an uploaded .fig file', async () => {
    const response = await app.request('/api/projects', upload({ name: 'Demo Site' }, sampleFig()))
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      manifest: { slug: 'demo-site' },
      latestVersion: 1,
      pending: true,
      cover: { nodeId: '1:30', width: 1440 },
      colors: expect.arrayContaining(['#4f46e5']),
      fonts: ['Inter'],
    })
    expect(await (await app.request('/api/projects')).json()).toHaveLength(1)
  })

  it('validates uploads', async () => {
    expect((await app.request('/api/projects', upload({ name: 'No file' }))).status).toBe(400)
    expect((await app.request('/api/projects', upload({ name: '' }, sampleFig()))).status).toBe(400)
    const invalid = await app.request('/api/projects', upload({ name: 'Broken' }, new TextEncoder().encode('nope')))
    expect(invalid.status).toBe(400)
    expect((await app.request('/api/projects', upload({ name: 'Demo Site' }, sampleFig()))).status).toBe(409)
  })

  it('serves the project presentation data', async () => {
    const project = await getJson('/api/projects/demo-site')
    expect(project.summary.screens[0].name).toBe('Home')
    expect(project.git.clean).toBe(true)

    const collections = await getJson('/api/projects/demo-site/collections')
    expect(collections[0]).toMatchObject({ slug: 'cards', count: 3 })
    expect(collections[0].items).toHaveLength(3)

    const media = await app.request(`/api/projects/demo-site/media/images/${HASH_A}.png`)
    expect(media.headers.get('content-type')).toBe('image/png')
    expect((await app.request('/api/projects/demo-site/media/..%2F..%2Ffig2nuxt.json')).status).toBe(404)
  })

  it('renders a sandboxed reference of a frame', async () => {
    const response = await app.request('/api/projects/demo-site/render/1:30')
    expect(response.headers.get('content-security-policy')).toContain('sandbox')
    expect(await response.text()).toContain('/api/projects/demo-site/media/images/')
    expect((await app.request('/api/projects/demo-site/render/9:99')).status).toBe(404)
  })

  it('imports a new version and exposes the diff', async () => {
    await app.request('/api/projects/demo-site/implemented', { method: 'POST' })
    const imported = await app.request('/api/projects/demo-site/designs', upload({}, sampleFig({ revised: true })))
    expect(await imported.json()).toMatchObject({ latestVersion: 2, pending: true })

    const { from, to, diff } = await getJson('/api/projects/demo-site/diff')
    expect([from, to]).toEqual([1, 2])
    expect(diff.stats).toMatchObject({ added: 1, removed: 1, changed: 2 })

    const commits = await getJson('/api/projects/demo-site/commits')
    expect(commits[0]).toMatchObject({ message: 'feat(design): import design v2', tags: ['design-v2'] })
  })

  it('reports build and preview state', async () => {
    expect(await (await app.request('/api/projects/demo-site/build')).json()).toBeNull()
    expect((await app.request('/api/projects/demo-site/preview', { method: 'POST' })).status).toBe(409)
  })

  it('returns json errors for unknown resources', async () => {
    const response = await app.request('/api/projects/unknown')
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'Unknown project: unknown' })
    expect((await app.request('/api/nope')).status).toBe(404)
  })

  it('deletes a project', async () => {
    expect((await app.request('/api/projects/demo-site', { method: 'DELETE' })).status).toBe(204)
    expect(await (await app.request('/api/projects')).json()).toEqual([])
  })
})
