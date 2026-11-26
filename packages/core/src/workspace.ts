import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BuildRunner } from './build/BuildRunner.ts'
import { PreviewManager } from './build/PreviewManager.ts'
import { DesignInspector } from './inspect/DesignInspector.ts'
import { PROJECT_PATHS } from './project/manifest.ts'
import { ProjectService } from './project/ProjectService.ts'

/** The services every entry point (MCP server, web API) is built on. */
export interface Workspace {
  projects: ProjectService
  builds: BuildRunner
  previews: PreviewManager
  /** Inspector over a design version of a project (the latest when omitted). */
  inspector: (project: string, version?: number) => Promise<DesignInspector>
}

const REPOSITORY_ROOT = fileURLToPath(new URL('../../..', import.meta.url))

/** Projects live in `<repository>/projects` unless `FIG2NUXT_PROJECTS_DIR` says otherwise. */
export function defaultProjectsRoot(): string {
  return resolve(process.env.FIG2NUXT_PROJECTS_DIR ?? join(REPOSITORY_ROOT, 'projects'))
}

export function createWorkspace(root = defaultProjectsRoot()): Workspace {
  const projects = new ProjectService(root)
  return {
    projects,
    builds: new BuildRunner((project) => projects.directory(project)),
    previews: new PreviewManager((project) => join(projects.directory(project), PROJECT_PATHS.output)),
    inspector: async (project, version) =>
      new DesignInspector(await projects.document(project, version), await projects.summary(project, version)),
  }
}
