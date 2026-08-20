/**
 * Per-filter state (items, loading, value, search) for a single dynamic filter.
 *
 * Extracted from `dashboard-filters.vue`. Manages its own `useFetch`,
 * search debouncing and value synchronization with `reactiveSearchParams`.
 *
 * Items are `{value, label}` objects fetched from the dataset's
 * `/values-labels/` endpoint, so the front-end never has to resolve labels
 * from the schema's `x-labels` mapping.
 *
 * When the filter is configured as a range slider (`slider: true`), the
 * state switches to a numeric range mode: bounds (min/max) are fetched in a
 * single `simple_metrics_agg` call and the value is a `[min, max]` pair stored
 * in the URL as `_gte` / `_lte` keys.
 */
import { computed, ref, toValue, watch, type Ref } from 'vue'
import { useDebounce } from '@vueuse/core'
import { useFetch } from '@data-fair/lib-vue/fetch.js'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import type { DashboardConfig, DashboardFilter } from '@/config'
import { datasetFilterKey } from '@/utils/dataset-filter'
import { buildValuesLabelsUrl, isRangeFilter, mergeAndSortItems, type ValueLabel } from '@/utils/filters'

export interface UseFilterStateOptions {
  /**
   * The configured filter. A getter (`() => props.filter`) or a Ref is
   * required for draft hot-reloads to rewire the internal computeds when the
   * filter object is replaced (e.g. toggling `slider`). A plain object is
   * accepted for one-shot setups (tests).
   */
  filter: DashboardFilter | (() => DashboardFilter) | Ref<DashboardFilter>
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
  value: Ref<string | string[] | [number, number] | undefined>
  searchItems: (search?: string) => void
  /** Range-slider mode: min/max bounds, step and bounds loading (undefined for select filters). */
  min: Ref<number | undefined>
  max: Ref<number | undefined>
  /** Range-slider mode: min/max snapped to the step grid (undefined for select filters). */
  sliderMin: Ref<number | undefined>
  sliderMax: Ref<number | undefined>
  step: Ref<number>
  boundsLoading: Ref<boolean>
  /** Range-slider mode: number of decimals to display and a formatter for thumb labels. */
  decimals: Ref<number>
  formatValue: (v: number) => string
}

export const useFilterState = (opts: UseFilterStateOptions): FilterStateApi => {
  const { prefix, datasetId, datasetHref, config, address } = opts
  // The filter prop must stay reactive: a draft config change (set-config)
  // replaces the filter objects, and toggling `slider` (select → range or the
  // reverse) must rewire all the computeds below. A plain value would freeze
  // the initial object and break that reactivity, so the caller passes a
  // getter/Ref and we normalize it with `toValue`.
  const filter = computed(() => toValue(opts.filter))

  const isRange = computed(() => isRangeFilter(filter.value))

  // Range-slider mode: fetch the field bounds (min/max) in a single request.
  const metricsUrl = computed(() => {
    if (!datasetId.value || !datasetHref.value || !isRange.value) return null
    const query = new URLSearchParams({
      fields: filter.value.labelField,
      metrics: 'min,max',
      finalizedAt: config.value.datasets?.[0]?.finalizedAt || ''
    })
    return `${datasetHref.value}/simple_metrics_agg?${query.toString()}`
  })
  const { data: metrics, loading: boundsLoading, refresh: refreshMetrics } = useFetch(() => metricsUrl.value, { watch: false })

  const bounds = computed(() => {
    const m = metrics.value as { metrics?: Record<string, { min?: number; max?: number }> } | null
    return m?.metrics?.[filter.value.labelField]
  })
  const min = computed<number | undefined>(() => bounds.value?.min)
  const max = computed<number | undefined>(() => bounds.value?.max)

  // Nice step candidates, descending. The slider step is the largest "round"
  // value that does not exceed 1/100th of the value range, so the thumb labels
  // stay clean (e.g. 0.1, 0.2, 0.5, 1, 2, 5, 10…) instead of raw 0.222….
  const STEP_CANDIDATES = [10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01]
  const step = computed(() => {
    if (min.value == null || max.value == null) return 1
    const diff = max.value - min.value
    if (diff <= 0) return 1
    const rawStep = diff / 100
    return STEP_CANDIDATES.find(c => c <= rawStep) ?? 0.01
  })

  // Snap the bounds to the step grid so the thumbs align on clean values:
  // the slider rounds to `min + n*step` (offset = min % step), so with a raw
  // min of 0.2 and step 0.5 a selection of 5/60 would display as 5.2/60.2.
  // Flooring/ceiling the bounds to a multiple of the step anchors the grid on
  // 0 (0, 0.5, 1, …) and keeps the URL values unshifted.
  const sliderMin = computed<number | undefined>(() =>
    min.value == null ? undefined : Math.floor(min.value / step.value) * step.value)
  const sliderMax = computed<number | undefined>(() =>
    max.value == null ? undefined : Math.ceil(max.value / step.value) * step.value)

  // Number of decimals to display, derived from the step magnitude.
  const decimals = computed(() => {
    const s = step.value
    if (s >= 1) return 0
    if (s >= 0.1) return 1
    if (s >= 0.01) return 2
    return 3
  })

  // Format a value for the slider thumb labels (rounded to the relevant
  // precision, trailing ".0" stripped so 5.0 displays as "5").
  const formatValue = (v: number): string => String(parseFloat(v.toFixed(decimals.value)))

  // Range-slider value: [min, max] stored as `_gte` / `_lte` URL keys.
  const rangeValue = computed<[number, number] | undefined>({
    get () {
      const gteKey = datasetFilterKey(datasetId.value || '', filter.value.labelField, prefix, 'gte')
      const lteKey = datasetFilterKey(datasetId.value || '', filter.value.labelField, prefix, 'lte')
      const gte = reactiveSearchParams[gteKey]
      const lte = reactiveSearchParams[lteKey]
      if (gte == null && lte == null) return undefined
      return [Number(gte ?? sliderMin.value ?? 0), Number(lte ?? sliderMax.value ?? 0)]
    },
    set (val) {
      const gteKey = datasetFilterKey(datasetId.value || '', filter.value.labelField, prefix, 'gte')
      const lteKey = datasetFilterKey(datasetId.value || '', filter.value.labelField, prefix, 'lte')
      if (val) {
        reactiveSearchParams[gteKey] = String(val[0])
        reactiveSearchParams[lteKey] = String(val[1])
      } else {
        delete reactiveSearchParams[gteKey]
        delete reactiveSearchParams[lteKey]
      }
    }
  })

  // A filter only ever uses one URL key family: `_in` for a select, `_gte`/`_lte`
  // for a range slider. When the configured mode changes (draft hot reload),
  // drop the stale keys of the other mode so the URL and the embeds stay
  // coherent instead of keeping orphan params.
  watch(isRange, (range) => {
    const inKey = datasetFilterKey(datasetId.value || '', filter.value.labelField, prefix)
    const gteKey = datasetFilterKey(datasetId.value || '', filter.value.labelField, prefix, 'gte')
    const lteKey = datasetFilterKey(datasetId.value || '', filter.value.labelField, prefix, 'lte')
    if (range) {
      delete reactiveSearchParams[inKey]
    } else {
      delete reactiveSearchParams[gteKey]
      delete reactiveSearchParams[lteKey]
    }
  })

  // Select mode: debounced search feeding the contextual values-labels URL.
  const searchInput = ref<string | undefined>(undefined)
  const search = useDebounce(searchInput, 300)

  const url = computed(() => {
    if (isRange.value) return null
    return buildValuesLabelsUrl(filter.value, datasetId.value, datasetHref.value, config.value, prefix, search.value, address?.value, reactiveSearchParams)
  })
  // `watch: false` to avoid a duplicate watcher; we install our own below so
  // the effect is owned by the effect scope created in dashboard-filters.vue
  // and disposed when the configured filters change.
  const { data, loading, refresh } = useFetch(() => url.value, { watch: false })

  const value = computed({
    get () {
      if (isRange.value) return rangeValue.value
      const key = datasetFilterKey(datasetId.value || '', filter.value.labelField, prefix)
      const raw = reactiveSearchParams[key]
      if (raw) {
        return filter.value.multipleValues ? JSON.parse(`[${raw}]`) : raw
      }
      return filter.value.multipleValues ? [] : undefined
    },
    set (val: string | string[] | [number, number] | undefined) {
      if (isRange.value) {
        rangeValue.value = val as [number, number] | undefined
        return
      }
      const key = datasetFilterKey(datasetId.value || '', filter.value.labelField, prefix)
      if (filter.value.multipleValues && Array.isArray(val) && val.length) {
        reactiveSearchParams[key] = JSON.stringify(val).slice(1, -1)
      } else if (!filter.value.multipleValues && val) {
        reactiveSearchParams[key] = val as string
      } else {
        delete reactiveSearchParams[key]
      }
    }
  })

  const items = computed(() => {
    if (isRange.value) return [] as ValueLabel[]
    const key = datasetFilterKey(datasetId.value || '', filter.value.labelField, prefix)
    return mergeAndSortItems(data.value as ValueLabel[] | null, reactiveSearchParams[key], filter.value.multipleValues)
  })

  // Fetch initial + refetch on URL change. Must be created inside the effect
  // scope owned by dashboard-filters.vue so it is properly disposed when the
  // configured filters change.
  watch(url, () => refresh(), { immediate: true })
  watch(metricsUrl, () => refreshMetrics(), { immediate: true })

  return {
    items,
    loading,
    value,
    searchItems: (searchTerm?: string) => {
      // Just update the debounced search term: the `url` watcher above
      // refetches automatically once the user pauses typing.
      searchInput.value = searchTerm
    },
    min,
    max,
    sliderMin,
    sliderMax,
    step,
    boundsLoading,
    decimals,
    formatValue
  }
}
