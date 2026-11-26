import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export class ForbiddenPathError extends Error {}

export interface FileEntry {
  path: string
  type: 'file' | 'directory'
  size: number
}

const IGNORED = new Set(['.git', 'node_modules', '.nuxt', '.output', '.data', 'dist'])

/**
 * File access confined to one project folder. Every path is resolved against
 * the root and rejected if it escapes it or targets git internals.
 */
export class ProjectFiles {
  readonly root: string

  constructor(root: string) {
    this.root = resolve(root)
  }

  resolve(path: string): string {
    const absolute = resolve(this.root, path)
    const inside = relative(this.root, absolute)
    // `relative` returns an absolute path when the target is on another drive.
    if (inside.startsWith('..') || isAbsolute(inside)) throw new ForbiddenPathError(`Path escapes the project: ${path}`)
    if (inside.split(sep)[0] === '.git') throw new ForbiddenPathError('The .git folder is managed through the git tools')
    return absolute
  }

  async read(path: string): Promise<Uint8Array> {
    return readFile(this.resolve(path))
  }

  async readText(path: string): Promise<string> {
    return readFile(this.resolve(path), 'utf8')
  }

  async readJson<T>(path: string): Promise<T> {
    return JSON.parse(await this.readText(path))
  }

  async exists(path: string): Promise<boolean> {
    return stat(this.resolve(path)).then(
      () => true,
      () => false,
    )
  }

  async write(path: string, content: string | Uint8Array): Promise<void> {
    const absolute = this.resolve(path)
    await mkdir(dirname(absolute), { recursive: true })
    await writeFile(absolute, content)
  }

  async writeJson(path: string, value: unknown, indent = 2): Promise<void> {
    await this.write(path, JSON.stringify(value, null, indent) + '\n')
  }

  async remove(path: string): Promise<void> {
    await rm(this.resolve(path), { recursive: true, force: true })
  }

  /** Lists a folder, skipping dependencies and build output. */
  async list(path = '.', recursive = false): Promise<FileEntry[]> {
    const entries: FileEntry[] = []
    const visit = async (directory: string) => {
      const children = await readdir(directory, { withFileTypes: true }).catch(() => [])
      for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
        if (IGNORED.has(child.name)) continue
        const absolute = join(directory, child.name)
        const info = await stat(absolute)
        const entry = relative(this.root, absolute).split(sep).join('/')
        entries.push({ path: entry, type: child.isDirectory() ? 'directory' : 'file', size: child.isDirectory() ? 0 : info.size })
        if (recursive && child.isDirectory()) await visit(absolute)
      }
    }
    await visit(this.resolve(path))
    return entries
  }
}
