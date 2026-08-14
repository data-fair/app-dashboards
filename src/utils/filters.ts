/**
 * Pure helpers for filter values computation and URL building, broadcast to
 * d-frame embeds and values-labels fetches.
 *
 * Extracted from `dashboard-filters.vue`, `useFilterState` and
 * `useFiltersValues` to be testable in isolation.
 */
import type { Field } from '@data-fair/lib-common-types/application/index.js'
import type { DashboardConfig, DashboardFilter, DashboardStaticFilter } from '@/config'
import { datasetFilterKey, conceptFilterKey } from './dataset-filter'

export interface ReactiveParams { [key: string]: any }

export interface ValueLabel {
  value: string
  label?: string
}

export const fieldConcept = (field: Field | undefined): string | undefined => {
  return field?.['x-concept']?.id as string | undefined
}

/**
 * Fields of the dynamic filters that currently have a value in the URL.
 */
export const collectActiveFields = (filters: DashboardFilter[] | undefined, prefix: string, datasetId: string, params: ReactiveParams): string[] => {
  if (!filters) return []
  const result: string[] = []
  for (const f of filters) {
    if (params[datasetFilterKey(datasetId, f.labelField, prefix)]) {
      result.push(f.labelField)
    }
  }
  return result
}

/**
 * Build the dataset-scoped params for the static filters, mirroring them as
 * concept-aliased keys (`_c_<conceptId>_<op>`) when the field carries a
 * concept, so child visus on a different dataset can read them.
 */
export const collectStaticFilterParams = (
  config: DashboardConfig,
  datasetId: string,
  prefix: string,
  fields: Record<string, Field>
): Record<string, string> => {
  const params: Record<string, string> = {}
  for (const sf of (config.staticFilters || []) as DashboardStaticFilter[]) {
    const base = `${prefix}_d_${datasetId}_${sf.field}`
    const concept = fieldConcept(fields[sf.field])
    if (sf.type === 'in') {
      const v = sf.values?.join(',') || ''
      params[`${base}_in`] = v
      if (concept) params[conceptFilterKey(concept, 'in')] = v
    } else if (sf.type === 'nin') {
      const v = sf.values?.join(',') || ''
      params[`${base}_nin`] = v
      if (concept) params[conceptFilterKey(concept, 'nin')] = v
    } else if (sf.type === 'interval') {
      if (sf.minValue != null) {
        const v = String(sf.minValue)
        params[`${base}_gte`] = v
        if (concept) params[conceptFilterKey(concept, 'gte')] = v
      }
      if (sf.maxValue != null) {
        const v = String(sf.maxValue)
        params[`${base}_lte`] = v
        if (concept) params[conceptFilterKey(concept, 'lte')] = v
      }
    }
  }
  return params
}

/**
 * URL of the `/values-labels/<field>` endpoint feeding a dynamic filter's
 * autocomplete, with the other active filters and static filters applied so
 * the list is contextual.
 */
export const buildValuesLabelsUrl = (
  filter: DashboardFilter,
  datasetId: string | undefined,
  datasetHref: string | undefined,
  config: DashboardConfig,
  prefix: string,
  search: string | undefined,
  address: { lon: number; lat: number } | undefined,
  params: ReactiveParams
): string | null => {
  if (!datasetId || !datasetHref) return null
  const otherFilters = (config.filters || [])
    .filter(f => f.labelField !== filter.labelField && params[`${prefix}_d_${datasetId}_${f.labelField}_in`])

  const query: Record<string, string> = {
    finalizedAt: '',
    stringify: 'true'
  }
  for (const f of otherFilters) {
    query[`${f.labelField}_in`] = String(params[`${prefix}_d_${datasetId}_${f.labelField}_in`])
  }
  for (const sf of (config.staticFilters || [])) {
    if (sf.type === 'in') query[`${sf.field}_in`] = sf.values?.join(',') || ''
    else if (sf.type === 'nin') query[`${sf.field}_nin`] = sf.values?.join(',') || ''
    else if (sf.type === 'interval') {
      if (sf.minValue != null) query[`${sf.field}_gte`] = String(sf.minValue)
      if (sf.maxValue != null) query[`${sf.field}_lte`] = String(sf.maxValue)
    }
  }
  if (!filter.showAllValues) {
    if (search != null) query.q = search + '*'
  } else {
    query.size = '1000'
  }
  if (config.periodFilter) {
    query._c_date_match = String(params.period || '')
  }
  if (config.addressFilter && address && params.radius) {
    query._c_geo_distance = `${address.lon},${address.lat},${Number(params.radius) * 1000}`
  }
  return `${datasetHref}/values-labels/${filter.labelField}?${new URLSearchParams(query).toString()}`
}

export const sortByLabel = (a: ValueLabel, b: ValueLabel) =>
  (a.label || a.value).localeCompare(b.label || b.value, 'fr', { sensitivity: 'base' })

/**
 * Merge the values currently selected in the URL into the fetched
 * values-labels list (they may not be part of the fetched page) and sort by
 * label.
 */
export const mergeAndSortItems = (
  data: ValueLabel[] | null | undefined,
  filterValue: string | undefined,
  multipleValues: boolean | undefined
): ValueLabel[] => {
  const values = [...((data as ValueLabel[] | null) || [])]
  if (filterValue) {
    const fValues = multipleValues ? JSON.parse(`[${filterValue}]`) : [filterValue]
    for (const v of fValues) {
      if (!values.some(item => item.value === v)) {
        values.unshift({ value: v })
      }
    }
  }
  return values.sort(sortByLabel)
}

/**
 * Resolve the missing mandatory filters of an element into human-readable
 * field labels (used by the "Filtre requis" blocking message).
 */
export const computeMandatoryFilterIssues = (
  element: { valueMandatory?: boolean; mandatoryFilters?: string[] },
  filtersKeys: string[] | undefined,
  fields: Record<string, Field>
): string[] => {
  if (!element.valueMandatory) return []
  return (element.mandatoryFilters || [])
    .filter(f => !filtersKeys?.includes(f))
    .map(f => {
      const field = fields[f]
      return (field?.label as string | undefined) || field?.title || field?.['x-originalName'] || f
    })
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
