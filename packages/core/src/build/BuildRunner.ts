import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'

export type BuildStatus = 'running' | 'succeeded' | 'failed'

export interface BuildJob {
  id: string
  project: string
  status: BuildStatus
  /** Step currently running, or the last one that ran. */
  step: string
  startedAt: string
  finishedAt?: string
  log: string[]
}

interface Step {
  name: string
  command: string
  args: string[]
}

const STEPS: Step[] = [
  { name: 'install', command: 'npm', args: ['install', '--no-audit', '--no-fund'] },
  { name: 'generate', command: 'npm', args: ['run', 'generate'] },
]
const MAX_LOG_LINES = 4000
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g

/**
 * Builds projects into static sites (`npm install` then `nuxt generate`),
 * one build at a time per project, keeping the output for monitoring.
 */
export class BuildRunner {
  private readonly jobs = new Map<string, BuildJob>()
  private readonly completions = new Map<string, Promise<BuildJob>>()

  constructor(private readonly directoryOf: (project: string) => string) {}

  /** Starts a build, or returns the one already running for the project. */
  start(project: string): BuildJob {
    const running = this.latest(project)
    if (running?.status === 'running') return running

    const directory = this.directoryOf(project)
    const job: BuildJob = { id: randomUUID(), project, status: 'running', step: STEPS[0]!.name, startedAt: new Date().toISOString(), log: [] }
    this.jobs.set(job.id, job)
    this.completions.set(
      job.id,
      this.run(job, directory).then((succeeded) => {
        job.status = succeeded ? 'succeeded' : 'failed'
        job.finishedAt = new Date().toISOString()
        return job
      }),
    )
    return job
  }

  get(id: string): BuildJob | undefined {
    return this.jobs.get(id)
  }

  latest(project: string): BuildJob | undefined {
    return [...this.jobs.values()].filter((job) => job.project === project).at(-1)
  }

  /** Resolves when the job has finished, whatever the outcome. */
  wait(id: string): Promise<BuildJob | undefined> {
    return this.completions.get(id) ?? Promise.resolve(undefined)
  }

  private async run(job: BuildJob, directory: string): Promise<boolean> {
    for (const step of STEPS) {
      job.step = step.name
      this.append(job, `$ ${step.command} ${step.args.join(' ')}`)
      if ((await this.exec(job, step, directory)) !== 0) return false
    }
    return true
  }

  private exec(job: BuildJob, step: Step, directory: string): Promise<number> {
    return new Promise((resolve) => {
      // npm is a .cmd shim on Windows, which Node only runs through a shell. Arguments are constants.
      const child = spawn(step.command, step.args, { cwd: directory, shell: process.platform === 'win32', env: { ...process.env, CI: 'true', FORCE_COLOR: '0' } })
      const onData = (chunk: Buffer) => chunk.toString().split(/\r?\n/).forEach((line) => line.trim() && this.append(job, line))
      child.stdout.on('data', onData)
      child.stderr.on('data', onData)
      child.on('error', (error) => {
        this.append(job, `Failed to start ${step.command}: ${error.message}`)
        resolve(1)
      })
      child.on('close', (code) => resolve(code ?? 1))
    })
  }

  private append(job: BuildJob, line: string): void {
    job.log.push(line.replace(ANSI, ''))
    if (job.log.length > MAX_LOG_LINES) job.log.splice(0, job.log.length - MAX_LOG_LINES)
  }
}
