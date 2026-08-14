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

/**
 * Filters values shaped for the native DataFair dataset embed endpoint
 * (`/data-fair/embed/dataset/.../table|form`). Keys are dataset-scoped
 * (`prefix_d_<datasetId>_<field>_in`) so that the embed REST API can apply
 * them on the right dataset.
 */
export interface FiltersValues { [key: string]: any; keys: string[] }

/**
 * Filters values shaped for an embedded application (`/data-fair/app/...`).
 *
 * Applications receive the full `FiltersValues` object, with dataset-scoped
 * keys preserved (`<prefix>_d_<datasetId>_<field>_in`, etc.) so the
 * application can decide which ones apply to its own dataset and ignore
 * the rest.
 */
export interface ApplicationFiltersValues { [key: string]: any }

export type DatasetFiltersValues = FiltersValues

export const fieldConcept = (field: Field | undefined): string | undefined => {
  return field?.['x-concept']?.id as string | undefined
}

export interface SerializeFiltersValuesInput {
  /** Fields whose resolved values are broadcast (`_d_<datasetId>_<f>_in` + concept mirror). */
  emitFields: string[]
  /** Active filter fields, stored under `result.keys`. */
  activeFields: string[]
  /** Resolved values per emitted field (already fetched from `/values/`). */
  resolvedValues: Record<string, string[]>
  fields: Record<string, Field>
  config: DashboardConfig
  prefix: string
  datasetId: string
  finalizedAt?: string
  period?: string
  geoDistance?: string
}

/**
 * Build the `FiltersValues` object broadcast to embeds: resolved dynamic
 * filter values (dataset-scoped keys + concept mirror), period, geo
 * distance and static filters. Pure and testable in isolation.
 */
export const serializeFiltersValues = (input: SerializeFiltersValuesInput): FiltersValues => {
  const { emitFields, activeFields, resolvedValues, fields, config, prefix, datasetId, finalizedAt, period, geoDistance } = input
  const result: FiltersValues = { keys: activeFields }

  for (const f of emitFields) {
    const values = resolvedValues[f]
    if (values) {
      const serialized = JSON.stringify(values).slice(1, -1)
      result[`${prefix}_d_${datasetId}_${f}_in`] = serialized
      // Mirror as a concept-aliased key for child visus on a different
      // dataset. Only emit when the field carries a concept — filters
      // without a concept are not cross-dataset translatable.
      const concept = fieldConcept(fields[f])
      if (concept) {
        result[conceptFilterKey(concept, 'in')] = serialized
      }
    }
  }

  if (config.periodFilter && period) {
    result._c_date_match = period
  }
  if (config.addressFilter && geoDistance) {
    result._c_geo_distance = geoDistance
  }
  Object.assign(result, collectStaticFilterParams(config, datasetId, prefix, fields))
  // Always emitted (even empty): embeds cache their dataset version on it.
  result.finalizedAt = finalizedAt || ''

  return result
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
 * Fields whose values must be resolved for the given filters: either the
 * filter's value-association fields (`values`) or its label field,
 * deduplicated in declaration order.
 */
export const collectFilterEmitFields = (filters: DashboardFilter[]): string[] => {
  const result: string[] = []
  for (const f of filters) {
    const fields = f.values?.length ? f.values : [f.labelField]
    for (const field of fields) {
      if (!result.includes(field)) result.push(field)
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
