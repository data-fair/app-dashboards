/**
 * Pure helpers for filter values computation and URL building, broadcast to
 * d-frame embeds and values-labels fetches.
 *
 * Extracted from `dashboard-filters.vue`, `useFilterState` and
 * `useFiltersValues` to be testable in isolation.
 */
import type { Field } from '@data-fair/lib-common-types/application/index.js'
import { filters2params } from '@data-fair/lib-utils/filters/index.js'
import type { DashboardConfig, DashboardFilter, DashboardStaticFilter } from '@/config'
import { datasetFilterKey, conceptFilterKey } from './dataset-filter'
import { normalizeStaticFilters } from './staticFilters'

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

/**
 * A dynamic filter rendered as a range slider (numeric fields only).
 * The selection is stored as `_gte` / `_lte` bounds instead of a `_in` list.
 */
export const isRangeFilter = (filter: DashboardFilter): boolean => !!filter.slider

export interface SerializeFiltersValuesInput {
  /** Fields whose resolved values are broadcast (`_d_<datasetId>_<f>_in` + concept mirror). */
  emitFields: string[]
  /** Active filter fields, stored under `result.keys`. */
  activeFields: string[]
  /** Resolved values per emitted field (already fetched from `/values/`). */
  resolvedValues: Record<string, string[]>
  /** Bounds per range-slider field (`_d_<datasetId>_<f>_gte/_lte` + concept mirror). */
  rangeValues?: Record<string, { min?: string; max?: string }>
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
  const { emitFields, activeFields, resolvedValues, rangeValues, fields, config, prefix, datasetId, finalizedAt, period, geoDistance } = input
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

  for (const [field, bounds] of Object.entries(rangeValues || {})) {
    const concept = fieldConcept(fields[field])
    if (bounds.min) {
      result[`${prefix}_d_${datasetId}_${field}_gte`] = bounds.min
      if (concept) result[conceptFilterKey(concept, 'gte')] = bounds.min
    }
    if (bounds.max) {
      result[`${prefix}_d_${datasetId}_${field}_lte`] = bounds.max
      if (concept) result[conceptFilterKey(concept, 'lte')] = bounds.max
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
    const key = datasetFilterKey(datasetId, f.labelField, prefix)
    if (params[key]) {
      result.push(f.labelField)
    } else if (isRangeFilter(f)) {
      // A range filter is active when either bound is set in the URL.
      const gte = datasetFilterKey(datasetId, f.labelField, prefix, 'gte')
      const lte = datasetFilterKey(datasetId, f.labelField, prefix, 'lte')
      if (params[gte] || params[lte]) result.push(f.labelField)
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
    // Range sliders emit raw numeric bounds (`_gte`/`_lte`), no `/values/` resolution needed.
    if (isRangeFilter(f)) continue
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
/**
 * REST op suffixes produced by `filters2params`, ordered longest-first so the
 * split is unambiguous (`field_nexists` ends with `_exists` too, `field_nin`
 * with `_in`, etc.).
 */
const STATIC_FILTER_OPS = ['_nexists', '_starts', '_exists', '_nin', '_lte', '_gte', '_in'] as const

const splitFilterParam = (key: string): [field: string, op: string] | null => {
  for (const op of STATIC_FILTER_OPS) {
    if (key.endsWith(op)) return [key.slice(0, -op.length), op.slice(1)]
  }
  return null
}

/**
 * Build the dataset-scoped params for the static filters, mirroring them as
 * concept-aliased keys (`_c_<conceptId>_<op>`) when the field carries a
 * concept, so child visus on a different dataset can read them.
 *
 * The field-level REST keys are produced by `filters2params` from
 * `@data-fair/lib-utils` (canonical type conversion); this function only adds
 * the dataset scope and the concept mirror.
 */
export const collectStaticFilterParams = (
  config: DashboardConfig,
  datasetId: string,
  prefix: string,
  fields: Record<string, Field>
): Record<string, string> => {
  const params: Record<string, string> = {}
  const staticParams = filters2params(normalizeStaticFilters(config.staticFilters))
  for (const [key, value] of Object.entries(staticParams)) {
    const split = splitFilterParam(key)
    if (!split) continue
    const [field, op] = split
    params[`${prefix}_d_${datasetId}_${key}`] = value
    const concept = fieldConcept(fields[field])
    if (concept) params[conceptFilterKey(concept, op as 'in' | 'nin' | 'gte' | 'lte' | 'starts' | 'exists' | 'nexists')] = value
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
    if (isRangeFilter(f)) {
      const gte = params[`${prefix}_d_${datasetId}_${f.labelField}_gte`]
      const lte = params[`${prefix}_d_${datasetId}_${f.labelField}_lte`]
      if (gte != null) query[`${f.labelField}_gte`] = String(gte)
      if (lte != null) query[`${f.labelField}_lte`] = String(lte)
    } else {
      query[`${f.labelField}_in`] = String(params[`${prefix}_d_${datasetId}_${f.labelField}_in`])
    }
  }
  Object.assign(query, filters2params(normalizeStaticFilters(config.staticFilters)))
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

/**
 * URL of the `simple_metrics_agg` endpoint fetching the numeric bounds
 * (min/max) of a range-slider filter's field. The static filters are applied
 * so the bounds are computed on the filtered subset of the filters dataset,
 * consistently with the `/values-labels/` lists and the data queries.
 */
export const buildMetricsUrl = (
  filter: DashboardFilter,
  datasetHref: string | undefined,
  config: DashboardConfig
): string | null => {
  if (!datasetHref) return null
  const query: Record<string, string> = {
    fields: filter.labelField,
    metrics: 'min,max',
    finalizedAt: config.datasets?.[0]?.finalizedAt || ''
  }
  Object.assign(query, filters2params(normalizeStaticFilters(config.staticFilters)))
  return `${datasetHref}/simple_metrics_agg?${new URLSearchParams(query).toString()}`
}

export const sortByLabel = (a: ValueLabel, b: ValueLabel) =>
  (a.label || a.value).localeCompare(b.label || b.value, 'fr', { sensitivity: 'base' })

/**
 * Temporary client-side re-filtering of values lists against the static
 * filters targeting the same field.
 *
 * The `/values-labels/` and `/values/` endpoints aggregate values per
 * document: on a multi-valued field, a document matching the query
 * contributes ALL of its values to the aggregation, including the ones that
 * do not satisfy the field's own static filter. The lists are therefore
 * polluted with out-of-filter values until data-fair filters the buckets
 * per value server-side.
 *
 * TODO: remove this workaround (and its call sites) once the values
 * aggregation is fixed in data-fair.
 */
export const valueMatchesStaticFilters = (
  value: unknown,
  staticFilters: DashboardStaticFilter[] | undefined,
  fieldKey: string
): boolean => {
  if (!staticFilters?.length) return true
  const str = String(value)
  const num = Number(value)
  for (const sf of staticFilters) {
    if (!sf || sf.field !== fieldKey) continue
    if (sf.type === 'in') {
      if (sf.values?.length && !sf.values.includes(str)) return false
    } else if (sf.type === 'nin') {
      if (sf.values?.length && sf.values.includes(str)) return false
    } else if (sf.type === 'starts') {
      if (sf.value && !str.startsWith(sf.value)) return false
    } else if (sf.type === 'interval') {
      const hasMin = ![null, undefined, ''].includes(sf.minValue)
      const hasMax = ![null, undefined, ''].includes(sf.maxValue)
      if (hasMin) {
        const min = sf.minValue as string
        const numeric = !Number.isNaN(num) && !Number.isNaN(Number(min))
        if (numeric ? num < Number(min) : str < min) return false
      }
      if (hasMax) {
        const max = sf.maxValue as string
        const numeric = !Number.isNaN(num) && !Number.isNaN(Number(max))
        if (numeric ? num > Number(max) : str > max) return false
      }
    }
    // exists / notExists: no per-value restriction is possible or needed
    // (the aggregation only returns existing values, and the notExists
    // subset has none).
  }
  return true
}

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
        values.unshift({ value: v, label: v })
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
  reactiveSearchParams: ReactiveParams,
  prefix = ''
): void => {
  for (const filter of filters || []) {
    if (isRangeFilter(filter)) {
      // A range slider's startValue is a `min,max` pair written to the `_gte`/`_lte` keys.
      if (!filter.startValue) continue
      const [min, max] = filter.startValue.split(',')
      if (min !== undefined && min !== '') {
        const gte = datasetFilterKey(datasetId || '', filter.labelField, prefix, 'gte')
        if (!reactiveSearchParams[gte]) reactiveSearchParams[gte] = min
      }
      if (max !== undefined && max !== '') {
        const lte = datasetFilterKey(datasetId || '', filter.labelField, prefix, 'lte')
        if (!reactiveSearchParams[lte]) reactiveSearchParams[lte] = max
      }
    } else {
      const key = datasetFilterKey(datasetId || '', filter.labelField, prefix)
      if (!reactiveSearchParams[key] && filter.startValue) {
        reactiveSearchParams[key] = filter.multipleValues
          ? JSON.stringify([filter.startValue]).slice(1, -1)
          : filter.startValue
      }
    }
  }
}

export { datasetFilterKey }
