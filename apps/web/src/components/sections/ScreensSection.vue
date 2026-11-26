<script setup lang="ts">
import type { DesignSummary } from '@fig2nuxt/core'
import { urls } from '../../api.ts'
import FramePreview from '../FramePreview.vue'

defineProps<{ slug: string; summary: DesignSummary }>()
</script>

<template>
  <section id="screens" class="section">
    <header class="section__head">
      <h2 class="section__title">Screens<sup>{{ summary.screens.length }}</sup></h2>
      <p class="muted head__note">Reference renders drawn from the .fig file — the target the Nuxt build is compared against.</p>
    </header>
    <p v-if="!summary.screens.length" class="empty">No screen-sized frame was found in this design.</p>
    <ol class="screens">
      <li v-for="screen in summary.screens" :key="screen.name" class="screen">
        <header class="screen__head">
          <h3 class="screen__name">{{ screen.name }}</h3>
          <code class="chip">{{ screen.route }}</code>
        </header>
        <div class="screen__variants">
          <figure v-for="variant in screen.variants" :key="variant.nodeId" class="variant" :class="`variant--${variant.breakpoint}`">
            <FramePreview
              :src="urls.render(slug, variant.nodeId)"
              :title="`${screen.name}, ${variant.breakpoint}`"
              :width="variant.width"
              :ratio="variant.breakpoint === 'mobile' ? 9 / 16 : 16 / 10"
            />
            <figcaption class="variant__caption mono muted">
              <span>{{ variant.breakpoint }} · {{ variant.width }}×{{ Math.round(variant.height) }}</span>
              <a :href="urls.render(slug, variant.nodeId)" target="_blank" rel="noopener">Full render ↗</a>
            </figcaption>
          </figure>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.head__note {
  max-width: 34ch;
  font-size: 13px;
  text-align: right;
}

.screens {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 460px), 1fr));
  gap: 2rem 1.5rem;
}

.screen__head {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.screen__name {
  font-size: 1.1rem;
  font-weight: 500;
  letter-spacing: -0.02em;
}

.screen__variants {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 1rem;
}

.variant {
  flex: 1 1 300px;
  min-width: 0;
}

.variant--mobile {
  flex: 0 1 110px;
}

.variant--tablet {
  flex: 0 1 190px;
}

.variant__caption {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 0.6rem;
}

.variant__caption a:hover {
  color: var(--text);
}
</style>
