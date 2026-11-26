import { fileURLToPath } from 'node:url'
import { createWorkspace } from '@fig2nuxt/core'
import { serve } from '@hono/node-server'
import { createApp } from './app.ts'

const port = Number(process.env.FIG2NUXT_PORT ?? 4310)
// Local tool with access to the file system: never listen beyond this machine.
const hostname = '127.0.0.1'

const workspace = createWorkspace()
const webRoot = fileURLToPath(new URL('../../../apps/web/dist', import.meta.url))
const server = serve({ fetch: createApp(workspace, { webRoot }).fetch, port, hostname }, () => {
  console.log(`dot-fig-to-nuxt dashboard: http://${hostname}:${port}`)
  console.log(`projects folder: ${workspace.projects.root}`)
})

const shutdown = async () => {
  await workspace.previews.stopAll()
  server.close(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
