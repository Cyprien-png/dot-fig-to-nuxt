<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

const props = defineProps<{ open: boolean; title: string }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()

// The native <dialog> gives focus trapping, Escape handling and a backdrop for free.
function sync() {
  if (props.open && !dialog.value?.open) dialog.value?.showModal()
  if (!props.open && dialog.value?.open) dialog.value.close()
}
watch(() => props.open, sync)
onMounted(sync)
</script>

<template>
  <dialog ref="dialog" class="dialog" @close="emit('close')" @click.self="emit('close')">
    <div class="dialog__body">
      <header class="dialog__head">
        <h2 class="dialog__title display">{{ title }}</h2>
        <button type="button" class="dialog__close" aria-label="Close" @click="emit('close')">×</button>
      </header>
      <slot />
    </div>
  </dialog>
</template>

<style scoped>
.dialog {
  width: min(560px, calc(100vw - 2rem));
  margin: auto;
  padding: 0;
  border: 1px solid var(--line-strong);
  border-radius: 20px;
  background: var(--surface);
  color: var(--text);
}

.dialog::backdrop {
  background: rgb(0 0 0 / 70%);
  backdrop-filter: blur(6px);
}

.dialog[open] {
  animation: rise 0.35s var(--ease);
}

.dialog__body {
  display: grid;
  gap: 1.5rem;
  padding: 2rem;
}

.dialog__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.dialog__title {
  font-size: 2.4rem;
}

.dialog__close {
  width: 36px;
  height: 36px;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: transparent;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.dialog__close:hover {
  border-color: var(--text);
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.98);
  }
}
</style>
