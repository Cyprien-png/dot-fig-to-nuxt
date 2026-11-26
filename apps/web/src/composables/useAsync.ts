import { ref, type Ref } from 'vue'

export interface AsyncState<T> {
  data: Ref<T | undefined>
  error: Ref<string>
  loading: Ref<boolean>
  /** Runs the loader again, keeping the previous data on screen meanwhile. */
  reload: () => Promise<void>
}

/** Tracks the data, error and loading state of an async loader. */
export function useAsync<T>(loader: () => Promise<T>): AsyncState<T> {
  const data = ref<T>() as Ref<T | undefined>
  const error = ref('')
  const loading = ref(false)

  async function reload() {
    loading.value = true
    try {
      data.value = await loader()
      error.value = ''
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
      loading.value = false
    }
  }

  return { data, error, loading, reload }
}
