<script setup lang="ts">
import type { ProjectManifest, SetDiff } from '@fig2nuxt/core'
import { computed, onMounted, ref, watch } from 'vue'
import { api, urls } from '../../api.ts'
import { useAsync } from '../../composables/useAsync.ts'
import FramePreview from '../FramePreview.vue'

const props = defineProps<{ slug: string; manifest: ProjectManifest; latestVersion: number }>()

const from = ref(props.manifest.implementedVersion)
const to = ref(props.latestVersion)
const { data: result, error, loading, reload } = useAsync(() => api.getDiff(props.slug, from.value, to.value))

const versions = computed(() => props.manifest.versions.map((entry) => entry.version))
const tokenChanges = computed(() =>
  Object.entries(result.value?.diff.tokens ?? {})
    .map(([name, set]) => ({ name, ...(set as SetDiff<string>) }))
    .filter((set) => set.added.length || set.removed.length),
)

onMounted(reload)
watch([from, to], reload)
// A new import or a "mark as implemented" moves the default range.
watch(
  () => [props.manifest.implementedVersion, props.latestVersion] as const,
  ([implemented, latest]) => {
    from.value = implemented
    to.value = latest
    void reload()
  },
)

const MAX_VALUE_LENGTH = 140

function describe(value: unknown): { text: string; colors: string[] } {
  if (value === undefined) return { text: '—', colors: [] }
  const raw = typeof value === 'string' ? value : JSON.stringify(value)
  const text = raw.length > MAX_VALUE_LENGTH ? `${raw.slice(0, MAX_VALUE_LENGTH)}…` : raw
  return { text, colors: [...new Set(raw.match(/#[0-9a-f]{6}\b/gi) ?? [])].slice(0, 4) }
}
</script>

<template>
  <section id="diff" class="section">
    <header class="section__head">
      <h2 class="section__title">Design diff</h2>
      <div class="range mono">
        <label>
          <span class="muted">from</span>
          <select v-model.number="from" class="range__select">
            <option :value="0">nothing</option>
            <option v-for="version in versions" :key="version" :value="version">v{{ version }}</option>
          </select>
        </label>
        <span aria-hidden="true">→</span>
        <label>
          <span class="muted">to</span>
          <select v-model.number="to" class="range__select">
            <option v-for="version in versions" :key="version" :value="version">v{{ version }}</option>
          </select>
        </label>
      </div>
    </header>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="loading && !result" class="empty">Computing the diff…</p>
    <template v-else-if="result">
      <p v-if="result.diff.identical" class="empty">
        Design v{{ result.to }} is fully implemented: nothing changed since v{{ result.from }}.
      </p>
      <template v-else>
        <dl class="stats">
          <div><dt class="eyebrow">Frames touched</dt><dd class="display">{{ result.diff.stats.frames }}</dd></div>
          <div><dt class="eyebrow">Added</dt><dd class="display stats--added">+{{ result.diff.stats.added }}</dd></div>
          <div><dt class="eyebrow">Removed</dt><dd class="display stats--removed">−{{ result.diff.stats.removed }}</dd></div>
          <div><dt class="eyebrow">Changed</dt><dd class="display stats--changed">~{{ result.diff.stats.changed + result.diff.stats.moved }}</dd></div>
        </dl>

        <ul v-if="tokenChanges.length" class="tokens">
          <li v-for="set in tokenChanges" :key="set.name" class="tokens__row">
            <span class="eyebrow">{{ set.name }}</span>
            <span class="tokens__values">
              <span v-for="value in set.added" :key="`+${value}`" class="chip chip--added">
                <i v-if="value.startsWith('#')" class="dot" :style="{ background: value }" />+ {{ value }}
              </span>
              <span v-for="value in set.removed" :key="`-${value}`" class="chip chip--removed">
                <i v-if="value.startsWith('#')" class="dot" :style="{ background: value }" />− {{ value }}
              </span>
            </span>
          </li>
        </ul>

        <details v-for="frame in result.diff.frames" :key="frame.frameId" class="frame">
          <summary class="frame__head">
            <span class="chip" :class="`chip--${frame.status}`">{{ frame.status }}</span>
            <strong class="frame__name">{{ frame.frame }}</strong>
            <span class="mono muted">{{ frame.page }} · {{ frame.layers.length }} change{{ frame.layers.length > 1 ? 's' : '' }}</span>
          </summary>

          <div class="compare">
            <figure v-if="frame.status !== 'added' && result.from > 0">
              <figcaption class="eyebrow">Before · v{{ result.from }}</figcaption>
              <FramePreview :src="urls.render(slug, frame.frameId, result.from)" :title="`${frame.frame} before`" :width="frame.width" />
            </figure>
            <figure v-if="frame.status !== 'removed'">
              <figcaption class="eyebrow">After · v{{ result.to }}</figcaption>
              <FramePreview :src="urls.render(slug, frame.frameId, result.to)" :title="`${frame.frame} after`" :width="frame.width" />
            </figure>
          </div>

          <ul class="layers">
            <li v-for="layer in frame.layers" :key="layer.id + layer.kind" class="layer">
              <div class="layer__head">
                <span class="chip" :class="`chip--${layer.kind}`">{{ layer.kind }}</span>
                <span class="layer__path">{{ layer.path }}</span>
                <span class="mono muted">{{ layer.type }} · {{ layer.id }}<template v-if="layer.descendants"> · {{ layer.descendants }} layers inside</template></span>
              </div>
              <table v-if="layer.changes?.length" class="table changes">
                <tbody>
                  <tr v-for="change in layer.changes" :key="change.property">
                    <td class="mono changes__property">{{ change.property }}</td>
                    <td class="mono changes__before">
                      <i v-for="color in describe(change.before).colors" :key="color" class="dot" :style="{ background: color }" />{{ describe(change.before).text }}
                    </td>
                    <td class="mono changes__after">
                      <i v-for="color in describe(change.after).colors" :key="color" class="dot" :style="{ background: color }" />{{ describe(change.after).text }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </li>
          </ul>
        </details>
      </template>
    </template>
  </section>
</template>

<style scoped>
.range {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.range label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.range__select {
  height: 36px;
  padding-inline: 0.75rem;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  background: var(--bg);
}

.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.stats dd {
  font-size: 2.25rem;
}

.stats--added {
  color: var(--added);
}

.stats--removed {
  color: var(--removed);
}

.stats--changed {
  color: var(--changed);
}

.tokens {
  display: grid;
  gap: 0.75rem;
  margin-bottom: 2rem;
  padding: 1.25rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.tokens__row {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 1rem;
  align-items: baseline;
}

.tokens__values {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: 0.35rem;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  vertical-align: -1px;
}

.frame {
  border-top: 1px solid var(--line);
}

.frame:last-of-type {
  border-bottom: 1px solid var(--line);
}

.frame__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1rem;
  padding-block: 1.1rem;
  cursor: pointer;
  list-style: none;
}

.frame__head::-webkit-details-marker {
  display: none;
}

.frame__name {
  font-size: 1.25rem;
  font-weight: 500;
}

.compare {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.compare figcaption {
  margin-bottom: 0.5rem;
}

.layers {
  display: grid;
  gap: 0.75rem;
  padding-bottom: 1.5rem;
}

.layer {
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
}

.layer__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.9rem;
}

.layer__path {
  font-weight: 500;
}

.changes {
  margin-top: 0.75rem;
  table-layout: fixed;
}

.changes td {
  overflow-wrap: anywhere;
}

.changes tr:last-child td {
  border-bottom: 0;
}

.changes__property {
  width: 22%;
  color: var(--muted);
}

.changes__before {
  color: var(--removed);
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, var(--removed) 50%, transparent);
}

.changes__after {
  color: var(--added);
}
</style>
