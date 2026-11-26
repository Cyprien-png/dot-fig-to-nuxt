import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface DesignVersion {
  version: number
  /** SHA-256 of the decoded design, stable across re-exports of an unchanged file. */
  contentHash: string
  fileName: string
  importedAt: string
}

/** `fig2nuxt.json`, the file that makes a folder a dot-fig-to-nuxt project. */
export interface ProjectManifest {
  schema: 1
  name: string
  slug: string
  createdAt: string
  versions: DesignVersion[]
  /** Design version the Nuxt code currently reproduces; `0` until the first implementation. */
  implementedVersion: number
}

export const MANIFEST_FILE = 'fig2nuxt.json'

/** Paths, relative to the project root, of everything the tool owns. */
export const PROJECT_PATHS = {
  sourceFig: 'design/source.fig',
  document: 'design/document.json',
  summary: 'design/summary.json',
  theme: 'design/theme.json',
  thumbnail: 'design/thumbnail.png',
  generated: 'design/generated.json',
  media: 'media',
  data: 'data',
  tokensCss: 'app/assets/css/tokens.css',
  output: '.output/public',
} as const

export const designTag = (version: number) => `design-v${version}`
export const implementedTag = (version: number) => `implemented-v${version}`

export const latestVersion = (manifest: ProjectManifest) => manifest.versions.at(-1)?.version ?? 0

export async function readManifest(directory: string): Promise<ProjectManifest> {
  return JSON.parse(await readFile(join(directory, MANIFEST_FILE), 'utf8'))
}

export async function writeManifest(directory: string, manifest: ProjectManifest): Promise<void> {
  await writeFile(join(directory, MANIFEST_FILE), JSON.stringify(manifest, null, 2) + '\n')
}
