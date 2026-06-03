/**
 * Pure helpers to compute the filter values broadcast to d-frame embeds.
 *
 * Extracted from `dashboard-filters.vue` to be testable in isolation.
 */
import type { DashboardConfig, DashboardFilter, DashboardStaticFilter } from '@/config'
import { datasetFilterKey } from './dataset-filter'

export interface ReactiveParams { [key: string]: any }

export interface FiltersValues {
  [key: string]: any
  keys: string[]
}

export interface ComputeContext {
  config: DashboardConfig
  datasetId: string | undefined
  reactiveSearchParams: ReactiveParams
  prefix: string
  address?: { lon: number; lat: number }
}

const staticFilterPairs = (sf: DashboardStaticFilter, datasetId: string | undefined, prefix: string): Array<[string, string]> => {
  const base = `${prefix}${datasetId ? `_d_${datasetId}_` : ''}${sf.field}`
  switch (sf.type) {
    case 'in':
      return [[`${base}_in`, sf.values?.join(',') || '']]
    case 'nin':
      return [[`${base}_nin`, sf.values?.join(',') || '']]
    case 'interval': {
      const pairs: Array<[string, string]> = []
      if (sf.minValue != null) pairs.push([`${base}_gte`, String(sf.minValue)])
      if (sf.maxValue != null) pairs.push([`${base}_lte`, String(sf.maxValue)])
      return pairs
    }
    default:
      return []
  }
}

/**
 * Compute the values broadcast to embeds for the current filter selection.
 * Exported as a pure helper so the computation can be tested and reused.
 */
export const computeFiltersValues = (ctx: ComputeContext): FiltersValues => {
  const { config, datasetId, reactiveSearchParams, prefix, address } = ctx
  const datasetPrefix = datasetId ? `_d_${datasetId}_` : ''
  const result: FiltersValues = { keys: [] }
  const filters = (config.filters || []) as DashboardFilter[]
  const active = filters.filter(f => reactiveSearchParams[`${prefix}${datasetPrefix}${f.labelField}_in`])

  for (const f of active) result.keys.push(f.labelField)

  if (config.periodFilter && reactiveSearchParams.period) {
    result._c_date_match = reactiveSearchParams.period
  }
  if (config.addressFilter && address && reactiveSearchParams.radius) {
    result._c_geo_distance = `${address.lon},${address.lat},${Number(reactiveSearchParams.radius) * 1000}`
  }

  for (const sf of (config.staticFilters || []) as DashboardStaticFilter[]) {
    for (const [k, v] of staticFilterPairs(sf, datasetId, prefix)) {
      result[k] = v
    }
  }

  return result
}

/**
 * Initialize default filter values from the configuration into the reactive search params,
 * using the dataset-scoped key pattern.
 */
export const initDefaultFilterValues = (
  filters: DashboardFilter[] | undefined,
  datasetId: string | undefined,
  reactiveSearchParams: ReactiveParams
): void => {
  for (const filter of filters || []) {
    const key = datasetFilterKey(datasetId || '', filter.labelField)
    if (!reactiveSearchParams[key] && filter.startValue) {
      reactiveSearchParams[key] = filter.multipleValues
        ? JSON.stringify([filter.startValue]).slice(1, -1)
        : filter.startValue
    }
  }
}

export { datasetFilterKey }
