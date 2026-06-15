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
import type { Field } from '@data-fair/lib-common-types/application/index.js'
import type { DashboardConfig, DashboardFilter, DashboardStaticFilter } from '@/config'
import { useConfig } from './config'
import { datasetFilterKey, conceptFilterKey } from '@/utils/dataset-filter'

export interface UseFiltersValuesOptions {
  prefix: string
  address: Ref<{ lon: number; lat: number } | undefined>
}

export interface FiltersValues { [key: string]: any; keys: string[] }

/**
 * Filters values shaped for the native DataFair dataset embed endpoint
 * (`/data-fair/embed/dataset/.../table|form`). Keys are dataset-scoped
 * (`prefix_d_<datasetId>_<field>_in`) so that the embed REST API can apply
 * them on the right dataset.
 */
export type DatasetFiltersValues = FiltersValues

/**
 * Filters values shaped for an embedded application (`/data-fair/app/...`).
 *
 * Applications receive the full `FiltersValues` object, with dataset-scoped
 * keys preserved (`<prefix>_d_<datasetId>_<field>_in`, etc.) so the
 * application can decide which ones apply to its own dataset and ignore
 * the rest.
 */
export interface ApplicationFiltersValues { [key: string]: any }

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

const fieldConcept = (field: Field | undefined): string | undefined => {
  return field?.['x-concept']?.id as string | undefined
}

const collectStaticFilterParams = (
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

export const useFiltersValues = (opts: UseFiltersValuesOptions) => {
  const { prefix, address } = opts
  const { config, filters, dataset, fields } = useConfig()
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
          const serialized = JSON.stringify(values[f]).slice(1, -1)
          result[`${prefix}_d_${datasetId}_${f}_in`] = serialized
          // Mirror as a concept-aliased key for child visus on a different
          // dataset. Only emit when the field carries a concept — filters
          // without a concept are not cross-dataset translatable.
          const concept = fieldConcept(fields.value[f])
          if (concept) {
            result[conceptFilterKey(concept, 'in')] = serialized
          }
        }
      }
    }

    if (config.value.periodFilter && reactiveSearchParams.period) {
      result._c_date_match = String(reactiveSearchParams.period)
    }
    if (config.value.addressFilter && address.value && reactiveSearchParams.radius) {
      result._c_geo_distance = `${address.value.lon},${address.value.lat},${Number(reactiveSearchParams.radius) * 1000}`
    }
    Object.assign(result, collectStaticFilterParams(config.value, datasetId, prefix, fields.value))
    result.finalizedAt = dataset.value?.finalizedAt || ''

    emitted.value = result
    lastRefreshedField.value = noFieldUpdate || null
  }

  const { execute, loading, error } = useAsyncAction(recompute, { catch: 'error' })

  // Trigger initial computation and re-run on relevant filter inputs only.
  // Avoid `deep: true` on reactiveSearchParams: d-frame's state-change adapter
  // (see @data-fair/frame's VueReactiveDFrameStateChangeAdapter) rewrites every
  // key on every iframe state-change message, which would otherwise trigger
  // an unbounded fetch loop as the iframe URL drifts.
  watch(
    [
      () => {
        const ds = dataset.value?.id
        if (!ds) return ''
        return (filters.value || [])
          .map(f => reactiveSearchParams[datasetFilterKey(ds, f.labelField, prefix)])
          .join('\u0001')
      },
      () => reactiveSearchParams.period,
      () => reactiveSearchParams.radius
    ],
    () => execute(),
    { immediate: true }
  )

  /**
   * Build the filter object broadcast to an embedded application
   * (`/data-fair/app/...`). The application must scope the parameters to
   * its own dataset, so we keep the dataset prefix on dynamic and static
   * filters (`<prefix>_d_<datasetId>_<field>_in`, etc.). The application
   * is expected to ignore any filter that targets a dataset it does not
   * use.
   *
   * Note: an application that uses a *different* dataset from the
   * dashboard's root will simply drop the prefixed params. This is
   * intentional: it is the only way to forward resolved values (codes
   * resolved from labels via the dataset's `/values/` endpoint) to an
   * app that does not know the dashboard's root dataset id.
   */
  const applicationValues = computed<ApplicationFiltersValues>(() => {
    return { ...emitted.value }
  })

  return {
    values: computed(() => emitted.value),
    applicationValues,
    update: execute,
    loading,
    error,
    lastRefreshedField: computed(() => lastRefreshedField.value)
  }
}
