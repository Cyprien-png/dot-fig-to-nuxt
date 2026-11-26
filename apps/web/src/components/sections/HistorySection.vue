<script setup lang="ts">
import type { RepositoryStatus } from '@fig2nuxt/core'
import { onMounted, watch } from 'vue'
import { api } from '../../api.ts'
import { useAsync } from '../../composables/useAsync.ts'
import { formatDate } from '../../format.ts'

const props = defineProps<{ slug: string; git: RepositoryStatus; directory: string; revision: number }>()
const { data: commits, error, reload } = useAsync(() => api.getCommits(props.slug))

onMounted(reload)
watch(() => props.revision, reload)

const tagKind = (tag: string) => (tag.startsWith('design-') ? 'chip--accent' : tag.startsWith('implemented-') ? 'chip--added' : '')
</script>

<template>
  <section id="history" class="section">
    <header class="section__head">
      <h2 class="section__title">Repository<sup>{{ commits?.length ?? 0 }}</sup></h2>
      <div class="repo mono muted">
        <span>{{ directory }}</span>
        <span>
          {{ git.branch }} · {{ git.clean ? 'clean' : `${git.changes.length} uncommitted change${git.changes.length > 1 ? 's' : ''}` }}
          · {{ git.remote ?? 'no remote' }}
        </span>
      </div>
    </header>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <ol class="commits">
      <li v-for="commit in commits" :key="commit.hash" class="commit">
        <code class="mono muted">{{ commit.hash.slice(0, 7) }}</code>
        <span class="commit__message">
          {{ commit.message }}
          <span v-for="tag in commit.tags" :key="tag" class="chip" :class="tagKind(tag)">{{ tag }}</span>
        </span>
        <span class="mono muted commit__date">{{ commit.author }} · {{ formatDate(commit.date) }}</span>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.repo {
  display: grid;
  gap: 0.2rem;
  text-align: right;
  overflow-wrap: anywhere;
}

.commit {
  display: grid;
  grid-template-columns: 8ch 1fr auto;
  gap: 1rem;
  align-items: baseline;
  padding-block: 0.85rem;
  border-top: 1px solid var(--line);
}

.commit__message {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

@media (width < 720px) {
  .commit {
    grid-template-columns: 8ch 1fr;
  }

  .commit__date {
    grid-column: 2;
  }
}
</style>
