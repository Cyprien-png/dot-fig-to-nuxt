<script setup lang="ts">
import type { DesignSummary } from '@fig2nuxt/core'
import { computed, onBeforeUnmount, watchEffect } from 'vue'
import { fontStylesheet } from '../../format.ts'

const props = defineProps<{ summary: DesignSummary }>()
const families = computed(() => props.summary.typography.families)

// Load the design's own fonts so the specimens are drawn in the real typefaces.
const link = document.createElement('link')
link.rel = 'stylesheet'
watchEffect(() => {
  if (!families.value.length) return
  link.href = fontStylesheet(families.value)
  document.head.append(link)
})
onBeforeUnmount(() => link.remove())

const MAX_SPECIMEN_SIZE = 72
</script>

<template>
  <section id="typography" class="section">
    <header class="section__head">
      <h2 class="section__title">Typography<sup>{{ families.length }}</sup></h2>
      <p class="muted head__note">Families and weights are self-hosted by @nuxt/fonts at build time.</p>
    </header>

    <ul class="families">
      <li v-for="family in families" :key="family.family" class="family card">
        <p class="family__specimen" :style="{ fontFamily: `'${family.family}', sans-serif` }">Aa</p>
        <div>
          <h3 class="family__name">{{ family.family }}</h3>
          <p class="mono muted">{{ family.weights.join(' · ') }}<template v-if="family.italic"> · italic</template></p>
          <p class="mono muted">{{ family.usage }} uses</p>
        </div>
      </li>
    </ul>

    <ul class="styles">
      <li v-for="style in summary.typography.styles" :key="style.token" class="style">
        <div class="style__meta mono muted">
          <strong class="style__token">.{{ style.token }}</strong>
          <span>{{ style.fontFamily }} {{ style.fontWeight }}</span>
          <span>{{ style.fontSize }}px / {{ style.lineHeight }} / {{ style.letterSpacing }}</span>
          <span>×{{ style.usage }}</span>
        </div>
        <p
          class="style__sample"
          :style="{
            fontFamily: `'${style.fontFamily}', sans-serif`,
            fontWeight: style.fontWeight,
            fontStyle: style.italic ? 'italic' : 'normal',
            fontSize: `${Math.min(style.fontSize, MAX_SPECIMEN_SIZE)}px`,
            letterSpacing: style.letterSpacing,
          }"
        >
          {{ style.name ?? 'The quick brown fox jumps over the lazy dog' }}
        </p>
      </li>
    </ul>

    <div class="scales">
      <div v-if="summary.radii.length">
        <h3 class="eyebrow">Radii</h3>
        <ul class="scale">
          <li v-for="radius in summary.radii" :key="radius.value" class="scale__item">
            <span class="scale__radius" :style="{ borderTopLeftRadius: `${Math.min(radius.value, 40)}px` }" />
            <span class="mono">{{ radius.value }}</span>
          </li>
        </ul>
      </div>
      <div v-if="summary.spacing.length">
        <h3 class="eyebrow">Spacing</h3>
        <ul class="scale">
          <li v-for="space in summary.spacing" :key="space.value" class="scale__item">
            <span class="scale__space" :style="{ width: `${Math.min(space.value, 96)}px` }" />
            <span class="mono">{{ space.value }}</span>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.head__note {
  max-width: 34ch;
  font-size: 13px;
  text-align: right;
}

.families {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
}

.family {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1.5rem;
}

.family__specimen {
  font-size: 5rem;
  line-height: 1;
}

.family__name {
  font-size: 1.25rem;
  font-weight: 500;
}

.styles {
  margin-top: 3rem;
}

.style {
  display: grid;
  grid-template-columns: minmax(200px, 280px) 1fr;
  gap: 2rem;
  align-items: baseline;
  padding-block: 1.25rem;
  border-top: 1px solid var(--line);
}

.style__meta {
  display: grid;
  gap: 0.15rem;
}

.style__token {
  color: var(--text);
  font-weight: 500;
}

.style__sample {
  overflow: hidden;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scales {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 3rem;
  margin-top: 3rem;
}

.scale {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 1.25rem;
  margin-top: 1rem;
}

.scale__item {
  display: grid;
  gap: 0.4rem;
  justify-items: start;
}

.scale__radius {
  width: 48px;
  height: 48px;
  border-top: 2px solid var(--accent);
  border-left: 2px solid var(--accent);
}

.scale__space {
  height: 12px;
  min-width: 2px;
  background: var(--accent);
}

@media (width < 720px) {
  .style {
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }
}
</style>
