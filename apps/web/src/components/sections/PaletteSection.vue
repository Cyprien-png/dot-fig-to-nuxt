<script setup lang="ts">
import type { ColorToken } from '@fig2nuxt/core'
import { ref } from 'vue'
import { isLight } from '../../format.ts'

defineProps<{ colors: ColorToken[] }>()
const copied = ref('')

async function copy(color: ColorToken) {
  await navigator.clipboard.writeText(`var(--${color.token})`)
  copied.value = color.token
  setTimeout(() => copied.value === color.token && (copied.value = ''), 1400)
}
</script>

<template>
  <section id="palette" class="section">
    <header class="section__head">
      <h2 class="section__title">Palette<sup>{{ colors.length }}</sup></h2>
      <p class="muted head__note">Named after Figma styles and variables when they exist. Click a swatch to copy its CSS variable.</p>
    </header>
    <p v-if="!colors.length" class="empty">No solid colour found.</p>
    <ul class="swatches">
      <li v-for="color in colors" :key="color.token">
        <button type="button" class="swatch" :class="{ 'swatch--light': isLight(color.value) }" :style="{ background: color.value }" @click="copy(color)">
          <span class="swatch__usage mono">×{{ color.usage }}</span>
          <span class="swatch__body">
            <strong class="swatch__name">{{ copied === color.token ? 'Copied' : (color.name ?? color.value) }}</strong>
            <span class="mono">{{ color.value }}</span>
            <span class="mono swatch__token">--{{ color.token }}</span>
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.head__note {
  max-width: 38ch;
  font-size: 13px;
  text-align: right;
}

.swatches {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  overflow: hidden;
  border-radius: var(--radius);
}

.swatch {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  width: 100%;
  height: 190px;
  padding: 0.9rem;
  border: 0;
  color: #fff;
  text-align: left;
  cursor: pointer;
  transition: filter 0.2s var(--ease);
}

.swatch--light {
  color: #0c0c0d;
}

.swatch:hover {
  filter: brightness(1.08) saturate(1.05);
}

.swatch__usage {
  align-self: flex-end;
  opacity: 0.7;
}

.swatch__body {
  display: grid;
  gap: 0.1rem;
  min-width: 0;
}

.swatch__name,
.swatch__token {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.swatch__token {
  opacity: 0.7;
}
</style>
