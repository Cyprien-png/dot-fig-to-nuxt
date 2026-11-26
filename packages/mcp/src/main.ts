import { createWorkspace } from '@fig2nuxt/core'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './createServer.ts'

// stdout carries the protocol: anything meant for a human goes to stderr.
const workspace = createWorkspace()
const server = createServer(workspace)

const shutdown = async () => {
  await workspace.previews.stopAll()
  await server.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

await server.connect(new StdioServerTransport())
console.error(`dot-fig-to-nuxt MCP server ready (projects: ${workspace.projects.root})`)
