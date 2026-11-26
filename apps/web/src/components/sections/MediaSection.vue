<script setup lang="ts">
import type { MediaFile } from '@fig2nuxt/core'
import { computed } from 'vue'
import { urls } from '../../api.ts'
import { formatBytes } from '../../format.ts'

const props = defineProps<{ slug: string; media: MediaFile[] }>()
const total = computed(() => props.media.reduce((sum, file) => sum + file.size, 0))
</script>

<template>
  <section id="media" class="section">
    <header class="section__head">
      <h2 class="section__title">Media<sup>{{ media.length }}</sup></h2>
      <p class="mono muted">media/ · {{ formatBytes(total) }}</p>
    </header>
    <p v-if="!media.length" class="empty">This design embeds no image, video or audio.</p>
    <ul class="media">
      <li v-for="file in media" :key="file.hash" class="media__item">
        <a :href="urls.media(slug, file.path)" target="_blank" rel="noopener" class="media__visual">
          <img v-if="file.kind === 'images'" :src="urls.media(slug, file.path)" :alt="file.path" loading="lazy" />
          <video v-else-if="file.kind === 'videos'" :src="urls.media(slug, file.path)" muted loop playsinline preload="metadata" />
          <span v-else class="media__audio mono">♪ audio</span>
        </a>
        <p class="mono media__path">{{ file.path }}</p>
        <p class="mono muted">{{ file.mime }} · {{ formatBytes(file.size) }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.media {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1.5rem 1rem;
}

.media__visual {
  display: grid;
  overflow: hidden;
  aspect-ratio: 4 / 3;
  margin-bottom: 0.6rem;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: repeating-conic-gradient(#1c1c1f 0% 25%, #141416 0% 50%) 50% / 16px 16px;
}

.media__visual img,
.media__visual video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transition: transform 0.6s var(--ease);
}

.media__item:hover img {
  transform: scale(1.04);
}

.media__path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
