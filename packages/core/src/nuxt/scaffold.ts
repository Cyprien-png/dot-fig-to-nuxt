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
  vueRouter: '^5.5.1',
  nuxtFonts: '^1.2.1',
  nuxtIcon: '^2.6.3',
  iconifyJson: '^1.2.0',
  typescript: '~6.0.0',
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
    },
    dependencies: {
      '@nuxt/fonts': VERSIONS.nuxtFonts,
      '@nuxt/icon': VERSIONS.nuxtIcon,
      nuxt: VERSIONS.nuxt,
      vue: VERSIONS.vue,
      'vue-router': VERSIONS.vueRouter,
    },
    devDependencies: {
      ...Object.fromEntries(theme.iconCollections.sort().map((prefix) => [`@iconify-json/${prefix}`, VERSIONS.iconifyJson])),
      typescript: VERSIONS.typescript,
      'vue-tsc': VERSIONS.vueTsc,
    },
  })
}

const nuxtConfig = (manifest: ProjectManifest) => `import { fileURLToPath } from 'node:url'
import theme from './design/theme.json'

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url))

// Statically generated site: \`npm run generate\` prerenders every route to .output/public.
export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  modules: ['@nuxt/fonts', '@nuxt/icon'],
  css: ['~/assets/css/tokens.css', '~/assets/css/main.css'],
  // Content collections extracted from the design: \`import cards from '#data/cards.json'\`.
  alias: { '#data': fromRoot('./data') },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: ${JSON.stringify(manifest.name)},
    },
  },
  // Fonts are resolved from the families used in the design and self-hosted at build time.
  fonts: { families: theme.fonts },
  // Bundle the icons actually used, so the static site needs no icon API at runtime.
  icon: { clientBundle: { scan: true } },
  nitro: {
    prerender: { crawlLinks: true, routes: ['/'] },
    // Design media stay in /media at the project root and are served as /media/*.
    publicAssets: [{ dir: fromRoot('./media'), baseURL: '/media', maxAge: 60 * 60 * 24 * 365 }],
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

\`.output/public\` is plain static files: host it on any static host or CDN.

## Layout

| Path | Content |
| --- | --- |
| \`app/\` | Nuxt source: pages, components, composables, styles |
| \`app/assets/css/tokens.css\` | Design tokens generated from the design (do not edit) |
| \`design/\` | The Figma source and what was extracted from it, one git tag per version |
| \`media/\` | Images, videos, audio and SVG from the design, served at \`/media\` |
| \`data/\` | Content collections extracted from the design, imported as \`#data/*.json\` |
| \`fig2nuxt.json\` | Design versions and which one the code implements |

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
8. **Collections.** Repeated content lives in \`data/*.json\`. Import it with
   \`import items from '#data/<name>.json'\` and render it with \`v-for\`.
9. **Interactions.** Prototype interactions become real behaviour: links are \`<NuxtLink>\`,
   hover and press states are CSS, transitions reuse the design's duration and easing.
10. **Static and accessible.** Everything must prerender with \`npm run generate\`: no
    runtime server code. Use semantic HTML, one \`<h1>\` per page, labelled controls.
11. **Clean code.** TypeScript strict, \`<script setup lang="ts">\`, scoped styles, no dead
    code, no \`any\`. Prefer small composables over duplicated logic.

## Workflow

1. Read the summary, then the outline of each screen.
2. Build shared components first, then pages, screen by screen.
3. Run the build after each screen and compare the result with the reference render.
4. Commit atomically with Conventional Commits (\`feat(home): add hero section\`).
5. When the code matches a design version, mark it implemented.
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
    { path: 'public/robots.txt', content: 'User-agent: *\nAllow: /\n' },
    { path: '.gitignore', content: GITIGNORE },
    { path: '.gitattributes', content: GITATTRIBUTES },
    { path: '.github/workflows/ci.yml', content: CI_WORKFLOW },
    { path: '.github/dependabot.yml', content: DEPENDABOT },
    { path: 'README.md', content: readme(manifest) },
    { path: 'AGENTS.md', content: AGENTS_MD },
  ]
}
