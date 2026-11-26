import type { BuildJob, DesignSummary, Preview, ProjectManifest, RepositoryStatus } from '@fig2nuxt/core'

/**
 * Shapes of the API responses, shared with the dashboard. This file only
 * holds types so the browser bundle can import it without pulling server code.
 */

/** What the dashboard needs to draw a project card without loading the full summary. */
export interface ProjectCard {
  manifest: ProjectManifest
  latestVersion: number
  /** A design version is imported but the code does not implement it yet. */
  pending: boolean
  hasThumbnail: boolean
  colors: string[]
  fonts: string[]
  stats: DesignSummary['stats'] | undefined
}

export interface ProjectDetail extends ProjectCard {
  directory: string
  summary: DesignSummary
  git: RepositoryStatus
  build?: BuildJob
  preview?: Preview
}

export type CollectionWithItems = DesignSummary['collections'][number] & { items: Record<string, string>[] }
