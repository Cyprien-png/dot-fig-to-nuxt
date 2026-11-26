import { stat } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import sirv from 'sirv'

export class NotBuiltError extends Error {}

export interface Preview {
  project: string
  url: string
}

/**
 * Serves the generated static site of a project on a local port, exactly as a
 * static host would: no Nuxt process involved.
 */
export class PreviewManager {
  private readonly servers = new Map<string, { server: Server; url: string }>()

  constructor(private readonly outputOf: (project: string) => string) {}

  get(project: string): Preview | undefined {
    const running = this.servers.get(project)
    return running && { project, url: running.url }
  }

  async start(project: string): Promise<Preview> {
    const existing = this.get(project)
    if (existing) return existing

    const directory = this.outputOf(project)
    if (!(await stat(directory).catch(() => undefined))) throw new NotBuiltError(`Project ${project} has not been built yet`)

    // `dev` disables caching so a rebuild shows up on reload; 200.html is Nuxt's SPA fallback.
    const server = createServer(sirv(directory, { dev: true, single: '200.html' }))
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    this.servers.set(project, { server, url })
    return { project, url }
  }

  async stop(project: string): Promise<void> {
    const running = this.servers.get(project)
    if (!running) return
    this.servers.delete(project)
    running.server.closeAllConnections()
    await new Promise<void>((resolve) => running.server.close(() => resolve()))
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.servers.keys()].map((project) => this.stop(project)))
  }
}
