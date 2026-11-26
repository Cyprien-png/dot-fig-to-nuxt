<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { api, urls } from '../api.ts'
import AppDialog from '../components/AppDialog.vue'
import FigUploadDialog from '../components/FigUploadDialog.vue'
import FramePreview from '../components/FramePreview.vue'
import BuildSection from '../components/sections/BuildSection.vue'
import CollectionsSection from '../components/sections/CollectionsSection.vue'
import DiffSection from '../components/sections/DiffSection.vue'
import HistorySection from '../components/sections/HistorySection.vue'
import LibrarySection from '../components/sections/LibrarySection.vue'
import MediaSection from '../components/sections/MediaSection.vue'
import PaletteSection from '../components/sections/PaletteSection.vue'
import ScreensSection from '../components/sections/ScreensSection.vue'
import TypographySection from '../components/sections/TypographySection.vue'
import { useAsync } from '../composables/useAsync.ts'
import { formatDate, pad } from '../format.ts'

const props = defineProps<{ slug: string }>()
const router = useRouter()

const { data: project, error, reload } = useAsync(() => api.getProject(props.slug))
const importing = ref(false)
const deleting = ref(false)
const confirmation = ref('')
const actionError = ref('')
/** Bumped whenever the repository changed, so dependent sections refetch. */
const revision = ref(0)

const NAV = [
  ['screens', 'Screens'],
  ['palette', 'Palette'],
  ['typography', 'Typography'],
  ['library', 'Components & icons'],
  ['media', 'Media'],
  ['collections', 'Collections'],
  ['diff', 'Diff'],
  ['build', 'Build'],
  ['history', 'Repository'],
] as const

const desktopWidth = computed(() => project.value?.summary.breakpoints.desktop?.[0] ?? project.value?.cover?.width ?? 1440)
const facts = computed(() => {
  const stats = project.value?.summary.stats
  if (!project.value || !stats) return []
  return [
    ['Design version', `v${project.value.latestVersion}`],
    ['Implemented', project.value.manifest.implementedVersion ? `v${project.value.manifest.implementedVersion}` : '—'],
    ['Screens', pad(stats.screens)],
    ['Layers', stats.layers.toLocaleString('en')],
    ['Components', pad(stats.components)],
    ['Media', pad(stats.media)],
  ]
})

onMounted(reload)
watch(() => props.slug, reload)

async function refresh() {
  await reload()
  revision.value += 1
}

async function importDesign(file: File) {
  await api.importDesign(props.slug, file)
  await refresh()
  await router.replace({ hash: '#diff' })
}

async function run(action: () => Promise<unknown>) {
  actionError.value = ''
  try {
    await action()
    await refresh()
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : String(cause)
  }
}

const markImplemented = () => run(() => api.markImplemented(props.slug))

async function remove() {
  await api.deleteProject(props.slug)
  await router.push({ name: 'home' })
}
</script>

<template>
  <main class="container project">
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="!project" class="empty">Loading project…</p>

    <template v-else>
      <section class="hero">
        <div class="hero__info">
          <div class="hero__top">
            <p class="eyebrow">
              <RouterLink to="/">Projects</RouterLink> / {{ project.manifest.slug }} · created {{ formatDate(project.manifest.createdAt) }}
            </p>
            <div class="hero__actions">
              <button type="button" class="btn" @click="importing = true">Import new .fig version</button>
              <button v-if="project.pending" type="button" class="btn btn--accent" @click="markImplemented">Mark v{{ project.latestVersion }} as implemented</button>
            </div>
          </div>

          <h1 class="display hero__title">{{ project.manifest.name }}</h1>
          <p v-if="project.pending" class="hero__status">
            <span class="chip chip--accent">Pending</span>
            Design v{{ project.latestVersion }} is imported but the code implements
            {{ project.manifest.implementedVersion ? `v${project.manifest.implementedVersion}` : 'nothing yet' }}.
            <a href="#diff" class="hero__link">See the delta ↓</a>
          </p>
          <p v-if="actionError" class="error" role="alert">{{ actionError }}</p>

          <dl class="facts">
            <div v-for="[label, value] in facts" :key="label">
              <dt class="eyebrow">{{ label }}</dt>
              <dd class="facts__value">{{ value }}</dd>
            </div>
          </dl>
        </div>

        <div class="hero__visual">
          <FramePreview
            v-if="project.cover"
            :key="project.latestVersion"
            :src="urls.render(slug, project.cover.nodeId)"
            :title="`${project.manifest.name}, reference render`"
            :width="project.cover.width"
          />
          <img v-else-if="project.hasThumbnail" :src="urls.thumbnail(slug, project.latestVersion)" :alt="`Thumbnail of ${project.manifest.name}`" />
          <ul class="hero__palette" aria-hidden="true">
            <li v-for="color in project.colors" :key="color" :style="{ background: color }" />
          </ul>
        </div>
      </section>

      <nav class="nav" aria-label="Sections">
        <a v-for="[id, label] in NAV" :key="id" :href="`#${id}`" class="nav__link">{{ label }}</a>
      </nav>

      <ScreensSection :slug="slug" :summary="project.summary" />
      <PaletteSection :colors="project.summary.colors" />
      <TypographySection :summary="project.summary" />
      <LibrarySection :slug="slug" :summary="project.summary" />
      <MediaSection :slug="slug" :media="project.summary.media" />
      <CollectionsSection :slug="slug" :version="project.latestVersion" />
      <DiffSection :slug="slug" :manifest="project.manifest" :latest-version="project.latestVersion" />
      <BuildSection :slug="slug" :initial-build="project.build" :initial-preview="project.preview" :desktop-width="desktopWidth" />
      <HistorySection :slug="slug" :git="project.git" :directory="project.directory" :revision="revision" />

      <section class="section danger">
        <div>
          <h2 class="danger__title">Delete this project</h2>
          <p class="muted">Removes the folder and its git repository from this machine. Commits that were not pushed are lost.</p>
        </div>
        <button type="button" class="btn btn--danger" @click="deleting = true">Delete project…</button>
      </section>

      <FigUploadDialog :open="importing" :title="`Import design v${project.latestVersion + 1}`" submit-label="Import version" :submit="importDesign" @close="importing = false">
        <p class="muted note">The file is committed and tagged, tokens, media and collections are regenerated, and the diff against the implemented version shows exactly what to change in the code.</p>
      </FigUploadDialog>

      <AppDialog :open="deleting" title="Delete project" @close="deleting = false">
        <form class="confirm" @submit.prevent="run(remove)">
          <label class="confirm__field">
            <span class="muted">Type <strong>{{ project.manifest.slug }}</strong> to confirm.</span>
            <input v-model="confirmation" class="confirm__input" type="text" autocomplete="off" />
          </label>
          <p v-if="actionError" class="error" role="alert">{{ actionError }}</p>
          <div class="confirm__actions">
            <button type="button" class="btn" @click="deleting = false">Cancel</button>
            <button type="submit" class="btn btn--danger" :disabled="confirmation !== project.manifest.slug">Delete permanently</button>
          </div>
        </form>
      </AppDialog>
    </template>
  </main>
</template>

<style scoped>
.project {
  padding-bottom: 3rem;
}

.hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
  gap: 2rem 3rem;
  align-items: center;
  padding-block: 1.5rem 2rem;
}

.hero__info {
  display: grid;
  gap: 1.25rem;
  min-width: 0;
}

@media (width < 960px) {
  .hero {
    grid-template-columns: minmax(0, 1fr);
  }
}

.hero__top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.hero__top a:hover {
  color: var(--text);
}

.hero__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.hero__title {
  font-size: clamp(2.25rem, 4.6vw, 4.25rem);
  overflow-wrap: anywhere;
}

.hero__status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
}

.hero__link {
  color: var(--accent);
}

.facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 1rem 1.5rem;
  padding-block: 1rem;
  border-block: 1px solid var(--line);
}

.facts__value {
  margin-top: 0.3rem;
  font-size: 1.25rem;
  font-weight: 500;
  letter-spacing: -0.02em;
}

.hero__visual {
  display: grid;
  gap: 0.75rem;
  animation: reveal 0.9s var(--ease) backwards;
}

.hero__visual img {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.hero__palette {
  display: flex;
  height: 10px;
  overflow: hidden;
  border-radius: 999px;
}

.hero__palette li {
  flex: 1;
}

.nav {
  position: sticky;
  top: 60px;
  z-index: 10;
  display: flex;
  gap: 0.25rem;
  margin-inline: calc(var(--gutter) * -1);
  padding: 0.6rem var(--gutter);
  overflow-x: auto;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(14px);
}

.nav__link {
  padding: 0.4rem 0.9rem;
  border-radius: 999px;
  font-size: 13px;
  white-space: nowrap;
  color: var(--muted);
  transition:
    background 0.2s var(--ease),
    color 0.2s var(--ease);
}

.nav__link:hover {
  background: var(--surface-raised);
  color: var(--text);
}

.danger {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
}

.danger__title {
  font-size: 1.25rem;
  font-weight: 500;
}

.note {
  font-size: 13px;
}

.confirm,
.confirm__field {
  display: grid;
  gap: 1rem;
}

.confirm__input {
  height: 46px;
  padding-inline: 1rem;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: var(--bg);
}

.confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}

@keyframes reveal {
  from {
    opacity: 0;
    transform: translateY(32px);
  }
}
</style>
