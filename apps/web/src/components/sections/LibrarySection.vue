<script setup lang="ts">
import type { DesignSummary, IconUsage } from '@fig2nuxt/core'
import { urls } from '../../api.ts'

const props = defineProps<{ slug: string; summary: DesignSummary }>()

const CONFIDENCE = {
  variants: 'Identified by its variant set',
  name: 'Identified by component names',
  font: 'Identified by its icon font',
} as const

/** Library icons are drawn from the public Iconify API, custom ones from the project's media. */
function iconSource(icon: IconUsage): string {
  if (icon.file) return urls.media(props.slug, icon.file)
  const [prefix, name] = (icon.iconify ?? '').split(':')
  return `https://api.iconify.design/${prefix}/${name}.svg?color=%230c0c0d`
}
</script>

<template>
  <section id="library" class="section">
    <header class="section__head">
      <h2 class="section__title">Components &amp; icons<sup>{{ summary.components.length + summary.icons.length }}</sup></h2>
    </header>

    <h3 class="eyebrow block-title">Icon libraries</h3>
    <p v-if="!summary.iconLibraries.length" class="empty">No known icon library detected: every icon was exported as SVG.</p>
    <ul class="libraries">
      <li v-for="library in summary.iconLibraries" :key="library.id" class="library card">
        <div>
          <h4 class="library__name">{{ library.name }}</h4>
          <p class="muted">{{ CONFIDENCE[library.confidence] }}</p>
        </div>
        <dl class="library__facts mono">
          <div><dt class="muted">Iconify prefix</dt><dd>{{ library.prefix }}</dd></div>
          <div><dt class="muted">Package</dt><dd>{{ library.package }}</dd></div>
          <div><dt class="muted">Used on pages</dt><dd>{{ library.icons }}</dd></div>
          <div><dt class="muted">Embedded in file</dt><dd>{{ library.definitions }}</dd></div>
        </dl>
      </li>
    </ul>

    <template v-if="summary.icons.length">
      <h3 class="eyebrow block-title">Icons &amp; vectors</h3>
      <ul class="icons">
        <li v-for="icon in summary.icons" :key="icon.iconify ?? icon.file" class="icon" :title="icon.iconify ?? icon.file">
          <span class="icon__art"><img :src="iconSource(icon)" :alt="icon.name" loading="lazy" /></span>
          <span class="icon__name mono">{{ icon.iconify ?? icon.name }}</span>
          <span class="mono muted">×{{ icon.usage }}</span>
        </li>
      </ul>
    </template>

    <template v-if="summary.components.length">
      <h3 class="eyebrow block-title">Figma components in use</h3>
      <div class="scroll-x">
        <table class="table">
          <thead>
            <tr><th>Component</th><th>Instances</th><th>Size</th><th>Variants</th><th>Properties</th></tr>
          </thead>
          <tbody>
            <tr v-for="component in summary.components" :key="component.id">
              <td><strong>{{ component.name }}</strong></td>
              <td class="mono">{{ component.instances }}</td>
              <td class="mono muted">{{ Math.round(component.width) }}×{{ Math.round(component.height) }}</td>
              <td class="muted">{{ component.variants.join(' · ') || '—' }}</td>
              <td class="muted">{{ component.properties.join(' · ') || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

<style scoped>
.block-title {
  margin: 2.5rem 0 1rem;
}

.block-title:first-of-type {
  margin-top: 0;
}

.libraries {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr));
  gap: 1rem;
}

.library {
  display: grid;
  gap: 1.25rem;
  padding: 1.5rem;
}

.library__name {
  font-family: var(--serif);
  font-size: 2rem;
  font-weight: 400;
}

.library__facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem 1.5rem;
}

.icons {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 1px;
}

.icon {
  display: grid;
  gap: 0.4rem;
  justify-items: center;
  padding: 1.25rem 0.75rem;
  outline: 1px solid var(--line);
  text-align: center;
}

.icon__art {
  display: grid;
  width: 56px;
  height: 56px;
  place-items: center;
  /* Exported artwork keeps its design colours, often dark: show it on a light chip. */
  border-radius: 10px;
  background: #e9e7e2;
}

.icon__art img {
  max-width: 36px;
  max-height: 36px;
}

.icon__name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
