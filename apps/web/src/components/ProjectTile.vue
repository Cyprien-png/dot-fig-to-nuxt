<script setup lang="ts">
import type { ProjectCard } from '@fig2nuxt/server/api'
import { RouterLink } from 'vue-router'
import { urls } from '../api.ts'
import { formatDate, pad } from '../format.ts'

defineProps<{ project: ProjectCard; index: number }>()
</script>

<template>
  <RouterLink :to="{ name: 'project', params: { slug: project.manifest.slug } }" class="tile">
    <div class="tile__visual">
      <img
        v-if="project.hasThumbnail"
        :src="urls.thumbnail(project.manifest.slug, project.latestVersion)"
        :alt="`Thumbnail of ${project.manifest.name}`"
        loading="lazy"
      />
      <div v-else class="tile__placeholder display" aria-hidden="true">{{ project.manifest.name.slice(0, 2) }}</div>
      <span v-if="project.pending" class="chip chip--accent tile__badge">Design v{{ project.latestVersion }} to implement</span>
      <span class="tile__cta" aria-hidden="true">Open ↗</span>
    </div>

    <ul class="tile__palette" aria-label="Palette">
      <li v-for="color in project.colors" :key="color" :style="{ background: color }" />
    </ul>

    <div class="tile__meta">
      <span class="mono muted">{{ pad(index + 1) }}</span>
      <h2 class="tile__name">{{ project.manifest.name }}</h2>
      <span class="mono muted tile__date">{{ formatDate(project.manifest.createdAt) }}</span>
    </div>
    <p class="mono muted tile__facts">
      v{{ project.latestVersion }} · {{ project.stats?.screens ?? 0 }} screens · {{ project.stats?.layers ?? 0 }} layers
      <template v-if="project.fonts.length"> · {{ project.fonts.slice(0, 2).join(', ') }}</template>
    </p>
  </RouterLink>
</template>

<style scoped>
.tile {
  display: grid;
  gap: 0.7rem;
}

.tile__visual {
  position: relative;
  overflow: hidden;
  aspect-ratio: 16 / 10;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
}

.tile__visual img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.9s var(--ease);
}

.tile:hover .tile__visual img {
  transform: scale(1.045);
}

.tile__placeholder {
  display: grid;
  height: 100%;
  place-items: center;
  font-size: clamp(3rem, 6vw, 4.5rem);
  text-transform: uppercase;
  color: var(--line-strong);
}

.tile__badge {
  position: absolute;
  top: 1rem;
  left: 1rem;
}

.tile__cta {
  position: absolute;
  right: 1rem;
  bottom: 1rem;
  padding: 0.5rem 1rem;
  border-radius: 999px;
  background: var(--text);
  color: var(--bg);
  font-size: 13px;
  font-weight: 500;
  opacity: 0;
  transform: translateY(8px);
  transition:
    opacity 0.35s var(--ease),
    transform 0.35s var(--ease);
}

.tile:hover .tile__cta,
.tile:focus-visible .tile__cta {
  opacity: 1;
  transform: none;
}

.tile__palette {
  display: flex;
  height: 6px;
  overflow: hidden;
  border-radius: 999px;
}

.tile__palette li {
  flex: 1;
}

.tile__meta {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: baseline;
  gap: 0.75rem;
}

.tile__name {
  overflow: hidden;
  font-size: 1.1rem;
  font-weight: 500;
  letter-spacing: -0.02em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile__facts {
  margin-top: -0.5rem;
  padding-left: calc(2ch + 0.75rem);
}
</style>
