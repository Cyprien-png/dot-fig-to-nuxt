<script setup lang="ts">
import type { BuildJob, Preview } from '@fig2nuxt/core'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { api } from '../../api.ts'
import FramePreview from '../FramePreview.vue'

const props = defineProps<{ slug: string; initialBuild?: BuildJob; initialPreview?: Preview; desktopWidth: number }>()

const build = ref<BuildJob | undefined>(props.initialBuild)
const preview = ref<Preview | undefined>(props.initialPreview)
const error = ref('')
const log = ref<HTMLElement>()
const running = computed(() => build.value?.status === 'running')
/** Bumped after each successful build so the preview iframe reloads the new output. */
const revision = ref(0)

const POLL_INTERVAL = 1200
let timer: ReturnType<typeof setTimeout> | undefined

async function guard(action: () => Promise<void>) {
  error.value = ''
  try {
    await action()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

async function poll() {
  build.value = (await api.getBuild(props.slug)) ?? undefined
  if (running.value) timer = setTimeout(poll, POLL_INTERVAL)
  else if (build.value?.status === 'succeeded') {
    revision.value += 1
    await openPreview()
  }
}

const startBuild = () =>
  guard(async () => {
    build.value = await api.startBuild(props.slug)
    clearTimeout(timer)
    timer = setTimeout(poll, POLL_INTERVAL)
  })
const openPreview = () => guard(async () => void (preview.value = await api.startPreview(props.slug)))
const closePreview = () =>
  guard(async () => {
    await api.stopPreview(props.slug)
    preview.value = undefined
  })

// Keep the console pinned to the latest output while a build streams in.
watch(
  () => build.value?.log.length,
  async () => {
    await nextTick()
    if (log.value) log.value.scrollTop = log.value.scrollHeight
  },
)
onMounted(() => running.value && poll())
onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <section id="build" class="section">
    <header class="section__head">
      <h2 class="section__title">Build &amp; preview</h2>
      <div class="actions">
        <button type="button" class="btn btn--accent" :disabled="running" @click="startBuild">{{ running ? `Building · ${build?.step}…` : 'Build static site' }}</button>
        <button v-if="!preview" type="button" class="btn" :disabled="running" @click="openPreview">Start preview</button>
        <template v-else>
          <a class="btn" :href="preview.url" target="_blank" rel="noopener">{{ preview.url.replace('http://', '') }} ↗</a>
          <button type="button" class="btn" @click="closePreview">Stop preview</button>
        </template>
      </div>
    </header>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <div class="panes">
      <div class="console">
        <header class="console__head mono">
          <span>npm install → nuxt generate</span>
          <span v-if="build" class="chip" :class="{ 'chip--added': build.status === 'succeeded', 'chip--removed': build.status === 'failed', 'chip--changed': running }">{{ build.status }}</span>
        </header>
        <pre ref="log" class="console__log mono" tabindex="0">{{ build ? build.log.join('\n') : 'No build yet. The site is generated into .output/public — plain static files for any host.' }}</pre>
      </div>
      <FramePreview v-if="preview" :key="revision" :src="preview.url" title="Preview of the generated site" :width="desktopWidth" :sandboxed="false" />
      <div v-else class="empty placeholder">Build the project, then start the preview to browse the generated site here.</div>
    </div>
  </section>
</template>

<style scoped>
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.6rem;
}

.panes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 480px), 1fr));
  gap: 1rem;
  align-items: start;
  margin-top: 1rem;
}

.console {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: #08080a;
}

.console__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--line);
  color: var(--muted);
}

.console__log {
  height: 300px;
  margin: 0;
  padding: 1rem;
  overflow: auto;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: #c9c7c1;
}

.placeholder {
  display: grid;
  min-height: 200px;
  place-items: center;
}
</style>
