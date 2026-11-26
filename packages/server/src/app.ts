import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { Workspace } from '@fig2nuxt/core'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { statusOf } from './errors.ts'
import { createApi } from './routes.ts'

export interface AppOptions {
  /** Folder of the built dashboard; the API runs alone when it does not exist. */
  webRoot?: string
}

/** The local web application: JSON API under /api, dashboard everywhere else. */
export function createApp(workspace: Workspace, { webRoot }: AppOptions = {}): Hono {
  const app = new Hono()

  app.onError((error, c) => {
    const status = statusOf(error)
    if (status === 500) console.error(error)
    return c.json({ error: error.message }, status)
  })
  app.route('/api', createApi(workspace))
  app.all('/api/*', (c) => c.json({ error: 'Not found' }, 404))

  if (webRoot && existsSync(webRoot)) {
    // serveStatic resolves against the working directory.
    app.use('*', serveStatic({ root: relative(process.cwd(), webRoot) || '.' }))
    // Client-side routes all resolve to the single-page app.
    app.get('*', async (c) => c.html(await readFile(join(webRoot, 'index.html'), 'utf8')))
  } else {
    app.get('*', (c) => c.text('The dashboard is not built. Run "npm run build", or "npm run dev" for the dev server.', 503))
  }
  return app
}
