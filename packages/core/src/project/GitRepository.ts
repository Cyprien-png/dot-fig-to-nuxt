import { simpleGit, type SimpleGit } from 'simple-git'
import { assertConventionalCommit } from './conventionalCommit.ts'

export interface CommitInfo {
  hash: string
  date: string
  message: string
  author: string
  tags: string[]
}

export interface RepositoryStatus {
  branch: string
  clean: boolean
  changes: { path: string; status: string }[]
  remote?: string
  ahead: number
}

/** The git operations a project needs, and nothing else. */
export class GitRepository {
  private readonly git: SimpleGit

  constructor(directory: string) {
    this.git = simpleGit(directory)
  }

  async init(): Promise<void> {
    await this.git.init(['--initial-branch=main'])
    // Projects are generated on any OS: keep line endings stable so diffs stay meaningful.
    await this.git.addConfig('core.autocrlf', 'false')
  }

  /** Commits the given paths (everything when omitted). Returns the hash, or `undefined` when there was nothing to commit. */
  async commit(message: string, paths: string[] = ['.']): Promise<string | undefined> {
    assertConventionalCommit(message)
    await this.git.add(['--all', '--', ...paths])
    const staged = await this.git.diff(['--cached', '--name-only'])
    if (!staged.trim()) return undefined
    const result = await this.git.commit(message)
    return result.commit
  }

  async tag(name: string): Promise<void> {
    await this.git.tag(['--force', name])
  }

  /** Reads a file as it was at `ref`, or `undefined` when it did not exist. */
  async show(ref: string, path: string): Promise<string | undefined> {
    try {
      return await this.git.show([`${ref}:${path}`])
    } catch {
      return undefined
    }
  }

  async log(limit = 50): Promise<CommitInfo[]> {
    try {
      const log = await this.git.log({ maxCount: limit })
      return log.all.map((entry) => ({
        hash: entry.hash,
        date: entry.date,
        message: entry.message,
        author: entry.author_name,
        tags: entry.refs
          .split(', ')
          .filter((ref) => ref.startsWith('tag: '))
          .map((ref) => ref.slice('tag: '.length)),
      }))
    } catch {
      return []
    }
  }

  async status(): Promise<RepositoryStatus> {
    const status = await this.git.status()
    const remotes = await this.git.getRemotes(true)
    return {
      branch: status.current ?? 'main',
      clean: status.isClean(),
      changes: status.files.map((file) => ({ path: file.path, status: `${file.index}${file.working_dir}`.trim() })),
      remote: remotes.find((remote) => remote.name === 'origin')?.refs.push,
      ahead: status.ahead,
    }
  }

  /** Unified diff of the working tree against HEAD, optionally limited to some paths. */
  async workingDiff(paths: string[] = []): Promise<string> {
    return this.git.diff(['HEAD', '--', ...paths])
  }

  async setRemote(url: string): Promise<void> {
    const remotes = await this.git.getRemotes()
    if (remotes.some((remote) => remote.name === 'origin')) await this.git.remote(['set-url', 'origin', url])
    else await this.git.addRemote('origin', url)
  }

  async push(): Promise<void> {
    await this.git.push(['--set-upstream', 'origin', 'HEAD', '--follow-tags'])
    await this.git.pushTags('origin')
  }
}
