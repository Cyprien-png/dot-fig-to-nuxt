import type { Workspace } from '@fig2nuxt/core'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerBuildTools } from './tools/build.ts'
import { registerDesignTools } from './tools/design.ts'
import { registerFileTools } from './tools/files.ts'
import { registerGitTools } from './tools/git.ts'
import { registerProjectTools } from './tools/projects.ts'

const INSTRUCTIONS = `dot-fig-to-nuxt turns Figma .fig files into statically generated Nuxt 4 + TypeScript sites that reproduce the design one-to-one. Each project is its own git repository.

New project:
1. create_project with the .fig path.
2. get_design_summary, then get_frame_outline for each screen (one frame per breakpoint).
3. Read AGENTS.md in the project (read_file): it holds the implementation rules.
4. Implement with inspect_node as the reference for every measure, colour and font. Create a Vue component for each Figma component in use and for any repeated or self-contained structure. Use the generated tokens (app/assets/css/tokens.css), the media under /media, the collections under data/ and the detected icon libraries.
5. build_project after each screen and fix every error; start_preview and compare with render_frame.
6. git_commit atomically with Conventional Commits, then mark_implemented.

Updated design:
1. import_design with the new .fig path.
2. get_design_diff: it lists exactly which layers and properties changed since the implemented version. Implement that delta only.
3. build_project, git_commit, mark_implemented.`

/** Builds the MCP server exposing the whole workflow to an agent. */
export function createServer(workspace: Workspace): McpServer {
  const server = new McpServer({ name: 'dot-fig-to-nuxt', version: '0.1.0' }, { instructions: INSTRUCTIONS })
  const context = { server, workspace }
  registerProjectTools(context)
  registerDesignTools(context)
  registerFileTools(context)
  registerGitTools(context)
  registerBuildTools(context)
  return server
}
