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
      <div class="hero__intro">
        <p class="eyebrow">Figma file in · static Nuxt site out</p>
        <h1 class="display hero__title">Every design,<br /><em>shipped as code.</em></h1>
      </div>
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
  padding-bottom: 3rem;
}

.hero {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1.5rem 3rem;
  margin-bottom: 2rem;
  padding-block: clamp(1.5rem, 3vw, 2.5rem) 1.5rem;
  border-bottom: 1px solid var(--line);
}

.hero__intro {
  display: grid;
  gap: 0.75rem;
}

.hero__title {
  font-size: clamp(2.25rem, 4.6vw, 4.25rem);
}

.hero__title em {
  color: var(--accent);
}

.hero__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 1.5rem 3rem;
}

.hero__stats {
  display: flex;
  gap: clamp(1.5rem, 3vw, 3rem);
}

.hero__stats dd {
  font-size: 2.25rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
  gap: 2rem 1.5rem;
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
