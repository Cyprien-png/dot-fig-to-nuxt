<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppDialog from './AppDialog.vue'
import FigDropzone from './FigDropzone.vue'

const props = defineProps<{
  open: boolean
  title: string
  submitLabel: string
  /** Ask for a project name (creation) or only for a file (new design version). */
  withName?: boolean
  submit: (file: File, name: string) => Promise<void>
}>()
const emit = defineEmits<{ close: [] }>()

const name = ref('')
const file = ref<File | null>(null)
const busy = ref(false)
const error = ref('')
const ready = computed(() => Boolean(file.value) && (!props.withName || name.value.trim().length > 0))

watch(
  () => props.open,
  (open) => {
    if (!open) return
    name.value = ''
    file.value = null
    error.value = ''
  },
)
// Suggest the file name as project name: it is what the designer called the file.
watch(file, (picked) => {
  if (picked && !name.value) name.value = picked.name.replace(/\.fig$/i, '')
})

async function onSubmit() {
  if (!file.value || !ready.value) return
  busy.value = true
  error.value = ''
  try {
    await props.submit(file.value, name.value.trim())
    emit('close')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AppDialog :open="open" :title="title" @close="emit('close')">
    <form class="form" @submit.prevent="onSubmit">
      <FigDropzone v-model="file" />
      <label v-if="withName" class="field">
        <span class="eyebrow">Project name</span>
        <input v-model="name" class="field__input" type="text" placeholder="Acme landing" required maxlength="60" />
      </label>
      <slot />
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="form__actions">
        <button type="button" class="btn" @click="emit('close')">Cancel</button>
        <button type="submit" class="btn btn--accent" :disabled="!ready || busy">{{ busy ? 'Working…' : submitLabel }}</button>
      </div>
    </form>
  </AppDialog>
</template>

<style scoped>
.form {
  display: grid;
  gap: 1.25rem;
}

.field {
  display: grid;
  gap: 0.5rem;
}

.field__input {
  height: 46px;
  padding-inline: 1rem;
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  background: var(--bg);
}

.form__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
}
</style>
