/**
 * Per-filter state (items, loading, value, search) for a single dynamic filter.
 *
 * Extracted from `dashboard-filters.vue`. Manages its own `useFetch`,
 * search debouncing and value synchronization with `reactiveSearchParams`.
 *
 * Items are `{value, label}` objects fetched from the dataset's
 * `/values-labels/` endpoint, so the front-end never has to resolve labels
 * from the schema's `x-labels` mapping.
 */
import { computed, ref, watch, type Ref } from 'vue'
import { useFetch } from '@data-fair/lib-vue/fetch.js'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import type { DashboardConfig, DashboardFilter } from '@/config'
import { datasetFilterKey } from '@/utils/dataset-filter'
import { buildValuesLabelsUrl, mergeAndSortItems, type ValueLabel } from '@/utils/filters'

export interface UseFilterStateOptions {
  filter: DashboardFilter
  prefix: string
  datasetId: Ref<string | undefined>
  datasetHref: Ref<string | undefined>
  config: Ref<DashboardConfig>
  /** Optional reactive address (used by geo filters) */
  address?: Ref<{ lon: number; lat: number } | undefined>
}

export interface FilterStateApi {
  items: Ref<ValueLabel[]>
  loading: Ref<boolean>
  value: Ref<string | string[] | undefined>
  searchItems: (search?: string) => void
}

export const useFilterState = (opts: UseFilterStateOptions): FilterStateApi => {
  const { filter, prefix, datasetId, datasetHref, config, address } = opts
  const search = ref<string | undefined>(undefined)

  const url = computed(() => buildValuesLabelsUrl(filter, datasetId.value, datasetHref.value, config.value, prefix, search.value, address?.value, reactiveSearchParams))
  // `watch: false` to avoid a duplicate watcher; we install our own below so
  // the effect is owned by the effect scope created in dashboard-filters.vue
  // and disposed when the configured filters change.
  const { data, loading, refresh } = useFetch(() => url.value, { watch: false })

  const value = computed({
    get () {
      const key = datasetFilterKey(datasetId.value || '', filter.labelField, prefix)
      const raw = reactiveSearchParams[key]
      if (raw) {
        return filter.multipleValues ? JSON.parse(`[${raw}]`) : raw
      }
      return filter.multipleValues ? [] : undefined
    },
    set (val: string | string[] | undefined) {
      const key = datasetFilterKey(datasetId.value || '', filter.labelField, prefix)
      if (filter.multipleValues && Array.isArray(val) && val.length) {
        reactiveSearchParams[key] = JSON.stringify(val).slice(1, -1)
      } else if (!filter.multipleValues && val) {
        reactiveSearchParams[key] = val as string
      } else {
        delete reactiveSearchParams[key]
      }
    }
  })

  const items = computed(() => {
    const key = datasetFilterKey(datasetId.value || '', filter.labelField, prefix)
    return mergeAndSortItems(data.value as ValueLabel[] | null, reactiveSearchParams[key], filter.multipleValues)
  })

  // Fetch initial + refetch on URL change. Must be created inside the effect
  // scope owned by dashboard-filters.vue so it is properly disposed when the
  // configured filters change.
  watch(url, () => refresh(), { immediate: true })

  return {
    items,
    loading,
    value,
    searchItems: (searchTerm?: string) => {
      search.value = searchTerm
      refresh()
    }
  }
}
