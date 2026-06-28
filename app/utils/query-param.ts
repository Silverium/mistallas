type SyncedStringQueryParamOptions = {
  trim?: boolean
}

const getQueryStringValue = (value: unknown) => {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0]
  }

  return ''
}

export const useSyncedStringQueryParam = (
  key: string,
  options: SyncedStringQueryParamOptions = {}
) => {
  const route = useRoute()
  const router = useRouter()
  const state = ref('')

  const normalize = (value: string) => options.trim === false ? value : value.trim()

  const readFromRoute = () => {
    state.value = getQueryStringValue(route.query[key])
  }

  watch(
    () => route.query[key],
    () => readFromRoute(),
    { immediate: true }
  )

  watch(state, async (value) => {
    const normalizedValue = normalize(value)
    const currentValue = getQueryStringValue(route.query[key])

    if (normalizedValue === currentValue) {
      return
    }

    const nextQuery: Record<string, (typeof route.query)[string]> = {}

    for (const queryKey in route.query) {
      if (queryKey !== key) {
        nextQuery[queryKey] = route.query[queryKey]
      }
    }

    if (normalizedValue) {
      nextQuery[key] = normalizedValue
    }

    await router.replace({ query: nextQuery })
  })

  return state
}
