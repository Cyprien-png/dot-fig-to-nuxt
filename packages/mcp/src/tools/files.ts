import { z } from 'zod'
import { defineTool, project, type ToolContext } from '../toolkit.ts'

const path = z.string().describe('Path relative to the project root, e.g. "app/components/AppHeader.vue"')
const MAX_READ_BYTES = 400_000

export function registerFileTools(context: ToolContext): void {
  const { workspace } = context

  defineTool(context, 'list_files', {
    title: 'List files',
    description: 'Lists the files of a project folder (dependencies and build output excluded).',
    input: { project, path: path.default('.'), recursive: z.boolean().default(false) },
    readOnly: true,
  }, async ({ project, path, recursive }) => workspace.projects.files(project).list(path, recursive))

  defineTool(context, 'read_file', {
    title: 'Read file',
    description: 'Reads a text file of the project.',
    input: { project, path },
    readOnly: true,
  }, async ({ project, path }) => {
    const content = await workspace.projects.files(project).readText(path)
    if (content.length > MAX_READ_BYTES) throw new Error(`${path} is too large to read whole (${content.length} characters). Use the design tools for design/document.json.`)
    return content
  })

  defineTool(context, 'write_file', {
    title: 'Write file',
    description:
      'Creates or replaces a file of the project (Vue components, pages, composables, styles, config). Parent folders are created. Generated files (app/assets/css/tokens.css, design/*, data/*) are overwritten on the next design import: do not edit them.',
    input: { project, path, content: z.string() },
  }, async ({ project, path, content }) => {
    await workspace.projects.files(project).write(path, content)
    return { written: path, bytes: Buffer.byteLength(content) }
  })

  defineTool(context, 'delete_file', {
    title: 'Delete file',
    description: 'Deletes a file or folder of the project.',
    input: { project, path },
  }, async ({ project, path }) => {
    await workspace.projects.files(project).remove(path)
    return { deleted: path }
  })
}
