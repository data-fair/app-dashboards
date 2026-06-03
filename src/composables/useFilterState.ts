/**
 * Per-filter state (items, loading, value, search) for a single dynamic filter.
 *
 * Extracted from `dashboard-filters.vue`. Manages its own `useFetch`,
 * search debouncing and value synchronization with `reactiveSearchParams`.
 */
import { computed, effectScope, ref, watch, type Ref, type EffectScope } from 'vue'
import { useFetch } from '@data-fair/lib-vue/fetch.js'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import type { DashboardConfig, DashboardFilter } from '@/config'
import { datasetFilterKey } from '@/utils/dataset-filter'

export interface UseFilterStateOptions {
  filter: DashboardFilter
  prefix: string
  datasetId: Ref<string | undefined>
  config: Ref<DashboardConfig>
  /** Optional reactive address (used by geo filters) */
  address?: Ref<{ lon: number; lat: number } | undefined>
}

export interface FilterStateApi {
  items: Ref<string[]>
  loading: Ref<boolean>
  value: Ref<string | string[] | undefined>
  searchItems: (search?: string) => void
}

const buildUrl = (
  filter: DashboardFilter,
  datasetId: Ref<string | undefined>,
  config: Ref<DashboardConfig>,
  prefix: string,
  search: Ref<string | undefined>,
  address?: Ref<{ lon: number; lat: number } | undefined>
): string | null => {
  const dataset = datasetId.value
  if (!dataset) return null
  const otherFilters = (config.value.filters || [])
    .filter(f => f.labelField !== filter.labelField && reactiveSearchParams[`${prefix}_d_${dataset}_${f.labelField}_in`])

  const params: Record<string, string> = {
    finalizedAt: '',
    stringify: 'true'
  }
  for (const f of otherFilters) {
    params[`${f.labelField}_in`] = String(reactiveSearchParams[`${prefix}_d_${dataset}_${f.labelField}_in`])
  }
  for (const sf of (config.value.staticFilters || [])) {
    if (sf.type === 'in') params[`${sf.field}_in`] = sf.values?.join(',') || ''
    else if (sf.type === 'interval') {
      if (sf.minValue != null) params[`${sf.field}_gte`] = String(sf.minValue)
      if (sf.maxValue != null) params[`${sf.field}_lte`] = String(sf.maxValue)
    }
  }
  if (!filter.showAllValues) {
    if (search.value != null) params.q = search.value + '*'
  } else {
    params.size = '1000'
  }
  if (config.value.periodFilter) {
    params._c_date_match = String(reactiveSearchParams.period || '')
  }
  if (config.value.addressFilter && address?.value && reactiveSearchParams.radius) {
    params._c_geo_distance = `${address.value.lon},${address.value.lat},${Number(reactiveSearchParams.radius) * 1000}`
  }
  return `/api/v1/datasets/${dataset}/values/${filter.labelField}?${new URLSearchParams(params).toString()}`
}

export const useFilterState = (opts: UseFilterStateOptions): FilterStateApi => {
  const { filter, prefix, datasetId, config, address } = opts
  const search = ref<string | undefined>(undefined)
  const scope: EffectScope = effectScope()

  const url = computed(() => buildUrl(filter, datasetId, config, prefix, search, address))
  const { data, loading, refresh } = useFetch(() => url.value, { immediate: false })

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
    const values = ((data.value as string[] | null) || [])
    const key = datasetFilterKey(datasetId.value || '', filter.labelField, prefix)
    const filterValue = reactiveSearchParams[key]
    if (filterValue) {
      const fValues = filter.multipleValues ? JSON.parse(`[${filterValue}]`) : [filterValue]
      for (const v of fValues) {
        if (!values.includes(v)) values.unshift(v)
      }
    }
    return [...values].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
  })

  scope.run(() => {
    watch(url, () => refresh(), { immediate: true })
  })

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
