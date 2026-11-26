import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createWorkspace } from '@fig2nuxt/core'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sampleFig } from '../../core/test/fixtures/sampleDesign.ts'
import { createServer } from '../src/createServer.ts'

Object.assign(process.env, {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
})

describe('MCP server', () => {
  let root: string
  let client: Client

  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args })
    const text = (result.content as { text: string }[])[0]!.text
    return { isError: result.isError === true, text, json: () => JSON.parse(text) }
  }

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'fig2nuxt-mcp-'))
    await writeFile(join(root, 'v1.fig'), sampleFig())
    await writeFile(join(root, 'v2.fig'), sampleFig({ revised: true }))

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await createServer(createWorkspace(join(root, 'projects'))).connect(serverTransport)
    client = new Client({ name: 'test', version: '0.0.0' })
    await client.connect(clientTransport)
  })
  afterAll(async () => {
    await client.close()
    await rm(root, { recursive: true, force: true })
  })

  it('advertises the workflow and its tools', async () => {
    expect(client.getInstructions()).toContain('get_design_diff')
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(['create_project', 'import_design', 'get_design_summary', 'inspect_node', 'get_design_diff', 'write_file', 'git_commit', 'build_project', 'start_preview']),
    )
    expect(tools.every((tool) => tool.description)).toBe(true)
  })

  it('drives a project from creation to an implemented design', async () => {
    const created = (await call('create_project', { name: 'Demo', figPath: join(root, 'v1.fig') })).json()
    expect(created).toMatchObject({ project: 'demo', latestDesignVersion: 1, pendingImplementation: true })

    const summary = (await call('get_design_summary', { project: 'demo' })).json()
    expect(summary.screens[0]).toMatchObject({ name: 'Home', route: '/' })
    expect(summary.iconLibraries[0]).toMatchObject({ prefix: 'lucide' })
    expect(summary.collections).toEqual([{ name: 'Cards', file: 'data/cards.json', count: 3, fields: ['cover', 'title', 'body'] }])

    const frameId = summary.screens[0].variants[0].nodeId
    expect((await call('get_frame_outline', { project: 'demo', nodeId: frameId })).text).toContain('instance of "Card"')
    expect((await call('inspect_node', { project: 'demo', nodeId: frameId, depth: 1 })).json().css.display).toBe('flex')

    await call('write_file', { project: 'demo', path: 'app/components/AppCard.vue', content: '<template><article /></template>\n' })
    expect((await call('git_commit', { project: 'demo', message: 'wip' })).isError).toBe(true)
    expect((await call('git_commit', { project: 'demo', message: 'feat(card): add card component' })).json().committed).toBeTruthy()
    expect((await call('mark_implemented', { project: 'demo' })).json()).toMatchObject({ implementedVersion: 1, pendingImplementation: false })
  })

  it('reports the exact delta of a new design version', async () => {
    const imported = (await call('import_design', { project: 'demo', figPath: join(root, 'v2.fig') })).json()
    expect(imported).toMatchObject({ latestDesignVersion: 2, pendingImplementation: true, delta: { from: 1, to: 2, stats: { added: 1, removed: 1, changed: 2 } } })

    const diff = (await call('get_design_diff', { project: 'demo' })).json()
    const headline = diff.frames[0].layers.find((layer: { name: string }) => layer.name === 'Headline')
    expect(headline.changes).toEqual([{ property: 'text.characters', before: 'Build faster', after: 'Build much faster' }])
  })

  it('returns failures as tool errors', async () => {
    expect(await call('get_project', { project: 'missing' })).toMatchObject({ isError: true, text: 'Unknown project: missing' })
    expect((await call('read_file', { project: 'demo', path: '../../v1.fig' })).isError).toBe(true)
    expect((await call('start_preview', { project: 'demo' })).text).toContain('has not been built yet')
  })
})
