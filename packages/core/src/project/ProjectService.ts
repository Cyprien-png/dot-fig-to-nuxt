import { createHash } from 'node:crypto'
import { mkdir, readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { DesignDocument } from '../design/model.ts'
import { slugify } from '../design/traverse.ts'
import { diffDesign, type DesignDiff } from '../diff/diffDesign.ts'
import { analyzeDesign, type DesignSummary } from '../extract/analyze.ts'
import { parseFig } from '../fig/parseFig.ts'
import { scaffoldProject } from '../nuxt/scaffold.ts'
import { buildTheme, buildTokensCss } from '../nuxt/theme.ts'
import { GitRepository } from './GitRepository.ts'
import { ProjectFiles } from './ProjectFiles.ts'
import {
  designTag,
  implementedTag,
  latestVersion,
  MANIFEST_FILE,
  PROJECT_PATHS,
  readManifest,
  writeManifest,
  type ProjectManifest,
} from './manifest.ts'

export class ProjectNotFoundError extends Error {}
export class ProjectConflictError extends Error {}

export interface FigUpload {
  bytes: Uint8Array
  fileName: string
}

export interface VersionDiff {
  from: number
  to: number
  diff: DesignDiff
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/
const EMPTY_DOCUMENT: DesignDocument = { name: '', figVersion: 0, pages: [], styles: [], variables: [] }

/**
 * Owns the projects folder: one sub-folder per project, each its own git
 * repository holding the Nuxt code next to the design it was generated from.
 */
export class ProjectService {
  readonly root: string
  private readonly documents = new Map<string, { mtime: number; document: DesignDocument }>()

  constructor(root: string) {
    this.root = resolve(root)
  }

  directory(slug: string): string {
    if (!SLUG.test(slug)) throw new ProjectNotFoundError(`Invalid project id: ${slug}`)
    return join(this.root, slug)
  }

  files(slug: string): ProjectFiles {
    return new ProjectFiles(this.directory(slug))
  }

  git(slug: string): GitRepository {
    return new GitRepository(this.directory(slug))
  }

  async list(): Promise<ProjectManifest[]> {
    const entries = await readdir(this.root, { withFileTypes: true }).catch(() => [])
    const manifests = await Promise.all(
      entries.filter((entry) => entry.isDirectory()).map((entry) => readManifest(join(this.root, entry.name)).catch(() => undefined)),
    )
    return manifests.filter((manifest) => manifest !== undefined).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async get(slug: string): Promise<ProjectManifest> {
    try {
      return await readManifest(this.directory(slug))
    } catch {
      throw new ProjectNotFoundError(`Unknown project: ${slug}`)
    }
  }

  /** Creates the repository, scaffolds the Nuxt project and imports the first design version. */
  async create(name: string, fig: FigUpload): Promise<ProjectManifest> {
    const slug = slugify(name).slice(0, 63)
    if (!SLUG.test(slug)) throw new ProjectConflictError('The project name must contain letters or digits')
    const directory = this.directory(slug)
    if (await stat(directory).catch(() => undefined)) throw new ProjectConflictError(`A project named "${slug}" already exists`)

    // Parse before touching the disk: an unreadable file must not leave a half-created project.
    const analysis = analyzeDesign(parseFig(fig.bytes))
    const manifest: ProjectManifest = { schema: 1, name, slug, createdAt: new Date().toISOString(), versions: [], implementedVersion: 0 }

    await mkdir(directory, { recursive: true })
    const git = this.git(slug)
    const files = this.files(slug)
    await git.init()
    for (const file of scaffoldProject(manifest, buildTheme(analysis.summary))) await files.write(file.path, file.content)
    await writeManifest(directory, manifest)
    await git.commit('chore: scaffold nuxt project')

    return this.importDesign(slug, fig)
  }

  /** Imports a .fig file as the next design version and commits it under a `design-vN` tag. */
  async importDesign(slug: string, fig: FigUpload): Promise<ProjectManifest> {
    const manifest = await this.get(slug)
    const parsed = parseFig(fig.bytes)
    // Hash the decoded design, not the file: Figma stamps every export with its date.
    const contentHash = createHash('sha256')
      .update(JSON.stringify(parsed.document))
      .update(parsed.media.map((asset) => asset.hash).join())
      .digest('hex')
    if (manifest.versions.at(-1)?.contentHash === contentHash) throw new ProjectConflictError('This file is identical to the current design version')

    const analysis = analyzeDesign(parsed)
    const version = latestVersion(manifest) + 1
    const files = this.files(slug)

    const generated = [
      ...analysis.files.map((file) => ({ path: `${PROJECT_PATHS.media}/${file.path}`, content: file.content })),
      ...analysis.collections.map((collection) => ({
        path: `${PROJECT_PATHS.data}/${collection.slug}.json`,
        content: JSON.stringify(collection.items, null, 2) + '\n',
      })),
    ]
    // Files generated from the previous version and absent from this one are stale.
    const previous: string[] = await files.readJson<string[]>(PROJECT_PATHS.generated).catch(() => [])
    const current = new Set(generated.map((file) => file.path))
    for (const path of previous) if (!current.has(path)) await files.remove(path)
    for (const file of generated) await files.write(file.path, file.content)

    await files.write(PROJECT_PATHS.sourceFig, fig.bytes)
    await files.writeJson(PROJECT_PATHS.document, parsed.document, 1)
    await files.writeJson(PROJECT_PATHS.summary, analysis.summary)
    await files.writeJson(PROJECT_PATHS.theme, buildTheme(analysis.summary))
    await files.writeJson(PROJECT_PATHS.generated, [...current].sort())
    await files.write(PROJECT_PATHS.tokensCss, buildTokensCss(analysis.summary, version))
    if (parsed.thumbnail) await files.write(PROJECT_PATHS.thumbnail, parsed.thumbnail)

    manifest.versions.push({ version, contentHash, fileName: fig.fileName, importedAt: new Date().toISOString() })
    await writeManifest(this.directory(slug), manifest)

    const git = this.git(slug)
    await git.commit(`feat(design): import design v${version}`, [
      'design',
      PROJECT_PATHS.media,
      PROJECT_PATHS.data,
      PROJECT_PATHS.tokensCss,
      MANIFEST_FILE,
    ])
    await git.tag(designTag(version))
    return manifest
  }

  /** The design document of a version (the latest when omitted). */
  async document(slug: string, version?: number): Promise<DesignDocument> {
    const manifest = await this.get(slug)
    if (version !== undefined && version !== latestVersion(manifest)) return this.archived<DesignDocument>(slug, version, PROJECT_PATHS.document)

    const files = this.files(slug)
    const { mtimeMs } = await stat(files.resolve(PROJECT_PATHS.document))
    const cached = this.documents.get(slug)
    if (cached?.mtime === mtimeMs) return cached.document
    const document = await files.readJson<DesignDocument>(PROJECT_PATHS.document)
    this.documents.set(slug, { mtime: mtimeMs, document })
    return document
  }

  async summary(slug: string, version?: number): Promise<DesignSummary> {
    const manifest = await this.get(slug)
    if (version !== undefined && version !== latestVersion(manifest)) return this.archived<DesignSummary>(slug, version, PROJECT_PATHS.summary)
    return this.files(slug).readJson<DesignSummary>(PROJECT_PATHS.summary)
  }

  private async archived<T>(slug: string, version: number, path: string): Promise<T> {
    const content = await this.git(slug).show(designTag(version), path)
    if (content === undefined) throw new ProjectNotFoundError(`Project ${slug} has no design v${version}`)
    return JSON.parse(content)
  }

  /**
   * What changed between two design versions. By default: from the version
   * the code implements to the latest one, i.e. the work left to do.
   */
  async diff(slug: string, from?: number, to?: number): Promise<VersionDiff> {
    const manifest = await this.get(slug)
    const target = to ?? latestVersion(manifest)
    const base = from ?? manifest.implementedVersion
    const [before, after] = await Promise.all([
      base > 0 ? this.document(slug, base) : EMPTY_DOCUMENT,
      this.document(slug, target),
    ])
    const [summaryBefore, summaryAfter] = await Promise.all([
      base > 0 ? this.summary(slug, base) : undefined,
      this.summary(slug, target),
    ])
    return { from: base, to: target, diff: diffDesign(before, after, { before: summaryBefore, after: summaryAfter }) }
  }

  /** Records that the code now reproduces `version` (the latest when omitted). */
  async markImplemented(slug: string, version?: number): Promise<ProjectManifest> {
    const manifest = await this.get(slug)
    const target = version ?? latestVersion(manifest)
    if (!manifest.versions.some((entry) => entry.version === target)) throw new ProjectNotFoundError(`Project ${slug} has no design v${target}`)
    manifest.implementedVersion = target
    await writeManifest(this.directory(slug), manifest)
    const git = this.git(slug)
    await git.commit(`chore(design): mark design v${target} as implemented`, [MANIFEST_FILE])
    await git.tag(implementedTag(target))
    return manifest
  }
}
