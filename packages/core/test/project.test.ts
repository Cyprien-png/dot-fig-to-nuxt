import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  assertConventionalCommit,
  createWorkspace,
  ForbiddenPathError,
  InvalidCommitMessageError,
  ProjectConflictError,
  type Workspace,
} from '../src/index.ts'
import { HASH_A, sampleFig } from './fixtures/sampleDesign.ts'

// Commits must work on machines without a global git identity (CI).
Object.assign(process.env, {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
})

describe('project lifecycle', () => {
  let root: string
  let workspace: Workspace

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'fig2nuxt-'))
    workspace = createWorkspace(root)
    await workspace.projects.create('Sample Landing', { bytes: sampleFig(), fileName: 'landing.fig' })
  })
  afterAll(() => rm(root, { recursive: true, force: true }))

  it('creates a git repository with a scaffold commit and a tagged design import', async () => {
    const manifest = await workspace.projects.get('sample-landing')
    expect(manifest).toMatchObject({ name: 'Sample Landing', slug: 'sample-landing', implementedVersion: 0 })
    expect(manifest.versions).toMatchObject([{ version: 1, fileName: 'landing.fig' }])

    const log = await workspace.projects.git('sample-landing').log()
    expect(log.map((commit) => commit.message)).toEqual(['feat(design): import design v1', 'chore: scaffold nuxt project'])
    expect(log[0]!.tags).toEqual(['design-v1'])
    expect((await workspace.projects.git('sample-landing').status()).clean).toBe(true)
  })

  it('writes the nuxt scaffold, design artefacts, media and collections', async () => {
    const files = workspace.projects.files('sample-landing')
    const paths = (await files.list('.', true)).map((entry) => entry.path)
    expect(paths).toEqual(
      expect.arrayContaining([
        'nuxt.config.ts',
        'package.json',
        'AGENTS.md',
        '.github/workflows/ci.yml',
        'app/pages/index.vue',
        'app/assets/css/tokens.css',
        'design/source.fig',
        'design/document.json',
        'design/summary.json',
        'design/theme.json',
        `media/images/${HASH_A}.png`,
        'data/cards.json',
      ]),
    )
    expect(await files.readJson('data/cards.json')).toHaveLength(3)
    expect(await files.readJson('design/theme.json')).toEqual({
      fonts: [{ name: 'Inter', weights: [400, 500, 700], styles: ['normal'] }],
      iconCollections: ['lucide'],
    })
    expect(await files.readJson<{ devDependencies: object }>('package.json')).toMatchObject({ devDependencies: { '@iconify-json/lucide': expect.any(String) } })
    const tokens = await files.readText('app/assets/css/tokens.css')
    expect(tokens).toContain('--color-brand-primary: #4f46e5;')
    expect(tokens).toContain('.text-64-700 {')
  })

  it('treats the whole design as the delta until something is implemented', async () => {
    const { from, to, diff } = await workspace.projects.diff('sample-landing')
    expect([from, to]).toEqual([0, 1])
    expect(diff.frames.every((frame) => frame.status === 'added')).toBe(true)
  })

  it('rejects an identical file and duplicate projects', async () => {
    const upload = { bytes: sampleFig(), fileName: 'landing.fig' }
    await expect(workspace.projects.importDesign('sample-landing', upload)).rejects.toThrow(ProjectConflictError)
    await expect(workspace.projects.create('Sample Landing', upload)).rejects.toThrow(ProjectConflictError)
  })

  it('computes the delta between the implemented version and a new one', async () => {
    await workspace.projects.markImplemented('sample-landing')
    await workspace.projects.importDesign('sample-landing', { bytes: sampleFig({ revised: true }), fileName: 'landing-v2.fig' })

    const manifest = await workspace.projects.get('sample-landing')
    expect(manifest).toMatchObject({ implementedVersion: 1 })
    expect(manifest.versions.map((version) => version.version)).toEqual([1, 2])

    const { from, to, diff } = await workspace.projects.diff('sample-landing')
    expect([from, to]).toEqual([1, 2])
    expect(diff.stats).toMatchObject({ added: 1, removed: 1, changed: 2 })
    expect(diff.tokens.colors.added).toEqual(['#e11d48'])

    const files = workspace.projects.files('sample-landing')
    expect(await files.readJson('data/cards.json')).toHaveLength(2)
    expect(await files.readText('app/assets/css/tokens.css')).toContain('--color-brand-primary: #e11d48;')
    expect((await workspace.projects.summary('sample-landing', 1)).colors[0]!.value).toBe('#4f46e5')
  })

  it('inspects layers, including those inside instances', async () => {
    const inspector = await workspace.inspector('sample-landing')
    const outline = inspector.outline('1:30')
    expect(outline).toContain('FRAME "Home / Desktop" [1:30] 1440×900 · flex-column gap 32')
    expect(outline).toContain('instance of "Card"')
    expect(outline).toContain('icon lucide:arrow-right')

    expect(inspector.inspect('I1:34;1:12')).toMatchObject({ text: 'Beta', css: { 'font-weight': '700' } })
    expect(inspector.inspect('1:36', 0)).toMatchObject({ hiddenChildren: 2, css: { 'background-color': '#e11d48' } })
    expect(inspector.search('much')).toMatchObject([{ id: '1:31', frame: 'Home / Desktop' }])
    expect(inspector.render('1:30')).toContain('media/images/')
  })

  it('confines file access to the project', () => {
    const files = workspace.projects.files('sample-landing')
    expect(() => files.resolve('../other/secret')).toThrow(ForbiddenPathError)
    expect(() => files.resolve('.git/config')).toThrow(ForbiddenPathError)
  })

  it('commits agent work with a conventional message only', async () => {
    const git = workspace.projects.git('sample-landing')
    await workspace.projects.files('sample-landing').write('app/components/AppCard.vue', '<template><article /></template>\n')
    await expect(git.commit('added a card')).rejects.toThrow(InvalidCommitMessageError)
    expect(await git.commit('feat(card): add card component')).toBeTruthy()
    expect(await git.commit('feat(card): nothing left')).toBeUndefined()
  })
})

describe('assertConventionalCommit', () => {
  it.each(['feat: add hero', 'fix(nav): close menu on route change', 'feat(api)!: drop legacy route'])('accepts %s', (message) => {
    expect(() => assertConventionalCommit(message)).not.toThrow()
  })
  it.each(['Add hero', 'feat: add hero.', 'feature: add hero', 'feat: add hero\n\nbody'])('rejects %s', (message) => {
    expect(() => assertConventionalCommit(message)).toThrow(InvalidCommitMessageError)
  })
})
