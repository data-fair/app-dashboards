/**
 * Aggregate the current filter selection into the `FiltersValues` object that
 * is broadcast to d-frame embeds.
 *
 * Extracted from `dashboard-filters.vue` (the `useAsyncAction` block).
 */
import { computed, ref, watch, type Ref } from 'vue'
import { ofetch } from 'ofetch'
import { useAsyncAction } from '@data-fair/lib-vue/async-action.js'
import reactiveSearchParams from '@data-fair/lib-vue/reactive-search-params-global.js'
import type { DashboardConfig, DashboardFilter, DashboardStaticFilter } from '@/config'
import { useConfig } from './config'
import { datasetFilterKey } from '@/utils/dataset-filter'

export interface UseFiltersValuesOptions {
  prefix: string
  address: Ref<{ lon: number; lat: number } | undefined>
}

export interface FiltersValues { [key: string]: any; keys: string[] }

const collectActiveFields = (filters: DashboardFilter[] | undefined, prefix: string, datasetId: string): string[] => {
  if (!filters) return []
  const result: string[] = []
  for (const f of filters) {
    if (reactiveSearchParams[datasetFilterKey(datasetId, f.labelField, prefix)]) {
      result.push(f.labelField)
    }
  }
  return result
}

const collectStaticFilterParams = (config: DashboardConfig, datasetId: string, prefix: string): Record<string, string> => {
  const params: Record<string, string> = {}
  for (const sf of (config.staticFilters || []) as DashboardStaticFilter[]) {
    const base = `${prefix}_d_${datasetId}_${sf.field}`
    if (sf.type === 'in') params[`${base}_in`] = sf.values?.join(',') || ''
    else if (sf.type === 'nin') params[`${base}_nin`] = sf.values?.join(',') || ''
    else if (sf.type === 'interval') {
      if (sf.minValue != null) params[`${base}_gte`] = String(sf.minValue)
      if (sf.maxValue != null) params[`${base}_lte`] = String(sf.maxValue)
    }
  }
  return params
}

export const useFiltersValues = (opts: UseFiltersValuesOptions) => {
  const { prefix, address } = opts
  const { config, filters, dataset } = useConfig()
  const emitted = ref<FiltersValues>({ keys: [] })
  const lastRefreshedField = ref<string | null>(null)

  const recompute = async (noFieldUpdate?: string): Promise<void> => {
    const datasetId = dataset.value?.id
    if (!datasetId) {
      emitted.value = { keys: [] }
      return
    }
    const allFilters = (filters.value || []) as DashboardFilter[]
    const active = allFilters.filter(f => reactiveSearchParams[datasetFilterKey(datasetId, f.labelField, prefix)])

    const result: FiltersValues = { keys: collectActiveFields(allFilters, prefix, datasetId) }

    if (active.length) {
      // Fields to fetch: either the filter's value-association fields or its label field
      const fetchFields = ([] as string[]).concat(
        ...active.map(f => f.values?.length ? f.values : [f.labelField])
      ).filter((f, i, s) => s.indexOf(f) === i)

      const baseParams: Record<string, string> = { finalizedAt: dataset.value?.finalizedAt || '' }
      for (const f of active) {
        baseParams[`${f.labelField}_in`] = String(reactiveSearchParams[datasetFilterKey(datasetId, f.labelField, prefix)])
      }

      const responses = await Promise.all(fetchFields.map(f => {
        const filter = active.find(fwf => fwf.labelField === f || fwf.values?.includes(f))
        if (filter?.values?.length) {
          return ofetch(`${dataset.value!.href}/values/${f}`, { params: baseParams })
        }
        const fv = reactiveSearchParams[datasetFilterKey(datasetId, f, prefix)]
        return filter?.multipleValues ? JSON.parse(`[${fv}]`) : [fv]
      }))

      const values: Record<string, string[]> = {}
      fetchFields.forEach((f, i) => { values[f] = responses[i] })

      for (const f of fetchFields) {
        if (values[f]) {
          result[`${prefix}_d_${datasetId}_${f}_in`] = JSON.stringify(values[f]).slice(1, -1)
        }
      }
    }

    if (config.value.periodFilter && reactiveSearchParams.period) {
      result._c_date_match = String(reactiveSearchParams.period)
    }
    if (config.value.addressFilter && address.value && reactiveSearchParams.radius) {
      result._c_geo_distance = `${address.value.lon},${address.value.lat},${Number(reactiveSearchParams.radius) * 1000}`
    }
    Object.assign(result, collectStaticFilterParams(config.value, datasetId, prefix))

    emitted.value = result
    lastRefreshedField.value = noFieldUpdate || null
  }

  const { execute, loading, error } = useAsyncAction(recompute, { catch: 'error' })

  // Trigger initial computation
  watch([() => reactiveSearchParams, dataset], () => execute(), { deep: true, immediate: true })

  return {
    values: computed(() => emitted.value),
    update: execute,
    loading,
    error,
    lastRefreshedField: computed(() => lastRefreshedField.value)
  }
}
