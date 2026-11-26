<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <header class="topbar">
    <div class="container topbar__inner">
      <RouterLink to="/" class="topbar__brand" aria-label="dot-fig-to-nuxt, all projects">
        <span class="topbar__mark">.fig</span>
        <span aria-hidden="true">→</span>
        <span>nuxt</span>
      </RouterLink>
      <span class="eyebrow">Local workspace</span>
    </div>
  </header>
  <RouterView v-slot="{ Component }">
    <Transition name="page" mode="out-in">
      <component :is="Component" />
    </Transition>
  </RouterView>
</template>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--bg) 82%, transparent);
  backdrop-filter: blur(14px);
}

.topbar__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
}

.topbar__brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.topbar__mark {
  padding: 0.1rem 0.5rem;
  border-radius: 6px;
  background: var(--accent);
  color: var(--accent-ink);
  font-family: var(--mono);
  font-size: 13px;
}

.page-enter-active,
.page-leave-active {
  transition:
    opacity 0.3s var(--ease),
    transform 0.3s var(--ease);
}

.page-enter-from,
.page-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
