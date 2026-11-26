import type { Workspace } from '@fig2nuxt/core'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z, type ZodRawShape } from 'zod'

export interface ToolContext {
  server: McpServer
  workspace: Workspace
}

interface ToolConfig<Shape extends ZodRawShape> {
  title: string
  description: string
  input: Shape
  /** `true` when the tool changes nothing on disk or in git. */
  readOnly?: boolean
}

/** Field shared by every project-scoped tool. */
export const project = z.string().describe('Project id (slug), as returned by list_projects')

/**
 * Registers a tool whose handler returns plain data. Results are serialised
 * as JSON and failures are reported as tool errors the agent can act on,
 * instead of protocol errors.
 */
export function defineTool<Shape extends ZodRawShape>(
  { server }: ToolContext,
  name: string,
  config: ToolConfig<Shape>,
  handler: (input: z.infer<z.ZodObject<Shape>>) => Promise<unknown>,
): void {
  server.registerTool(
    name,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.input,
      annotations: { readOnlyHint: config.readOnly ?? false },
    },
    // The SDK infers the argument type from the schema; the cast keeps this helper generic.
    (async (input: z.infer<z.ZodObject<Shape>>) => {
      try {
        const result = await handler(input)
        const text = typeof result === 'string' ? result : JSON.stringify(result, null, 1)
        return { content: [{ type: 'text' as const, text }] }
      } catch (error) {
        return { content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }], isError: true }
      }
    }) as never,
  )
}
