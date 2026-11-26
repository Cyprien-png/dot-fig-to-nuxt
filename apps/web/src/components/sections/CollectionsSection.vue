<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { api, urls } from '../../api.ts'
import { useAsync } from '../../composables/useAsync.ts'

const props = defineProps<{ slug: string; version: number }>()
const { data: collections, error, reload } = useAsync(() => api.getCollections(props.slug))

onMounted(reload)
watch(() => props.version, reload)

const isMedia = (value: string) => value.startsWith('/media/')
const mediaSrc = (value: string) => urls.media(props.slug, value.slice('/media/'.length))
</script>

<template>
  <section id="collections" class="section">
    <header class="section__head">
      <h2 class="section__title">Collections<sup>{{ collections?.length ?? 0 }}</sup></h2>
      <p class="muted head__note">Repeated content, extracted to data/*.json so lists are rendered from data, not hard-coded.</p>
    </header>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="collections && !collections.length" class="empty">No repeated content detected in this design.</p>

    <details v-for="collection in collections" :key="collection.slug" class="collection">
      <summary class="collection__head">
        <strong class="collection__name">{{ collection.name }}</strong>
        <span class="chip">data/{{ collection.slug }}.json</span>
        <span class="mono muted">{{ collection.count }} items · {{ collection.fields.join(', ') }}</span>
        <span v-if="collection.component" class="chip">⬡ {{ collection.component }}</span>
      </summary>
      <div class="scroll-x">
        <table class="table">
          <thead>
            <tr><th v-for="field in collection.fields" :key="field">{{ field }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in collection.items" :key="index">
              <td v-for="field in collection.fields" :key="field">
                <img v-if="item[field] && isMedia(item[field])" :src="mediaSrc(item[field])" :alt="field" class="collection__image" loading="lazy" />
                <template v-else>{{ item[field] ?? '—' }}</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </section>
</template>

<style scoped>
.head__note {
  max-width: 38ch;
  font-size: 13px;
  text-align: right;
}

.collection {
  border-top: 1px solid var(--line);
}

.collection:last-of-type {
  border-bottom: 1px solid var(--line);
}

.collection__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1rem;
  padding-block: 1.1rem;
  cursor: pointer;
  list-style: none;
}

.collection__head::-webkit-details-marker {
  display: none;
}

.collection__head::before {
  content: '+';
  width: 1ch;
  font-family: var(--mono);
  color: var(--accent);
}

.collection[open] > .collection__head::before {
  content: '−';
}

.collection__name {
  font-size: 1.15rem;
  font-weight: 500;
}

.collection__image {
  width: 72px;
  height: 48px;
  border-radius: 6px;
  object-fit: cover;
}

.collection .scroll-x {
  padding-bottom: 1.5rem;
}
</style>
