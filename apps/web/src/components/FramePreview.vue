<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    src: string
    title: string
    /** Width the page was designed (or should be viewed) at; it is scaled down to fit. */
    width: number
    /** Aspect ratio of the visible window, as `width / height`. */
    ratio?: number
    /** Reference renders are untrusted design content; a built site needs its scripts. */
    sandboxed?: boolean
  }>(),
  { ratio: 16 / 10, sandboxed: true },
)

const box = ref<HTMLElement>()
const boxWidth = ref(0)
const scale = computed(() => (boxWidth.value ? Math.min(1, boxWidth.value / props.width) : 1))
const frameHeight = computed(() => boxWidth.value / props.ratio / scale.value)

let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(([entry]) => (boxWidth.value = entry?.contentRect.width ?? 0))
  if (box.value) observer.observe(box.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div ref="box" class="preview" :style="{ aspectRatio: String(ratio) }">
    <iframe
      v-if="boxWidth"
      :src="src"
      :title="title"
      loading="lazy"
      :sandbox="sandboxed ? '' : 'allow-scripts allow-same-origin'"
      :style="{ width: `${width}px`, height: `${frameHeight}px`, transform: `scale(${scale})` }"
    />
  </div>
</template>

<style scoped>
.preview {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: #fff;
}

.preview iframe {
  position: absolute;
  top: 0;
  left: 0;
  border: 0;
  transform-origin: 0 0;
}
</style>
