import type { ProjectManifest } from '../project/manifest.ts'
import type { ProjectTheme } from './theme.ts'

export interface ScaffoldFile {
  path: string
  content: string
}

/**
 * Versions the generated project starts from. Dependabot (scaffolded below)
 * keeps them current afterwards, security patches included.
 */
const VERSIONS = {
  nuxt: '^4.7.0',
  vue: '^3.5.46',
  // Exact on purpose: 5.5.2 breaks prerendering ("__VUE_OPTIONS_API__ is not defined").
  vueRouter: '5.5.1',
  nuxtFonts: '^1.2.1',
  nuxtIcon: '^2.6.3',
  mongodb: '^7.9.1',
  iconifyJson: '^1.2.0',
  typescript: '~6.0.0',
  typesNode: '^22.20.7',
  vueTsc: '^3.3.14',
  node: '22',
} as const

const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n'

function packageJson(manifest: ProjectManifest, theme: ProjectTheme): string {
  return json({
    name: manifest.slug,
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'nuxt dev',
      build: 'nuxt build',
      generate: 'nuxt generate',
      preview: 'nuxt preview',
      typecheck: 'nuxt typecheck',
      postinstall: 'nuxt prepare',
      'db:seed': 'node --env-file-if-exists=.env scripts/seed.mjs',
    },
    dependencies: {
      '@nuxt/fonts': VERSIONS.nuxtFonts,
      '@nuxt/icon': VERSIONS.nuxtIcon,
      mongodb: VERSIONS.mongodb,
      nuxt: VERSIONS.nuxt,
      vue: VERSIONS.vue,
      'vue-router': VERSIONS.vueRouter,
    },
    devDependencies: {
      ...Object.fromEntries(theme.iconCollections.sort().map((prefix) => [`@iconify-json/${prefix}`, VERSIONS.iconifyJson])),
      '@types/node': VERSIONS.typesNode,
      typescript: VERSIONS.typescript,
      'vue-tsc': VERSIONS.vueTsc,
    },
  })
}

const nuxtConfig = (manifest: ProjectManifest) => `import { fileURLToPath } from 'node:url'
import type { ModuleOptions as FontsOptions } from '@nuxt/fonts'
import theme from './design/theme.json'

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// Statically generated site: \`npm run generate\` prerenders every route to .output/public.
export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  modules: ['@nuxt/fonts', '@nuxt/icon'],
  css: ['~/assets/css/tokens.css', '~/assets/css/main.css'],
  // Content collections live in MongoDB and are read while the site is generated.
  // Without MONGODB_URI the seed files in data/ are used instead.
  runtimeConfig: {
    mongodbUri: process.env.MONGODB_URI ?? '',
    mongodbDb: process.env.MONGODB_DB ?? ${JSON.stringify(manifest.slug)},
  },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: ${JSON.stringify(manifest.name)},
    },
  },
  // Fonts are resolved from the families used in the design and self-hosted at build time.
  fonts: { families: theme.fonts as FontsOptions['families'] },
  // Bundle the icons actually used, so the static site needs no icon API at runtime.
  icon: { clientBundle: { scan: true } },
  nitro: {
    prerender: { crawlLinks: true, routes: ['/'] },
    // Design media stay in /media at the project root and are served as /media/*.
    publicAssets: [{ dir: fromRoot('./media'), baseURL: '/media', maxAge: 60 * 60 * 24 * 365 }],
    // Seed records of the collections, read by server/utils/collections.ts.
    serverAssets: [{ baseName: 'data', dir: fromRoot('./data') }],
  },
})
`

const TSCONFIG = json({
  files: [],
  references: ['app', 'server', 'shared', 'node'].map((name) => ({ path: `./.nuxt/tsconfig.${name}.json` })),
})

const APP_VUE = `<template>
  <NuxtPage />
</template>
`

const INDEX_VUE = `<script setup lang="ts">
// Placeholder page: replace it with the implementation of the design.
</script>

<template>
  <main class="placeholder">
    <h1>Design imported</h1>
    <p>This project is ready to be implemented from its Figma file.</p>
  </main>
</template>

<style scoped>
.placeholder {
  display: grid;
  min-height: 100vh;
  place-content: center;
  gap: 0.5rem;
  text-align: center;
  font-family: system-ui, sans-serif;
}
</style>
`

const MAIN_CSS = `*,
*::before,
*::after {
  box-sizing: border-box;
}

* {
  margin: 0;
}

html {
  -webkit-text-size-adjust: 100%;
  text-size-adjust: 100%;
}

body {
  min-height: 100vh;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

img,
picture,
video,
svg {
  display: block;
  max-width: 100%;
}

input,
button,
textarea,
select {
  font: inherit;
  color: inherit;
}

a {
  color: inherit;
  text-decoration: none;
}

ul,
ol {
  padding: 0;
  list-style: none;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
`

const GITIGNORE = `node_modules/
.nuxt/
.output/
.data/
.nitro/
.cache/
dist/
design/.renders/
*.log
.env
.env.*
!.env.example
.DS_Store
`

const GITATTRIBUTES = `* text=auto eol=lf
*.fig binary
`

const CI_WORKFLOW = `name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    name: Build static site
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: ${VERSIONS.node}
      - name: Install dependencies
        run: if [ -f package-lock.json ]; then npm ci; else npm install; fi
      - name: Type-check
        run: npm run typecheck
      - name: Generate
        run: npm run generate
        env:
          # Optional repository settings: without them the collections come from data/.
          MONGODB_URI: \${{ secrets.MONGODB_URI }}
          MONGODB_DB: \${{ vars.MONGODB_DB }}
      - uses: actions/upload-artifact@v7
        with:
          name: site
          path: .output/public
          include-hidden-files: true
          if-no-files-found: error
`

const DEPENDABOT = `version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    commit-message:
      prefix: build
      include: scope
    groups:
      nuxt:
        patterns: ['nuxt', '@nuxt/*', 'vue', 'vue-router']
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
    commit-message:
      prefix: ci
`

const readme = (manifest: ProjectManifest) => `# ${manifest.name}

Static Nuxt site reproducing the Figma design in \`design/source.fig\`.
Generated and kept in sync by [dot-fig-to-nuxt](https://github.com/Cyprien-png/dot-fig-to-nuxt).

## Commands

| Command | Purpose |
| --- | --- |
| \`npm install\` | Install dependencies |
| \`npm run dev\` | Start the dev server |
| \`npm run generate\` | Prerender the site to \`.output/public\` |
| \`npm run preview\` | Serve the generated site |
| \`npm run typecheck\` | Type-check the project |
| \`npm run db:seed\` | Load the collections of \`data/\` into MongoDB (\`-- --force\` replaces existing documents) |

\`.output/public\` is plain static files: host it on any static host or CDN.

## Layout

| Path | Content |
| --- | --- |
| \`app/\` | Nuxt source: pages, components, composables, styles |
| \`app/assets/css/tokens.css\` | Design tokens generated from the design (do not edit) |
| \`design/\` | The Figma source and what was extracted from it, one git tag per version |
| \`media/\` | Images, videos, audio and SVG from the design, served at \`/media\` |
| \`data/\` | Seed records of the content collections extracted from the design |
| \`server/\` | Build-time access to the MongoDB collections |
| \`fig2nuxt.json\` | Design versions and which one the code implements |

## Collections

Repeated content is stored in MongoDB, one collection per file of \`data/\`. Copy \`.env.example\`
to \`.env\`, run \`npm run db:seed\` once, then edit the documents in the database: the next
\`npm run generate\` reads them and bakes them into the static pages. The database is only
needed at build time. When \`MONGODB_URI\` is not set, the build falls back to the seed files.

See \`AGENTS.md\` for the rules followed when implementing the design.
`

const AGENTS_MD = `# Implementation guide

This repository is a Nuxt 4 + TypeScript site that must reproduce the Figma design in
\`design/\` one-to-one. It is driven through the dot-fig-to-nuxt MCP server.

## Source of truth

- \`design/summary.json\`: palette, fonts, text styles, screens, breakpoints, components,
  icon libraries, interactions, media and collections.
- The MCP tools \`get_frame_outline\`, \`inspect_node\` and \`render_frame\` give the exact
  geometry, CSS and a reference render of any layer.
- \`get_design_diff\` lists exactly what changed since the implemented version. When a new
  design version is imported, implement that delta and nothing else.

## Rules

1. **Tokens, not literals.** Use the custom properties and \`.text-*\` classes of
   \`app/assets/css/tokens.css\`. Never edit that file: it is regenerated on import.
2. **Components.** Every Figma component in use becomes a Vue component in
   \`app/components/\`, with variants and overrides as typed props and slots. Also extract a
   component whenever a structure repeats or a section stands on its own, even if the
   designer did not make it a Figma component. One responsibility per component.
3. **Layout.** Auto layout maps to flexbox or grid. Absolute positioning is for layers
   that really overlap. Do not hard-code a width where the design hugs or fills.
4. **Responsive.** Each screen lists its frames per breakpoint. Implement mobile-first with
   media queries at the design widths, and interpolate sensibly in between.
5. **Fonts.** Families come from \`design/theme.json\` through \`@nuxt/fonts\`. If a family is
   not available from a provider, add its files under \`public/fonts\` and declare it.
6. **Icons.** For an icon with an \`iconify\` name use \`<Icon name="..." />\` from
   \`@nuxt/icon\`, with the matching \`@iconify-json/*\` package installed. Other artwork is
   exported under \`media/icons\`.
7. **Media.** Reference files as \`/media/...\`. Give every image an \`alt\`, a width and a height.
8. **Collections.** Repeated content is a MongoDB collection, seeded from \`data/<name>.json\`.
   Read it with \`const { data: items } = await useCollection('<name>')\` and render it with
   \`v-for\`. Never import the seed files or hard-code the records in a component.
9. **Interactions.** Prototype interactions become real behaviour: links are \`<NuxtLink>\`,
   hover and press states are CSS, transitions reuse the design's duration and easing.
10. **Static and accessible.** Everything must prerender with \`npm run generate\`: server
    code only runs at build time, the deployed site is plain files. Use semantic HTML, one
    \`<h1>\` per page, labelled controls.
11. **Clean code.** TypeScript strict, \`<script setup lang="ts">\`, scoped styles, no dead
    code, no \`any\`. Prefer small composables over duplicated logic.

## Workflow

1. Read the summary, then the outline of each screen.
2. Build shared components first, then pages, screen by screen.
3. Run the build after each screen and compare the result with the reference render.
4. Commit atomically with Conventional Commits (\`feat(home): add hero section\`).
5. When the code matches a design version, mark it implemented.
`

const COLLECTIONS_UTIL = `import { MongoClient, type Db } from 'mongodb'

/** A record of a content collection. */
export type CollectionRecord = Record<string, string>

/** The seed files of data/, bundled as server assets. */
const seeds = () => useStorage<CollectionRecord[]>('assets:data')

let database: Promise<Db> | undefined

function connect(uri: string, name: string): Promise<Db> {
  database ??= new MongoClient(uri).connect().then((client) => {
    useNitroApp().hooks.hookOnce('close', () => client.close())
    return client.db(name)
  })
  return database
}

/** The collections of the design: one per seed file. */
export async function collectionNames(): Promise<string[]> {
  const keys = await seeds().getKeys()
  return keys.filter((key) => key.endsWith('.json')).map((key) => key.slice(0, -'.json'.length))
}

/** Reads a collection from MongoDB, or from its seed file when no database is configured. */
export async function readCollection(name: string): Promise<CollectionRecord[]> {
  if (!(await collectionNames()).includes(name)) throw createError({ statusCode: 404, statusMessage: \`Unknown collection "\${name}"\` })

  const { mongodbUri, mongodbDb } = useRuntimeConfig()
  if (!mongodbUri) return (await seeds().getItem(\`\${name}.json\`)) ?? []

  const db = await connect(mongodbUri, mongodbDb)
  return db
    .collection(name)
    .find<CollectionRecord>({}, { projection: { _id: 0, order: 0 }, sort: { order: 1 } })
    .toArray()
}
`

const COLLECTION_ROUTE = `export default defineEventHandler((event) => readCollection(getRouterParam(event, 'name') ?? ''))
`

const USE_COLLECTION = `/**
 * Records of a content collection. They are read from MongoDB while the site is
 * generated and inlined in the page payload: the deployed site never queries the database.
 */
export function useCollection<T extends Record<string, string> = Record<string, string>>(name: string) {
  return useAsyncData(\`collection:\${name}\`, () => $fetch<T[]>(\`/api/collections/\${name}\`), { default: () => [] as T[] })
}
`

const seedScript = (manifest: ProjectManifest) => `// Loads the seed files of data/ into MongoDB, one collection per file.
// A collection that already has documents is left alone unless --force is passed.
import { readdir, readFile } from 'node:fs/promises'
import { MongoClient } from 'mongodb'

const uri = process.env.MONGODB_URI
if (!uri) {
  console.error('MONGODB_URI is not set: copy .env.example to .env first.')
  process.exit(1)
}

const force = process.argv.includes('--force')
const dataDir = new URL('../data/', import.meta.url)
const files = (await readdir(dataDir).catch(() => [])).filter((file) => file.endsWith('.json')).sort()
const client = await new MongoClient(uri).connect()

try {
  const db = client.db(process.env.MONGODB_DB || ${JSON.stringify(manifest.slug)})
  for (const file of files) {
    const name = file.slice(0, -'.json'.length)
    const records = JSON.parse(await readFile(new URL(file, dataDir), 'utf8'))
    const collection = db.collection(name)
    if (!force && (await collection.estimatedDocumentCount()) > 0) {
      console.log(\`skipped \${name}: it already has documents (pass --force to replace them)\`)
      continue
    }
    await collection.deleteMany({})
    // "order" keeps the records in the order of the design.
    if (records.length) await collection.insertMany(records.map((record, order) => ({ ...record, order })))
    console.log(\`seeded \${name}: \${records.length} documents\`)
  }
} finally {
  await client.close()
}
`

const envExample = (manifest: ProjectManifest) => `# MongoDB holding the content collections, read when the site is generated.
# Without MONGODB_URI the build uses the seed files of data/.
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=${manifest.slug}
`

/** Files of a brand-new project. Design-derived files are written by the import step. */
export function scaffoldProject(manifest: ProjectManifest, theme: ProjectTheme): ScaffoldFile[] {
  return [
    { path: 'package.json', content: packageJson(manifest, theme) },
    { path: 'nuxt.config.ts', content: nuxtConfig(manifest) },
    { path: 'tsconfig.json', content: TSCONFIG },
    { path: 'app/app.vue', content: APP_VUE },
    { path: 'app/pages/index.vue', content: INDEX_VUE },
    { path: 'app/assets/css/main.css', content: MAIN_CSS },
    { path: 'app/composables/useCollection.ts', content: USE_COLLECTION },
    { path: 'server/utils/collections.ts', content: COLLECTIONS_UTIL },
    { path: 'server/api/collections/[name].get.ts', content: COLLECTION_ROUTE },
    { path: 'scripts/seed.mjs', content: seedScript(manifest) },
    { path: 'data/.gitkeep', content: '' },
    { path: '.env.example', content: envExample(manifest) },
    { path: 'public/robots.txt', content: 'User-agent: *\nAllow: /\n' },
    { path: '.gitignore', content: GITIGNORE },
    { path: '.gitattributes', content: GITATTRIBUTES },
    { path: '.github/workflows/ci.yml', content: CI_WORKFLOW },
    { path: '.github/dependabot.yml', content: DEPENDABOT },
    { path: 'README.md', content: readme(manifest) },
    { path: 'AGENTS.md', content: AGENTS_MD },
  ]
}
