<script setup lang="ts">
import { ref } from 'vue'
import { formatBytes } from '../format.ts'

const file = defineModel<File | null>({ required: true })
const dragging = ref(false)
const input = ref<HTMLInputElement>()

function pick(files: FileList | null | undefined) {
  const candidate = files?.[0]
  if (candidate) file.value = candidate
}

function onDrop(event: DragEvent) {
  dragging.value = false
  pick(event.dataTransfer?.files)
}
</script>

<template>
  <button
    type="button"
    class="dropzone"
    :class="{ 'dropzone--active': dragging, 'dropzone--filled': file }"
    @click="input?.click()"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <input ref="input" type="file" accept=".fig" hidden @change="pick(($event.target as HTMLInputElement).files)" />
    <template v-if="file">
      <strong>{{ file.name }}</strong>
      <span class="mono muted">{{ formatBytes(file.size) }} · click to replace</span>
    </template>
    <template v-else>
      <strong>Drop a .fig file</strong>
      <span class="mono muted">or click to browse · Figma → File → Save local copy</span>
    </template>
  </button>
</template>

<style scoped>
.dropzone {
  display: grid;
  gap: 0.35rem;
  width: 100%;
  padding: 2.25rem 1.5rem;
  border: 1px dashed var(--line-strong);
  border-radius: var(--radius);
  background: transparent;
  text-align: center;
  cursor: pointer;
  transition:
    border-color 0.2s var(--ease),
    background 0.2s var(--ease);
}

.dropzone:hover,
.dropzone--active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 6%, transparent);
}

.dropzone--filled {
  border-style: solid;
}
</style>
