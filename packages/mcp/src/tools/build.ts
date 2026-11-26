import { z } from 'zod'
import { defineTool, project, type ToolContext } from '../toolkit.ts'
import { summarizeBuild } from './projects.ts'

const LOG_TAIL = 80

export function registerBuildTools(context: ToolContext): void {
  const { workspace } = context

  defineTool(context, 'build_project', {
    title: 'Build project',
    description:
      'Installs dependencies and statically generates the site (nuxt generate) into .output/public. Waits for the result by default and returns the end of the log; on failure, fix the reported errors and build again.',
    input: { project, wait: z.boolean().default(true).describe('Set to false to return immediately and poll with get_build') },
  }, async ({ project, wait }) => {
    await workspace.projects.get(project)
    const job = workspace.builds.start(project)
    if (wait) await workspace.builds.wait(job.id)
    return summarizeBuild(workspace, project, LOG_TAIL)
  })

  defineTool(context, 'get_build', {
    title: 'Get build',
    description: 'Returns the status and the end of the log of the latest build of a project.',
    input: { project, lines: z.number().int().min(1).max(2000).default(LOG_TAIL) },
    readOnly: true,
  }, async ({ project, lines }) => summarizeBuild(workspace, project, lines) ?? 'No build has run in this session.')

  defineTool(context, 'start_preview', {
    title: 'Start preview',
    description: 'Serves the generated static site on a local URL, as a static host would. Build the project first.',
    input: { project },
  }, async ({ project }) => workspace.previews.start(project))

  defineTool(context, 'stop_preview', {
    title: 'Stop preview',
    description: 'Stops the local preview server of a project.',
    input: { project },
  }, async ({ project }) => {
    await workspace.previews.stop(project)
    return 'Preview stopped.'
  })
}
