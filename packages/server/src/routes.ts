import { latestVersion, PROJECT_PATHS, type FigUpload, type ProjectManifest, type Workspace } from '@fig2nuxt/core'
import { Hono, type Context } from 'hono'
import { getMimeType } from 'hono/utils/mime'
import type { CollectionWithItems, ProjectCard, ProjectDetail } from './apiTypes.ts'
import { BadRequestError } from './errors.ts'

const CARD_COLORS = 8

async function readUpload(context: Context): Promise<{ name: string; fig: FigUpload }> {
  const body = await context.req.parseBody()
  const file = body.fig
  if (!(file instanceof File) || file.size === 0) throw new BadRequestError('A .fig file is required')
  return {
    name: typeof body.name === 'string' ? body.name.trim() : '',
    fig: { bytes: new Uint8Array(await file.arrayBuffer()), fileName: file.name },
  }
}

const optionalVersion = (value: string | undefined) => (value === undefined || value === '' ? undefined : Number(value))

/** The JSON API consumed by the dashboard. */
export function createApi(workspace: Workspace): Hono {
  const { projects, builds, previews } = workspace
  const api = new Hono()

  const card = async (manifest: ProjectManifest): Promise<ProjectCard> => {
    const summary = await projects.summary(manifest.slug).catch(() => undefined)
    return {
      manifest,
      latestVersion: latestVersion(manifest),
      pending: latestVersion(manifest) > manifest.implementedVersion,
      hasThumbnail: await projects.files(manifest.slug).exists(PROJECT_PATHS.thumbnail),
      colors: (summary?.colors ?? []).slice(0, CARD_COLORS).map((color) => color.value),
      fonts: (summary?.typography.families ?? []).map((family) => family.family),
      stats: summary?.stats,
    }
  }

  api.get('/projects', async (c) => c.json(await Promise.all((await projects.list()).map(card))))

  api.post('/projects', async (c) => {
    const { name, fig } = await readUpload(c)
    if (!name) throw new BadRequestError('A project name is required')
    return c.json(await card(await projects.create(name, fig)), 201)
  })

  api.get('/projects/:slug', async (c) => {
    const slug = c.req.param('slug')
    const manifest = await projects.get(slug)
    return c.json<ProjectDetail>({
      ...(await card(manifest)),
      directory: projects.directory(slug),
      summary: await projects.summary(slug),
      git: await projects.git(slug).status(),
      build: builds.latest(slug),
      preview: previews.get(slug),
    })
  })

  api.delete('/projects/:slug', async (c) => {
    const slug = c.req.param('slug')
    await previews.stop(slug)
    await projects.remove(slug)
    return c.body(null, 204)
  })

  api.post('/projects/:slug/designs', async (c) => {
    const { fig } = await readUpload(c)
    return c.json(await card(await projects.importDesign(c.req.param('slug'), fig)), 201)
  })

  api.get('/projects/:slug/diff', async (c) =>
    c.json(await projects.diff(c.req.param('slug'), optionalVersion(c.req.query('from')), optionalVersion(c.req.query('to')))),
  )

  api.post('/projects/:slug/implemented', async (c) => {
    const body = await c.req.json<{ version?: number }>().catch(() => ({ version: undefined }))
    return c.json(await card(await projects.markImplemented(c.req.param('slug'), body.version)))
  })

  api.get('/projects/:slug/commits', async (c) => c.json(await projects.git(c.req.param('slug')).log(100)))

  api.get('/projects/:slug/collections', async (c) => {
    const slug = c.req.param('slug')
    const files = projects.files(slug)
    const { collections } = await projects.summary(slug)
    return c.json<CollectionWithItems[]>(
      await Promise.all(
        collections.map(async (collection) => ({
          ...collection,
          items: await files.readJson<Record<string, string>[]>(`${PROJECT_PATHS.data}/${collection.slug}.json`).catch(() => []),
        })),
      ),
    )
  })

  api.get('/projects/:slug/thumbnail', async (c) => {
    const bytes = await projects.files(c.req.param('slug')).read(PROJECT_PATHS.thumbnail).catch(() => undefined)
    if (!bytes) return c.notFound()
    return c.body(Buffer.from(bytes), 200, { 'content-type': 'image/png', 'cache-control': 'no-cache' })
  })

  api.get('/projects/:slug/media/*', async (c) => {
    const slug = c.req.param('slug')
    const path = decodeURIComponent(c.req.path.slice(c.req.path.indexOf('/media/') + '/media/'.length))
    const bytes = await projects.files(slug).read(`${PROJECT_PATHS.media}/${path}`).catch(() => undefined)
    if (!bytes) return c.notFound()
    // Media files are named after their content hash, so they can be cached forever.
    return c.body(Buffer.from(bytes), 200, { 'content-type': getMimeType(path) ?? 'application/octet-stream', 'cache-control': 'public, max-age=31536000, immutable' })
  })

  api.get('/projects/:slug/render/:nodeId', async (c) => {
    const slug = c.req.param('slug')
    const inspector = await workspace.inspector(slug, optionalVersion(c.req.query('version')))
    // The render is design content: let it draw, never run scripts or reach the API.
    c.header('content-security-policy', "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com")
    return c.html(inspector.render(c.req.param('nodeId'), `/api/projects/${slug}/media/`))
  })

  api.post('/projects/:slug/build', async (c) => {
    const slug = c.req.param('slug')
    await projects.get(slug)
    return c.json(builds.start(slug), 202)
  })

  api.get('/projects/:slug/build', (c) => c.json(builds.latest(c.req.param('slug')) ?? null))

  api.post('/projects/:slug/preview', async (c) => c.json(await previews.start(c.req.param('slug'))))

  api.delete('/projects/:slug/preview', async (c) => {
    await previews.stop(c.req.param('slug'))
    return c.body(null, 204)
  })

  return api
}
