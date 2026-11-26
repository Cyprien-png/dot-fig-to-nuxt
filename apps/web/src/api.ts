import type { BuildJob, CommitInfo, Preview, VersionDiff } from '@fig2nuxt/core'
import type { CollectionWithItems, ProjectCard, ProjectDetail } from '@fig2nuxt/server/api'

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init)
  if (response.status === 204) return undefined as T
  const body = await response.json().catch(() => ({ error: response.statusText }))
  if (!response.ok) throw new ApiError(body?.error ?? `Request failed (${response.status})`)
  return body as T
}

function upload(fields: Record<string, string>, fig: File): RequestInit {
  const body = new FormData()
  for (const [key, value] of Object.entries(fields)) body.set(key, value)
  body.set('fig', fig)
  return { method: 'POST', body }
}

const project = (slug: string) => `/projects/${encodeURIComponent(slug)}`

export const api = {
  listProjects: () => request<ProjectCard[]>('/projects'),
  createProject: (name: string, fig: File) => request<ProjectCard>('/projects', upload({ name }, fig)),
  getProject: (slug: string) => request<ProjectDetail>(project(slug)),
  deleteProject: (slug: string) => request<void>(project(slug), { method: 'DELETE' }),
  importDesign: (slug: string, fig: File) => request<ProjectCard>(`${project(slug)}/designs`, upload({}, fig)),
  getDiff: (slug: string, from?: number, to?: number) => {
    const query = new URLSearchParams()
    if (from !== undefined) query.set('from', String(from))
    if (to !== undefined) query.set('to', String(to))
    return request<VersionDiff>(`${project(slug)}/diff?${query}`)
  },
  markImplemented: (slug: string, version?: number) =>
    request<ProjectCard>(`${project(slug)}/implemented`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version }) }),
  getCommits: (slug: string) => request<CommitInfo[]>(`${project(slug)}/commits`),
  getCollections: (slug: string) => request<CollectionWithItems[]>(`${project(slug)}/collections`),
  startBuild: (slug: string) => request<BuildJob>(`${project(slug)}/build`, { method: 'POST' }),
  getBuild: (slug: string) => request<BuildJob | null>(`${project(slug)}/build`),
  startPreview: (slug: string) => request<Preview>(`${project(slug)}/preview`, { method: 'POST' }),
  stopPreview: (slug: string) => request<void>(`${project(slug)}/preview`, { method: 'DELETE' }),
}

/** URLs of binary and HTML resources, used directly as `src`. */
export const urls = {
  thumbnail: (slug: string, version: number) => `/api${project(slug)}/thumbnail?v=${version}`,
  media: (slug: string, path: string) => `/api${project(slug)}/media/${path}`,
  render: (slug: string, nodeId: string, version?: number) =>
    `/api${project(slug)}/render/${encodeURIComponent(nodeId)}${version ? `?version=${version}` : ''}`,
}
