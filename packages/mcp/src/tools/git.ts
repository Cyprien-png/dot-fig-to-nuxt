import { COMMIT_TYPES } from '@fig2nuxt/core'
import { z } from 'zod'
import { defineTool, project, type ToolContext } from '../toolkit.ts'

const paths = z.array(z.string()).optional().describe('Paths relative to the project root; everything when omitted')

export function registerGitTools(context: ToolContext): void {
  const { workspace } = context

  defineTool(context, 'git_status', {
    title: 'Git status',
    description: 'Returns the branch, uncommitted changes and remote of the project repository.',
    input: { project },
    readOnly: true,
  }, async ({ project }) => workspace.projects.git(project).status())

  defineTool(context, 'git_diff', {
    title: 'Git diff',
    description: 'Returns the unified diff of uncommitted changes, optionally limited to some paths.',
    input: { project, paths },
    readOnly: true,
  }, async ({ project, paths }) => (await workspace.projects.git(project).workingDiff(paths)) || 'No uncommitted changes.')

  defineTool(context, 'git_commit', {
    title: 'Git commit',
    description: `Commits changes of the project repository. Make atomic commits: one logical change each, staged through "paths". The message must be a single-line Conventional Commit: "<type>(<scope>): <description>" with a type among ${COMMIT_TYPES.join(', ')}.`,
    input: { project, message: z.string().describe('e.g. "feat(home): add hero section"'), paths },
  }, async ({ project, message, paths }) => {
    const hash = await workspace.projects.git(project).commit(message, paths)
    return hash ? { committed: hash, message } : 'Nothing to commit.'
  })

  defineTool(context, 'git_log', {
    title: 'Git log',
    description: 'Returns the latest commits of the project with their tags (design-vN marks a design import, implemented-vN an implemented version).',
    input: { project, limit: z.number().int().min(1).max(200).default(30) },
    readOnly: true,
  }, async ({ project, limit }) => workspace.projects.git(project).log(limit))

  defineTool(context, 'git_set_remote', {
    title: 'Set git remote',
    description: 'Sets the "origin" remote of the project repository, i.e. the separate repository the generated site is published to.',
    input: { project, url: z.string().describe('Remote URL, e.g. https://github.com/owner/site.git') },
  }, async ({ project, url }) => {
    await workspace.projects.git(project).setRemote(url)
    return { remote: url }
  })

  defineTool(context, 'git_push', {
    title: 'Git push',
    description: 'Pushes the current branch and the design tags to "origin". The scaffolded CI then builds the site.',
    input: { project },
  }, async ({ project }) => {
    await workspace.projects.git(project).push()
    return 'Pushed.'
  })
}
