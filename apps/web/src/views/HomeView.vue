<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { api } from '../api.ts'
import FigUploadDialog from '../components/FigUploadDialog.vue'
import ProjectTile from '../components/ProjectTile.vue'
import { useAsync } from '../composables/useAsync.ts'
import { pad } from '../format.ts'

const router = useRouter()
const { data: projects, error, loading, reload } = useAsync(api.listProjects)
const creating = ref(false)
const pending = computed(() => projects.value?.filter((project) => project.pending).length ?? 0)

onMounted(reload)

async function create(file: File, name: string) {
  const created = await api.createProject(name, file)
  await router.push({ name: 'project', params: { slug: created.manifest.slug } })
}
</script>

<template>
  <main class="container home">
    <section class="hero">
      <p class="eyebrow">Figma file in · static Nuxt site out</p>
      <h1 class="display hero__title">Every design,<br /><em>shipped as code.</em></h1>
      <div class="hero__bar">
        <dl class="hero__stats">
          <div>
            <dt class="eyebrow">Projects</dt>
            <dd class="display">{{ pad(projects?.length ?? 0) }}</dd>
          </div>
          <div>
            <dt class="eyebrow">Awaiting implementation</dt>
            <dd class="display">{{ pad(pending) }}</dd>
          </div>
        </dl>
        <button type="button" class="btn btn--accent" @click="creating = true">New project +</button>
      </div>
    </section>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="loading && !projects" class="empty">Loading projects…</p>
    <div v-else-if="projects && !projects.length" class="empty">
      <p>No project yet. Drop a .fig file to create the first one.</p>
    </div>
    <ul v-else class="grid">
      <li v-for="(project, index) in projects" :key="project.manifest.slug" :style="{ '--delay': `${index * 70}ms` }">
        <ProjectTile :project="project" :index="index" />
      </li>
    </ul>

    <FigUploadDialog :open="creating" title="New project" submit-label="Create project" with-name :submit="create" @close="creating = false">
      <p class="muted note">
        Creates a git repository with a Nuxt 4 scaffold, imports the design as version 1 and extracts its palette, fonts, media, icons and collections.
      </p>
    </FigUploadDialog>
  </main>
</template>

<style scoped>
.home {
  padding-bottom: 8rem;
}

.hero {
  display: grid;
  gap: 2rem;
  padding-block: clamp(3rem, 9vw, 8rem) clamp(2rem, 5vw, 4rem);
}

.hero__title {
  font-size: clamp(3.2rem, 11vw, 11rem);
}

.hero__title em {
  color: var(--accent);
}

.hero__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 2rem;
  padding-top: 2rem;
  border-top: 1px solid var(--line);
}

.hero__stats {
  display: flex;
  gap: clamp(2rem, 6vw, 6rem);
}

.hero__stats dd {
  font-size: 3rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 520px), 1fr));
  gap: clamp(2rem, 4vw, 4rem) clamp(1.5rem, 3vw, 3rem);
}

.grid li {
  animation: reveal 0.8s var(--ease) backwards;
  animation-delay: var(--delay);
}

.note {
  font-size: 13px;
}

@keyframes reveal {
  from {
    opacity: 0;
    transform: translateY(28px);
  }
}
</style>
