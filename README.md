# dot-fig-to-nuxt

Turns a Figma `.fig` file into everything an agent needs to rebuild the design 1:1 as a clean, static Nuxt + TypeScript site — and keeps code and design in sync as the design evolves.

The tool does not generate the pages itself: it decodes the design, extracts tokens, media and data, scaffolds the Nuxt project, computes exactly what changed between two design versions, and exposes all of it through an **MCP server**. An agent (Claude Code or any MCP client) writes the components and pages. A **local dashboard** lets you follow and drive every project.

## Requirements

- Node.js ≥ 22.12 for this tool. Generated projects use Nuxt 4, which asks for the latest Node 22 patch releases or Node 24.
- git

## Quick start

```sh
npm install
npm run build   # builds the dashboard once
npm start       # http://127.0.0.1:4310
```

Create a project by dropping a `.fig` file in the dashboard (Figma: *File → Save local copy*), or let an agent do it through MCP. `npm run dev` runs the API and the dashboard with hot reload (http://127.0.0.1:4311).

## How a project is organised

Each project is **its own git repository** in `projects/<slug>/`, a folder ignored by this repo. Set `FIG2NUXT_PROJECTS_DIR` to store projects elsewhere.

```
projects/<slug>/
├─ fig2nuxt.json          manifest: design versions, implemented version
├─ design/
│  ├─ source.fig          the current Figma file
│  ├─ document.json       the decoded design (diffable)
│  ├─ summary.json        screens, palette, typography, icons, components
│  └─ theme.json          design tokens consumed by nuxt.config.ts
├─ media/                 images, videos, audio and custom icons from the design
├─ data/                  seed records of the content collections (JSON)
├─ app/                   the Nuxt application
├─ server/, scripts/      build-time MongoDB access and the seed script
└─ .github/workflows/     CI building the static site on every push
```

### Design versions and deltas

Every imported `.fig` is committed and tagged `design-vN`. When the code matches a version it is tagged `implemented-vN`. The diff between the implemented version and the latest one is computed structurally, layer by layer (added, removed, moved, changed properties, token changes), so the agent implements only what changed.

Importing a file whose decoded content is identical to the current version is rejected.

## What is extracted

| | |
| --- | --- |
| Screens | top-level frames grouped by page with their breakpoint variants |
| Palette | solid colours, named after Figma styles and variables |
| Typography | font families and weights (self-hosted by `@nuxt/fonts`), text styles, radii, spacing |
| Icons | icon libraries matched to their Iconify set for `@nuxt/icon`; other vectors exported as SVG |
| Components | Figma components, variants, properties and instance counts |
| Media | images embedded in the file, stored once by content hash |
| Collections | repeated instances or lookalike siblings, as MongoDB collections seeded from `data/*.json` |
| Interactions | prototype links and transitions on each layer |

### Collections and MongoDB

Collections are MongoDB collections by default. `data/<name>.json` holds the records found in the design; `npm run db:seed` (in the project) loads them into the database set by `MONGODB_URI` / `MONGODB_DB`, and pages read them with `useCollection('<name>')`. The database is queried while the site is generated and the records are baked into the static pages, so the hosted site needs no database and no server.

Without `MONGODB_URI` the build falls back to the seed files, which keeps CI and a first build working before a database exists.

## MCP server

`.mcp.json` registers the server for Claude Code when it is started in this repo. For another client:

```json
{ "mcpServers": { "fig2nuxt": { "command": "node", "args": ["--import", "tsx", "packages/mcp/src/main.ts"], "cwd": "<path to this repo>" } } }
```

| Area | Tools |
| --- | --- |
| Projects | `list_projects` `create_project` `get_project` `import_design` `mark_implemented` |
| Design | `get_design_summary` `get_frame_outline` `inspect_node` `search_layers` `render_frame` `export_svg` `get_design_diff` |
| Files | `list_files` `read_file` `write_file` `delete_file` (sandboxed to the project) |
| Git | `git_status` `git_diff` `git_commit` `git_log` `git_set_remote` `git_push` (Conventional Commits enforced) |
| Build | `build_project` `get_build` `start_preview` `stop_preview` |

Typical agent loop: `create_project` → `get_design_summary` → per screen `get_frame_outline` / `inspect_node` (exact CSS per layer) → `write_file` → `build_project` → `git_commit` → `mark_implemented`. After a new design version: `import_design` → `get_design_diff` → implement the delta.

## Repository layout

| Package | Role |
| --- | --- |
| `packages/core` | `.fig` decoding, design model, extraction, diff, CSS mapping, project and git services, Nuxt scaffold, build and preview |
| `packages/mcp` | MCP server (stdio) over the core |
| `packages/server` | Local HTTP API (Hono) for the dashboard |
| `apps/web` | Dashboard (Vue 3 + Vite) |

```sh
npm test          # vitest
npm run lint      # eslint
npm run typecheck # tsc + vue-tsc
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org), checked by commitlint.

## Limits

- The `.fig` format is undocumented and may change; decoding is validated on real files but not every node type or effect is covered.
- Reference renders are an HTML/CSS approximation of the design, good for comparison, not a pixel-exact Figma export. Blend modes, complex strokes and some effects are simplified.
- Icon library detection is heuristic (component names and geometry fingerprints against known libraries). Icons without a match are exported as SVG.
- Collections are inferred from repetition; review the generated JSON.
- Prototype interactions are reported as data; turning them into animations is the agent's job.
- A `.fig` file contains only embedded images. Videos and audio have to be added to `media/` by hand.
