import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { latestVersion, type FigUpload, type ProjectManifest, type Workspace } from '@fig2nuxt/core'
import { z } from 'zod'
import { defineTool, project, type ToolContext } from '../toolkit.ts'

const figPath = z.string().describe('Absolute path of the .fig file on this machine')

async function readFig(path: string): Promise<FigUpload> {
  return { bytes: await readFile(path), fileName: basename(path) }
}

async function overview(workspace: Workspace, manifest: ProjectManifest) {
  const latest = latestVersion(manifest)
  return {
    project: manifest.slug,
    name: manifest.name,
    directory: workspace.projects.directory(manifest.slug),
    latestDesignVersion: latest,
    implementedVersion: manifest.implementedVersion,
    // The work left: design versions imported but not yet reflected in the code.
    pendingImplementation: latest > manifest.implementedVersion,
    versions: manifest.versions,
  }
}

export function registerProjectTools(context: ToolContext): void {
  const { workspace } = context

  defineTool(context, 'list_projects', {
    title: 'List projects',
    description: 'Lists every project with its design versions and whether a design version is waiting to be implemented.',
    input: {},
    readOnly: true,
  }, async () => Promise.all((await workspace.projects.list()).map((manifest) => overview(workspace, manifest))))

  defineTool(context, 'create_project', {
    title: 'Create project',
    description:
      'Creates a project from a .fig file: a new git repository with a Nuxt 4 + TypeScript scaffold, CI, the design imported as version 1, its media, data collections and design tokens. Follow with get_design_summary.',
    input: { name: z.string().min(1).describe('Human readable project name; the id (slug) is derived from it'), figPath },
  }, async ({ name, figPath }) => overview(workspace, await workspace.projects.create(name, await readFig(figPath))))

  defineTool(context, 'get_project', {
    title: 'Get project',
    description: 'Returns the state of a project: directory, design versions, implemented version, git status and last build.',
    input: { project },
    readOnly: true,
  }, async ({ project }) => ({
    ...(await overview(workspace, await workspace.projects.get(project))),
    git: await workspace.projects.git(project).status(),
    lastBuild: summarizeBuild(workspace, project),
    preview: workspace.previews.get(project)?.url,
  }))

  defineTool(context, 'import_design', {
    title: 'Import a new design version',
    description:
      'Imports an updated .fig file as the next design version of an existing project (committed and tagged design-vN). Media, collections and tokens are regenerated. Follow with get_design_diff to see exactly what to change in the code.',
    input: { project, figPath },
  }, async ({ project, figPath }) => {
    const manifest = await workspace.projects.importDesign(project, await readFig(figPath))
    const { from, to, diff } = await workspace.projects.diff(project)
    return { ...(await overview(workspace, manifest)), delta: { from, to, stats: diff.stats, tokens: diff.tokens } }
  })

  defineTool(context, 'mark_implemented', {
    title: 'Mark a design version as implemented',
    description:
      'Records that the Nuxt code now reproduces a design version (the latest by default). Commit your work first: this becomes the baseline of the next get_design_diff.',
    input: { project, version: z.number().int().positive().optional().describe('Design version; defaults to the latest') },
  }, async ({ project, version }) => overview(workspace, await workspace.projects.markImplemented(project, version)))
}

export function summarizeBuild(workspace: Workspace, project: string, tail = 0) {
  const job = workspace.builds.latest(project)
  if (!job) return undefined
  const { log, ...rest } = job
  return tail ? { ...rest, log: log.slice(-tail) } : rest
}
